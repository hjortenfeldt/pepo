"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import type { EventMessageItem, NewMessageAttachment } from "@/lib/event-messages";

/**
 * Delt tråd-UI — bobler + centrerede, neutrale system-"piller" + svar-boks
 * med vedhæftninger. Genbruges af tre helt forskellige overflader (se
 * [[project_event_correspondence_and_system_log]]):
 * 1. Klientens offentlige status/dialog-side (viewerRole="client") — her
 *    filtreres system-beskeder helt væk, de er ALDRIG synlige for klienten.
 * 2. Admins "Eventforespørgsler"-detaljeside (viewerRole="admin").
 * 3. Det generaliserede events egen korrespondance-tråd (viewerRole="admin"),
 *    som også kan indeholde beskeder fra FØR eventet fandtes (samme
 *    event_messages-række, blot fundet via event_id).
 *
 * "Egen" boble (lilla, højrestillet) afgøres af viewerRole vs. m.sender —
 * IKKE af hvem der er logget ind lige nu, så flere admins deler samme
 * venstre/højre-opfattelse af klientens beskeder.
 */

type SendResult = { success: boolean; error?: string };
type UploadResult = { success: true; attachment: NewMessageAttachment } | { success: false; error: string };

export default function CorrespondenceThread({
  messages: initialMessages,
  viewerRole,
  otherPartyLabel,
  selfSenderName,
  placeholder = "Skriv en besked...",
  maxHeightClassName = "max-h-[360px]",
  // Viser en "Nyeste/Ældste øverst"-skifteknap over selve tråden, og skifter
  // som en konsekvens også standard-sorteringen til nyeste øverst — kun sat
  // af EventDeepLinkView.tsx's "Korrespondance"-sektion (Hjorth 2026-08-07).
  // De to øvrige overflader (forespørgselsdetaljen og klientens status-side)
  // beholder bevidst den oprindelige, faste kronologiske rækkefølge.
  enableSortToggle = false,
  onSend,
  onUploadAttachment,
}: {
  messages: EventMessageItem[];
  viewerRole: "admin" | "client";
  otherPartyLabel?: string | null;
  selfSenderName?: string | null;
  placeholder?: string;
  maxHeightClassName?: string;
  enableSortToggle?: boolean;
  onSend: (body: string, attachments: NewMessageAttachment[]) => Promise<SendResult>;
  onUploadAttachment: (file: File) => Promise<UploadResult>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<NewMessageAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Default vendt om til nyeste-øverst, når skifteknappen er slået til —
  // se enableSortToggle-kommentaren ovenfor.
  const [newestFirst, setNewestFirst] = useState(enableSortToggle);

  const selfSender: EventMessageItem["sender"] = viewerRole;
  // Klienten skal ALDRIG se system-beskeder — de er en ren admin-side
  // ændringslog. Admin-visningerne (forespørgsel og event) viser dem alle.
  const chronologicalMessages = viewerRole === "client" ? messages.filter((m) => m.sender !== "system") : messages;
  // `messages` er altid kronologisk stigende (ældste først) internt — se
  // sendReply's append nedenfor — så det er udelukkende VISNINGS-rækkefølgen
  // der vendes om her, aldrig selve datamodellen.
  const visibleMessages = newestFirst ? [...chronologicalMessages].reverse() : chronologicalMessages;

  async function onAttachFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setIsUploading(true);
    for (const file of Array.from(fileList)) {
      const result = await onUploadAttachment(file);
      if (!result.success) {
        setError(result.error ?? "Kunne ikke uploade filen.");
        continue;
      }
      setPendingAttachments((prev) => [...prev, result.attachment]);
    }
    setIsUploading(false);
  }

  function sendReply() {
    const body = reply.trim();
    if (!body && pendingAttachments.length === 0) return;
    setError(null);
    const attachments = pendingAttachments;
    startTransition(async () => {
      const result = await onSend(body, attachments);
      if (!result.success) {
        setError(result.error ?? "Kunne ikke sende beskeden.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          sender: selfSender,
          senderName: selfSenderName ?? null,
          body,
          createdAt: new Date().toISOString(),
          attachments: attachments.map((a, i) => ({ id: `local-att-${i}`, ...a })),
        },
      ]);
      setReply("");
      setPendingAttachments([]);
    });
  }

  return (
    <div>
      {enableSortToggle && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-pepo-t2 hover:text-pepo-t1 px-2 py-1 rounded-md hover:bg-pepo-su transition-colors"
          >
            <Icon name={newestFirst ? "sort-descending" : "sort-ascending"} size={14} />
            {newestFirst ? "Nyeste øverst" : "Ældste øverst"}
          </button>
        </div>
      )}
      <div className={"flex flex-col gap-2.5 mb-4 overflow-y-auto overscroll-contain " + maxHeightClassName}>
        {visibleMessages.length === 0 ? (
          <p className="text-[13px] text-pepo-t3">Ingen beskeder endnu.</p>
        ) : (
          visibleMessages.map((m) =>
            m.sender === "system" ? (
              <div key={m.id} className="flex justify-center py-0.5">
                <div className="max-w-[90%] rounded-full bg-pepo-su text-pepo-t3 text-[12px] px-3.5 py-1.5 text-center leading-snug">
                  <span className="font-medium text-pepo-t2">{m.senderName ?? "Admin"}</span> {m.body}
                  <span className="text-pepo-t3/80"> · {formatMessageTime(m.createdAt)}</span>
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                className={
                  "max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-relaxed " +
                  (m.sender === selfSender ? "self-end bg-pepo-p text-white" : "self-start bg-pepo-su text-pepo-t1")
                }
              >
                <div className={"text-[11px] mb-0.5 " + (m.sender === selfSender ? "text-white/70" : "text-pepo-t3")}>
                  {m.senderName ?? (m.sender === selfSender ? "Dig" : otherPartyLabel ?? (viewerRole === "admin" ? "Klient" : "Virksomheden"))} ·{" "}
                  {formatMessageTime(m.createdAt)}
                </div>
                {m.body && <div>{m.body}</div>}
                {m.attachments.length > 0 && (
                  <div className={"flex flex-col gap-1 " + (m.body ? "mt-1.5" : "")}>
                    {m.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.fileUrl}
                        target="_blank"
                        rel="noopener"
                        className={
                          "flex items-center gap-1.5 text-[12.5px] hover:underline " +
                          (m.sender === selfSender ? "text-white/90" : "text-pepo-p")
                        }
                      >
                        <Icon name="paperclip" size={13} />
                        <span className="truncate">{a.fileName}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          )
        )}
      </div>

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      {pendingAttachments.length > 0 && (
        <div className="flex flex-col gap-1 mb-2.5">
          {pendingAttachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px] text-pepo-t1">
              <Icon name="paperclip" size={13} className="text-pepo-t3" />
              <span className="flex-1 truncate">{a.fileName}</span>
              <button
                type="button"
                onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-pepo-t3 hover:text-[#C0021A]"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2.5">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="flex-1 border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-sm text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p resize-none"
        />
        <button
          type="button"
          onClick={sendReply}
          disabled={isPending || isUploading || (!reply.trim() && pendingAttachments.length === 0)}
          className="h-[46px] px-5 rounded-[10px] text-[14px] font-medium bg-pepo-p text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {isPending ? "Sender..." : "Send"}
        </button>
      </div>
      <label
        className={
          "inline-flex items-center gap-1.5 text-[12.5px] text-pepo-p cursor-pointer hover:underline mt-2 " +
          (isUploading ? "opacity-40 pointer-events-none" : "")
        }
      >
        <Icon name="paperclip" size={13} />
        {isUploading ? "Uploader..." : "Vedhæft fil"}
        <input type="file" multiple className="hidden" onChange={(e) => onAttachFiles(e.target.files)} />
      </label>
    </div>
  );
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

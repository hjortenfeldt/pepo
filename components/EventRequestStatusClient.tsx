"use client";

import { useState, useTransition } from "react";
import { formatDateDisplay } from "@/lib/format";
import type { EventRequestDetail } from "@/lib/event-requests";
import { replyToEventRequest } from "@/app/tenant/request/status/[token]/actions";

function formatKr(value: number): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(value)) + " kr.";
}

const STATUS_LABEL: Record<EventRequestDetail["status"], string> = {
  new: "Ny",
  in_dialog: "I dialog",
  accepted: "Accepteret",
  rejected: "Afvist",
};

const STATUS_CLASS: Record<EventRequestDetail["status"], string> = {
  new: "bg-pepo-pl text-pepo-p",
  in_dialog: "bg-[#FFF7E6] text-[#9A6B00]",
  accepted: "bg-[#EAF6EE] text-pepo-gr",
  rejected: "bg-[#FDECEA] text-[#C0021A]",
};

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EventRequestStatusClient({
  request,
  token,
  companyName,
  companyLogoUrl,
}: {
  request: EventRequestDetail;
  token: string;
  companyName?: string;
  companyLogoUrl?: string | null;
}) {
  const [messages, setMessages] = useState(request.messages);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const clientDisplayName = request.customerType === "company" ? request.clientName : request.contactPerson;

  function sendReply() {
    const body = reply.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const result = await replyToEventRequest(token, body);
      if (!result.success) {
        setError(result.error ?? "Kunne ikke sende beskeden.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          sender: "client" as const,
          senderName: clientDisplayName,
          body,
          createdAt: new Date().toISOString(),
        },
      ]);
      setReply("");
    });
  }

  return (
    <div className="bg-pepo-wh rounded-[20px] w-full max-w-[520px] px-[var(--page-px)] py-8 shadow-[0_4px_32px_rgba(62,31,138,0.10)]">
      {companyLogoUrl ? (
        <div className="h-10 max-w-full mb-1 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={companyLogoUrl}
            alt={companyName ?? "Firmalogo"}
            className="h-full w-auto max-w-full object-contain object-left"
          />
        </div>
      ) : companyName ? (
        <div className="mb-1">
          <span className="text-xl font-medium text-pepo-t1">{companyName}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between mt-4 mb-5">
        <div className="text-xl font-medium text-pepo-t1 tracking-tight">{request.title}</div>
        <span className={"px-2.5 py-1 rounded-full text-[12px] font-medium " + STATUS_CLASS[request.status]}>
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      <div className="bg-pepo-su rounded-xl px-4 py-3.5 mb-4">
        <Row label="Dato" value={formatDateDisplay(request.eventDate)} />
        <Row
          label="Eventsted"
          value={[request.venueName, request.venueAddress, [request.venuePostalCode, request.venueCity].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ") || "—"}
        />
        <div className="py-2.5">
          <div className="text-[11px] text-pepo-t3 uppercase tracking-wide mb-1">Personale</div>
          {request.jobLines.map((line) => (
            <div key={line.id} className="text-sm text-pepo-t1">
              {line.categoryName} <span className="text-pepo-t2">· {line.startTime}–{line.endTime}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-pepo-pl rounded-xl px-4 py-3.5 mb-6">
        <Row label="Personale i alt" value={request.labourSubtotalKr != null ? formatKr(request.labourSubtotalKr) : "—"} plain />
        <Row
          label="Transporttillæg"
          value={request.transportSurchargeKr != null ? formatKr(request.transportSurchargeKr) : "Beregnes"}
          plain
        />
        <div className="border-t border-pepo-p/15 my-2" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-pepo-t1">Samlet estimat</span>
          <span className="text-[17px] font-semibold text-pepo-p">
            {request.totalKr != null ? formatKr(request.totalKr) : "—"}
          </span>
        </div>
      </div>

      {request.status === "accepted" && (
        <p className="text-[13px] text-pepo-gr bg-[#EAF6EE] border border-[#CDEAD6] rounded-lg px-3 py-2.5 mb-5">
          Jeres forespørgsel er accepteret, og eventet er nu oprettet hos {companyName ?? "virksomheden"}.
        </p>
      )}
      {request.status === "rejected" && (
        <p className="text-[13px] text-[#C0021A] bg-[#FDECEA] border border-[#F5C6CB] rounded-lg px-3 py-2.5 mb-5">
          Denne forespørgsel er desværre blevet afvist. Skriv gerne en besked herunder, hvis I har spørgsmål.
        </p>
      )}

      <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Dialog</div>
      <div className="flex flex-col gap-2.5 mb-4 max-h-[320px] overflow-y-auto overscroll-contain">
        {messages.length === 0 ? (
          <p className="text-[13px] text-pepo-t3">Ingen beskeder endnu.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                "max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-relaxed " +
                (m.sender === "client" ? "self-end bg-pepo-p text-white" : "self-start bg-pepo-su text-pepo-t1")
              }
            >
              <div className={"text-[11px] mb-0.5 " + (m.sender === "client" ? "text-white/70" : "text-pepo-t3")}>
                {m.sender === "client" ? m.senderName ?? "Dig" : m.senderName ?? companyName ?? "Virksomheden"} ·{" "}
                {formatMessageTime(m.createdAt)}
              </div>
              {m.body}
            </div>
          ))
        )}
      </div>

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      <div className="flex gap-2.5">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder="Skriv en besked..."
          className="flex-1 border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-sm text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p resize-none"
        />
        <button
          type="button"
          onClick={sendReply}
          disabled={isPending || !reply.trim()}
          className="h-[46px] px-5 rounded-[10px] text-[14px] font-medium bg-pepo-p text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {isPending ? "Sender..." : "Send"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  if (plain) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-[13px] text-pepo-t2">{label}</span>
        <span className="text-sm text-pepo-t1">{value}</span>
      </div>
    );
  }
  return (
    <div className="py-2.5 border-b border-pepo-bd">
      <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-pepo-t1 mt-0.5">{value}</div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateDisplay } from "@/lib/format";
import Icon from "@/components/Icon";
import type { EventRequestDetail } from "@/lib/event-requests";
import {
  replyAsAdmin,
  rejectEventRequest,
  searchClientsForMatch,
  acceptEventRequest,
  type ClientMatchOption,
} from "@/app/tenant/(protected)/event-requests/actions";

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

function formatKr(value: number): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(value)) + " kr.";
}
function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EventRequestDetailClient({ request }: { request: EventRequestDetail }) {
  const router = useRouter();
  const [messages, setMessages] = useState(request.messages);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [showReject, setShowReject] = useState(false);
  const [showAccept, setShowAccept] = useState(false);

  function sendReply() {
    const body = reply.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const result = await replyAsAdmin(request.id, body);
      if (!result.success) {
        setError(result.error ?? "Kunne ikke sende beskeden.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, sender: "admin" as const, senderName: "Dig", body, createdAt: new Date().toISOString() },
      ]);
      setReply("");
    });
  }

  function handleReject() {
    startTransition(async () => {
      await rejectEventRequest(request.id);
      router.refresh();
    });
  }

  return (
    <div className="px-[var(--page-px)] py-[22px] pb-16 max-w-[720px]">
      <Link href="/event-requests" className="inline-flex items-center gap-1 text-[13px] text-pepo-t2 hover:text-pepo-t1 mb-4">
        <Icon name="chevron-left" size={16} />
        Eventforespørgsler
      </Link>

      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-[20px] font-semibold tracking-tight text-pepo-t1">{request.title}</div>
          <div className="text-[13px] text-pepo-t2 mt-1">{formatDateDisplay(request.eventDate)}</div>
        </div>
        <span className={"px-2.5 py-1 rounded-full text-[12px] font-medium " + STATUS_CLASS[request.status]}>
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] px-4 py-3.5 mb-4">
        <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Kunde</div>
        <Row label={request.customerType === "company" ? "Firma" : "Navn"} value={(request.customerType === "company" ? request.clientName : request.contactPerson) || "—"} />
        {request.customerType === "company" && <Row label="Kontaktperson" value={request.contactPerson || "—"} />}
        {request.customerType === "company" && request.cvrNumber && <Row label="CVR" value={request.cvrNumber} />}
        <Row label="Telefon" value={request.contactPhone || "—"} />
        <Row label="Email" value={request.contactEmail} />
        {request.notes && <Row label="Note" value={request.notes} last />}
      </div>

      <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] px-4 py-3.5 mb-4">
        <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Eventsted</div>
        <div className="text-sm text-pepo-t1">
          {[request.venueName, request.venueAddress, [request.venuePostalCode, request.venueCity].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ") || "—"}
        </div>
        {request.venueDistanceKm != null && (
          <div className="text-[12.5px] text-pepo-t2 mt-1">Afstand: {request.venueDistanceKm} km.</div>
        )}
      </div>

      <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] px-4 py-3.5 mb-4">
        <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Personale</div>
        {request.jobLines.map((line) => (
          <div key={line.id} className="text-sm text-pepo-t1 py-1">
            {line.categoryName} <span className="text-pepo-t2">· {line.startTime}–{line.endTime}</span>
          </div>
        ))}
        {request.description && (
          <div className="text-[13px] text-pepo-t2 mt-2.5 pt-2.5 border-t border-pepo-bd whitespace-pre-wrap">
            {request.description}
          </div>
        )}
      </div>

      <div className="bg-pepo-pl rounded-[14px] px-4 py-3.5 mb-6">
        <RowPlain label="Personale i alt" value={request.labourSubtotalKr != null ? formatKr(request.labourSubtotalKr) : "—"} />
        <RowPlain
          label="Transporttillæg"
          value={request.transportSurchargeKr != null ? formatKr(request.transportSurchargeKr) : "Ukendt"}
        />
        <div className="border-t border-pepo-p/15 my-2" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-pepo-t1">Samlet estimat</span>
          <span className="text-[17px] font-semibold text-pepo-p">{request.totalKr != null ? formatKr(request.totalKr) : "—"}</span>
        </div>
      </div>

      {request.status !== "accepted" && request.status !== "rejected" && (
        <div className="flex gap-2.5 mb-6">
          {!showReject && !showAccept && (
            <>
              <button
                onClick={() => setShowReject(true)}
                className="h-11 px-4 rounded-[10px] text-sm font-medium bg-pepo-wh text-pepo-t2 border border-pepo-bds hover:bg-pepo-su"
              >
                Afvis
              </button>
              <button
                onClick={() => setShowAccept(true)}
                className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 hover:opacity-90"
              >
                <Icon name="check" size={18} />
                Accepter forespørgsel
              </button>
            </>
          )}
          {showReject && (
            <div className="flex-1 flex items-center gap-2.5">
              <span className="text-[13px] text-pepo-t2 flex-1">Sikker på at forespørgslen skal afvises?</span>
              <button
                onClick={() => setShowReject(false)}
                disabled={isPending}
                className="h-10 px-3.5 rounded-[9px] text-[13px] font-medium bg-pepo-su text-pepo-t2"
              >
                Fortryd
              </button>
              <button
                onClick={handleReject}
                disabled={isPending}
                className="h-10 px-3.5 rounded-[9px] text-[13px] font-medium bg-[#C0021A] text-white disabled:opacity-40"
              >
                {isPending ? "Afviser..." : "Ja, afvis"}
              </button>
            </div>
          )}
        </div>
      )}

      {showAccept && (
        <AcceptPanel requestId={request.id} onClose={() => setShowAccept(false)} onDone={() => router.refresh()} />
      )}

      {request.status === "accepted" && request.createdEventId && (
        <Link
          href={`/shifts/event/${request.createdEventId}`}
          className="flex items-center justify-center gap-1.5 h-11 rounded-[10px] text-sm font-medium bg-[#EAF6EE] text-pepo-gr mb-6 hover:opacity-90"
        >
          <Icon name="calendar-event" size={18} />
          Se det oprettede event
        </Link>
      )}

      <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Dialog</div>
      <div className="flex flex-col gap-2.5 mb-4 max-h-[360px] overflow-y-auto overscroll-contain">
        {messages.length === 0 ? (
          <p className="text-[13px] text-pepo-t3">Ingen beskeder endnu.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                "max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-relaxed " +
                (m.sender === "admin" ? "self-end bg-pepo-p text-white" : "self-start bg-pepo-su text-pepo-t1")
              }
            >
              <div className={"text-[11px] mb-0.5 " + (m.sender === "admin" ? "text-white/70" : "text-pepo-t3")}>
                {m.senderName ?? (m.sender === "admin" ? "Admin" : "Klient")} · {formatMessageTime(m.createdAt)}
              </div>
              {m.body}
            </div>
          ))
        )}
      </div>

      {error && <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}

      <div className="flex gap-2.5">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder="Skriv en besked til klienten..."
          className="flex-1 border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-sm text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p resize-none"
        />
        <button
          onClick={sendReply}
          disabled={isPending || !reply.trim()}
          className="h-[46px] px-5 rounded-[10px] text-[14px] font-medium bg-pepo-p text-white transition-opacity hover:opacity-90 disabled:opacity-40 flex-shrink-0"
        >
          {isPending ? "Sender..." : "Send"}
        </button>
      </div>
    </div>
  );
}

function AcceptPanel({ requestId, onClose, onDone }: { requestId: string; onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientMatchOption[]>([]);
  const [isSearching, startSearching] = useTransition();
  const [isAccepting, startAccepting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    startSearching(async () => {
      setResults(await searchClientsForMatch(value));
    });
  }

  function accept(choice: { mode: "existing"; clientId: string } | { mode: "new" }) {
    setError(null);
    startAccepting(async () => {
      const result = await acceptEventRequest(requestId, choice);
      if (!result.success) {
        setError(result.error ?? "Kunne ikke acceptere forespørgslen.");
        return;
      }
      onDone();
      onClose();
    });
  }

  return (
    <div className="bg-pepo-su rounded-[14px] px-4 py-4 mb-6">
      <div className="text-[13.5px] font-medium text-pepo-t1 mb-1">Match forespørgslen med en kunde</div>
      <div className="text-[12.5px] text-pepo-t2 mb-3">
        Søg efter en eksisterende kunde, eller opret klienten som en helt ny kunde. Eventet og vagterne oprettes med
        det samme, og alle relevante freelancere får besked om de nye ledige vagter.
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Søg på navn, email, telefon eller CVR..."
        className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh mb-2.5"
      />
      {isSearching && <div className="text-[12.5px] text-pepo-t3 mb-2">Søger...</div>}
      {results.length > 0 && (
        <div className="bg-pepo-wh border border-pepo-bd rounded-[10px] overflow-hidden mb-3">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => accept({ mode: "existing", clientId: c.id })}
              disabled={isAccepting}
              className="w-full text-left px-3.5 py-2.5 border-b border-pepo-bd last:border-b-0 hover:bg-pepo-su text-[13px] disabled:opacity-40"
            >
              <div className="font-medium text-pepo-t1">{c.name || c.contactPerson}</div>
              <div className="text-[11.5px] text-pepo-t3">{[c.contactEmail, c.contactPhone].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}

      <div className="flex gap-2.5">
        <button
          onClick={onClose}
          disabled={isAccepting}
          className="h-10 px-3.5 rounded-[9px] text-[13px] font-medium bg-pepo-wh border border-pepo-bds text-pepo-t2"
        >
          Annuller
        </button>
        <button
          onClick={() => accept({ mode: "new" })}
          disabled={isAccepting}
          className="flex-1 h-10 rounded-[9px] text-[13px] font-medium bg-pepo-p text-white disabled:opacity-40"
        >
          {isAccepting ? "Opretter..." : "Ingen af disse — opret som ny kunde"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={"py-1.5 flex items-start justify-between gap-3 " + (last ? "" : "")}>
      <span className="text-[12.5px] text-pepo-t2 flex-shrink-0">{label}</span>
      <span className="text-[13px] text-pepo-t1 text-right">{value}</span>
    </div>
  );
}

function RowPlain({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-pepo-t2">{label}</span>
      <span className="text-sm text-pepo-t1">{value}</span>
    </div>
  );
}

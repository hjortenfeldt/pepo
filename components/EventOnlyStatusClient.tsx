"use client";

import { formatDateDisplay } from "@/lib/format";
import CorrespondenceThread from "@/components/CorrespondenceThread";
import type { EventOnlyStatus } from "@/lib/event-status";
import { replyToEventStatus, uploadEventStatusAttachment } from "@/app/tenant/status/[token]/actions";

/**
 * Klientens status/dialog-side for et event UDEN nogen forespørgsel bag sig
 * (fx booket over telefonen, se [[project_event_correspondence_and_system_log]])
 * — samme visuelle skal som EventRequestStatusClient, men uden pris-oversigt
 * eller accept/afvis-status, da der aldrig var en forespørgsel at acceptere.
 */
export default function EventOnlyStatusClient({
  event,
  token,
  companyName,
  companyLogoUrl,
}: {
  event: EventOnlyStatus;
  token: string;
  companyName?: string;
  companyLogoUrl?: string | null;
}) {
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

      <div className="mt-4 mb-5">
        <div className="text-xl font-medium text-pepo-t1 tracking-tight">{event.title}</div>
      </div>

      <div className="bg-pepo-su rounded-xl px-4 py-3.5 mb-6">
        <Row label="Dato" value={formatDateDisplay(event.eventDate)} />
        <Row
          label="Eventsted"
          value={[event.venueName, event.venueAddress, [event.venuePostalCode, event.venueCity].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ") || "—"}
        />
        {event.jobLines.length > 0 && (
          <div className="py-2.5">
            <div className="text-[11px] text-pepo-t3 uppercase tracking-wide mb-1">Personale</div>
            {event.jobLines.map((line) => (
              <div key={line.id} className="text-sm text-pepo-t1">
                {line.categoryName} <span className="text-pepo-t2">· {line.startTime}–{line.endTime}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Dialog</div>
      <CorrespondenceThread
        messages={event.messages}
        viewerRole="client"
        otherPartyLabel={companyName}
        maxHeightClassName="max-h-[320px]"
        onSend={(body, attachments) => replyToEventStatus(token, body, attachments)}
        onUploadAttachment={(file) => uploadEventStatusAttachment(token, file)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 border-b border-pepo-bd last:border-b-0">
      <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-pepo-t1 mt-0.5">{value}</div>
    </div>
  );
}

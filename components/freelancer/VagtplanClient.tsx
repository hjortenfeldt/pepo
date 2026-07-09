"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { formatDayHeading } from "@/lib/format";
import { getShiftDetail, type ShiftDetail } from "@/app/freelancer/(protected)/vagtplan/actions";

export type ScheduledShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  venue: string | null;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
};

const STATUS_LABEL: Record<ScheduledShift["status"], string> = {
  assigned: "Bekræftet",
  completed: "Afsluttet",
  open: "Åben",
  for_resale: "Til videresalg",
  cancelled: "Aflyst",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default function VagtplanClient({ shifts }: { shifts: ScheduledShift[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(shifts[0]?.id ?? null);
  const [details, setDetails] = useState<Record<string, ShiftDetail>>({});
  const [isPending, startTransition] = useTransition();

  function toggle(shiftId: string) {
    if (expandedId === shiftId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(shiftId);
    if (!details[shiftId]) {
      startTransition(async () => {
        const detail = await getShiftDetail(shiftId);
        if (detail) setDetails((prev) => ({ ...prev, [shiftId]: detail }));
      });
    }
  }

  if (shifts.length === 0) {
    return (
      <div className="px-5 pt-4 pb-6">
        <div className="text-[20px] font-bold text-pepo-t1 mb-4">Vagtplan</div>
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 text-center text-[13px] text-pepo-t3">
          Du har ingen kommende vagter.
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-6">
      <div className="text-[20px] font-bold text-pepo-t1 mb-4 pepo-rise">Vagtplan</div>

      <div className="flex flex-col gap-2">
        {shifts.map((shift, index) => {
          const showDateHeading = index === 0 || shift.date !== shifts[index - 1].date;
          const isExpanded = expandedId === shift.id;
          const detail = details[shift.id];

          return (
            <div key={shift.id}>
              {showDateHeading && (
                <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide mt-4 mb-2 first:mt-0">
                  {formatDayHeading(shift.date)}
                </div>
              )}

              <div
                className={`bg-pepo-wh rounded-[14px] p-3.5 transition-colors ${
                  isExpanded ? "border-[1.5px] border-pepo-p" : "border border-pepo-bd"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(shift.id)}
                  className="w-full flex items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-bold text-pepo-t1">{shift.title}</div>
                    <div className="text-[12.5px] text-pepo-t2 mt-0.5">
                      {shift.startTime}–{shift.endTime}
                      {shift.venue ? ` · ${shift.venue}` : ""}
                    </div>
                  </div>
                  <span className="flex-shrink-0 bg-pepo-pl text-pepo-p text-[11px] font-semibold px-2.5 py-1 rounded-xl">
                    {STATUS_LABEL[shift.status]}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-pepo-bd pepo-rise">
                    {!detail ? (
                      <div className="text-[12.5px] text-pepo-t3 py-2">
                        {isPending ? "Henter detaljer..." : "Ingen detaljer tilgængelige."}
                      </div>
                    ) : (
                      <>
                        {detail.venueName && (
                          <DetailRow icon="map-pin" title={detail.venueName} subtitle={detail.venueAddress} />
                        )}
                        {detail.contactPerson && (
                          <DetailRow
                            icon="phone"
                            title={`${detail.contactPerson}${detail.clientName ? ` (${detail.clientName})` : ""}`}
                            subtitle={detail.contactPhone}
                          />
                        )}
                        {detail.description && (
                          <DetailRow icon="info-circle" title="Briefing" subtitle={detail.description} />
                        )}
                        {detail.attachments.length > 0 && (
                          <div className="mt-2.5 flex flex-col gap-1.5">
                            {detail.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-[12.5px] text-pepo-p font-medium"
                              >
                                <Icon name="paperclip" size={14} />
                                {a.name}
                              </a>
                            ))}
                          </div>
                        )}

                        {detail.colleagues.length > 0 && (
                          <div className="mt-3.5">
                            <div className="text-[11.5px] font-semibold text-pepo-t2 uppercase tracking-wide mb-2">
                              På arbejde til samme event
                            </div>
                            <div className="flex flex-col gap-2">
                              {detail.colleagues.map((c) => (
                                <div key={c.freelancerId} className="flex items-center gap-2">
                                  <div className="w-[26px] h-[26px] rounded-full bg-pepo-pl text-pepo-p text-[10px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {c.profileImageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={c.profileImageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      initials(c.fullName)
                                    )}
                                  </div>
                                  <div className="text-[12.5px] text-pepo-t1">{c.fullName}</div>
                                  <span className="ml-auto text-[11px] text-pepo-t2">{c.categoryName}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailRow({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string | null }) {
  return (
    <div className="flex items-start gap-2.5 mb-2.5">
      <Icon name={icon} size={16} className="text-pepo-t3 mt-0.5 flex-shrink-0" />
      <div>
        <div className="text-[13px] text-pepo-t1 font-medium">{title}</div>
        {subtitle && <div className="text-[12px] text-pepo-t2 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

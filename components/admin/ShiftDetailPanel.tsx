"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryOption, EventListItem, FreelancerOption, ShiftListItem, ShiftStatus } from "@/lib/admin-types";
import { formatEventDate, formatTimeRange } from "@/lib/format";
import {
  updateShift,
  assignFreelancer,
  releaseShift,
  deleteShift,
  undeleteShift,
  duplicateShift,
  type ShiftRowInput,
} from "@/app/admin/(protected)/shifts/actions";
import { TimeField } from "./ShiftFormFields";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const STATUS_LABEL: Record<ShiftStatus, string> = {
  open: "Mangler",
  for_resale: "Til salg",
  assigned: "Tildelt",
  completed: "Afsluttet",
  cancelled: "Slettet",
};

const STATUS_BADGE_CLASS: Record<ShiftStatus, string> = {
  open: "bg-[#FDECEA] text-[#C0021A]",
  for_resale: "bg-[#FEF3E2] text-[#9A5F00]",
  assigned: "bg-[#EAF6EE] text-[#1A7A34]",
  completed: "bg-pepo-su text-pepo-t2",
  cancelled: "bg-pepo-su text-pepo-t3",
};

export default function ShiftDetailPanel({
  shift,
  event,
  categories,
  freelancers,
  onClose,
  onEditEvent,
}: {
  shift: ShiftListItem;
  event: EventListItem;
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
  onClose: () => void;
  onEditEvent: () => void;
}) {
  const [row, setRow] = useState<ShiftRowInput>({
    id: shift.id,
    categoryId: shift.categoryId,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    row.categoryId !== shift.categoryId || row.startTime !== shift.startTime || row.endTime !== shift.endTime;

  function run(action: () => Promise<{ success: boolean; error?: string }>, opts?: { closeOnSuccess?: boolean }) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.refresh();
      if (opts?.closeOnSuccess) onClose();
    });
  }

  return (
    <>
      <div className="fixed inset-0 bg-[#1D1D1F]/30 z-10" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] z-20 flex flex-col">
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
          <span className="text-sm font-medium">Vagtdetaljer</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
          <button
            onClick={onEditEvent}
            className="w-full text-left bg-pepo-su rounded-[10px] p-3 mb-5 hover:bg-pepo-bd/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-medium text-pepo-t1">{event.title}</div>
              <span className="text-[11.5px] text-pepo-p font-medium flex items-center gap-1 flex-shrink-0">
                <i className="ti ti-pencil text-[12px]" />
                Redigér event
              </span>
            </div>
            <div className="text-xs text-pepo-t2 mt-1">{formatEventDate(event.eventDate)}</div>
            <div className="text-xs text-pepo-t2 mt-0.5">
              {event.clientName}
              {event.venueLabel ? ` · ${event.venueLabel}` : ""}
            </div>
          </button>

          <span className={"badge mb-4 inline-flex " + STATUS_BADGE_CLASS[shift.status]}>
            {STATUS_LABEL[shift.status]}
          </span>

          {shift.status === "cancelled" ? (
            <div className="text-[13.5px] text-pepo-t2 mb-4">
              {shift.category} · {formatTimeRange(shift.startTime, shift.endTime)}
            </div>
          ) : (
            <>
              <Field label="Jobfunktion">
                <select
                  value={row.categoryId}
                  onChange={(e) => setRow((r) => ({ ...r, categoryId: e.target.value }))}
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-2.5">
                <Field label="Starttid" className="flex-1">
                  <TimeField value={row.startTime} onChange={(v) => setRow((r) => ({ ...r, startTime: v }))} />
                </Field>
                <Field label="Sluttid" className="flex-1">
                  <TimeField value={row.endTime} onChange={(v) => setRow((r) => ({ ...r, endTime: v }))} />
                </Field>
              </div>
              {dirty && (
                <button
                  onClick={() => run(() => updateShift(shift.id, row))}
                  disabled={isPending}
                  className="w-full h-9 rounded-[9px] text-[12.5px] font-medium bg-pepo-p text-white mb-5 disabled:opacity-40"
                >
                  {isPending ? "Gemmer..." : "Gem ændringer"}
                </button>
              )}

              <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2 mt-2">
                Tildeling
              </div>

              {shift.assignedFreelancerName && (
                <div className="flex items-center gap-2.5 bg-pepo-su rounded-[9px] px-3 py-2.5 mb-1">
                  <i className="ti ti-user-check text-pepo-t3" />
                  <div className="flex-1">
                    <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">Tildelt</div>
                    <div className="text-[13.5px] text-pepo-t1 mt-px">{shift.assignedFreelancerName}</div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Frigiv vagten fra ${shift.assignedFreelancerName}? Vagten bliver åben igen.`)) {
                        run(() => releaseShift(shift.id));
                      }
                    }}
                    disabled={isPending}
                    className="h-9 px-3 rounded-[9px] border border-pepo-bds bg-pepo-wh text-[#C0021A] text-[12.5px] font-medium"
                  >
                    Frigiv vagt
                  </button>
                </div>
              )}

              <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2 mt-5">
                Interesserede freelancere
              </div>
              {shift.interests.length > 0 ? (
                <div className="flex flex-col gap-2 mb-1">
                  {shift.interests.map((i) => (
                    <div
                      key={i.freelancerId}
                      className="flex items-center gap-2.5 border border-pepo-bd rounded-[10px] px-2.5 py-2"
                    >
                      <div className="w-[30px] h-[30px] rounded-full bg-pepo-pl text-pepo-p text-[11px] font-medium flex items-center justify-center flex-shrink-0">
                        {initials(i.freelancerName)}
                      </div>
                      <span className="text-[13px] font-medium text-pepo-t1 flex-1">{i.freelancerName}</span>
                      {shift.assignedFreelancerId === i.freelancerId ? (
                        <span className="badge bg-[#EAF6EE] text-[#1A7A34]">Tildelt</span>
                      ) : (
                        <button
                          onClick={() => run(() => assignFreelancer(shift.id, i.freelancerId))}
                          disabled={isPending}
                          className="h-[30px] px-3 rounded-[7px] bg-pepo-p text-white text-[12px] font-medium"
                        >
                          Tildel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12.5px] text-pepo-t3 pb-1">Ingen har tilkendegivet interesse endnu.</div>
              )}

              <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2 mt-5">
                Tildel manuelt
              </div>
              <select
                value=""
                onChange={(e) => e.target.value && run(() => assignFreelancer(shift.id, e.target.value))}
                disabled={isPending}
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh"
              >
                <option value="">Vælg en godkendt freelancer...</option>
                {freelancers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fullName}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {error && (
          <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0 flex gap-2">
          <button
            onClick={() => run(() => duplicateShift(shift.id))}
            disabled={isPending}
            className="flex-1 h-9 rounded-[9px] text-[12.5px] font-medium bg-pepo-wh text-pepo-t2 border border-pepo-bds hover:bg-pepo-su disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <i className="ti ti-copy" />
            Duplikér vagt
          </button>
          {shift.status === "cancelled" ? (
            <button
              onClick={() => run(() => undeleteShift(shift.id), { closeOnSuccess: false })}
              disabled={isPending}
              className="flex-1 h-9 rounded-[9px] text-[12.5px] font-medium bg-pepo-wh text-pepo-t2 border border-pepo-bds hover:bg-pepo-su disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <i className="ti ti-arrow-back-up" />
              Fortryd sletning
            </button>
          ) : (
            <button
              onClick={() => {
                if (confirm("Slet denne vagt? Du kan fortryde bagefter.")) {
                  run(() => deleteShift(shift.id), { closeOnSuccess: false });
                }
              }}
              disabled={isPending}
              className="flex-1 h-9 rounded-[9px] text-[12.5px] font-medium bg-pepo-wh text-[#C0021A] border border-[#F3C9C9] hover:bg-[#FDECEA] disabled:opacity-40"
            >
              Slet vagt
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
        .badge {
          padding: 3px 9px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
        }
      `}</style>
    </>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"mb-4 " + className}>
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryOption, ClientOption, EventListItem, FreelancerOption, ShiftListItem, ShiftStatus } from "@/lib/admin-types";
import { formatTimeRange } from "@/lib/format";
import {
  updateShift,
  updateEvent,
  assignFreelancer,
  releaseShift,
  deleteShift,
  undeleteShift,
  duplicateShift,
  uploadAttachment,
  removeAttachment,
  type EventFormInput,
  type ShiftRowInput,
} from "@/app/tenant/(protected)/shifts/actions";
import { DateField, TimeField } from "./ShiftFormFields";
import ClientVenueField from "./ClientVenueField";
import Icon from "@/components/Icon";
import { useSlidePanel } from "./useSlidePanel";

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
  cancelled: "Slettet",
};

const STATUS_BADGE_CLASS: Record<ShiftStatus, string> = {
  open: "bg-[#FDECEA] text-[#C0021A]",
  for_resale: "bg-[#FEF3E2] text-[#9A5F00]",
  assigned: "bg-[#EAF6EE] text-[#1A7A34]",
  cancelled: "bg-pepo-su text-pepo-t3",
};

export default function ShiftDetailPanel({
  shift,
  event,
  clients,
  categories,
  freelancers,
  onClose,
}: {
  shift: ShiftListItem;
  event: EventListItem;
  clients: ClientOption[];
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
  onClose: () => void;
}) {
  // Vagt-panelet viser OG redigerer samme vagt (inkl. event-fælles felter
  // som dato/titel/briefing/kunde&sted) — ingen separat "redigér event"-
  // tilstand, matcher prototypens openDetail()/ddSave()-mønster.
  const [row, setRow] = useState<ShiftRowInput>({
    id: shift.id,
    categoryId: shift.categoryId,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
  const [eventForm, setEventForm] = useState<EventFormInput>({
    title: event.title,
    eventDate: event.eventDate,
    description: event.description ?? "",
    clientId: event.clientId,
    venueId: event.venueId,
  });
  const [clientsState, setClientsState] = useState<ClientOption[]>(clients);
  const [attachments, setAttachments] = useState(event.attachments);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { visible, close } = useSlidePanel(onClose);

  function onClientSaved(client: ClientOption) {
    setClientsState((prev) => (prev.some((c) => c.id === client.id) ? prev.map((c) => (c.id === client.id ? client : c)) : [...prev, client]));
  }

  const shiftDirty =
    row.categoryId !== shift.categoryId || row.startTime !== shift.startTime || row.endTime !== shift.endTime;
  const eventDirty =
    eventForm.title !== event.title ||
    eventForm.eventDate !== event.eventDate ||
    eventForm.description !== (event.description ?? "") ||
    eventForm.clientId !== event.clientId ||
    eventForm.venueId !== event.venueId;
  const dirty = shiftDirty || eventDirty;

  function run(action: () => Promise<{ success: boolean; error?: string }>, opts?: { closeOnSuccess?: boolean }) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.refresh();
      if (opts?.closeOnSuccess) close();
    });
  }

  function saveChanges() {
    if (!eventForm.title.trim()) {
      setError("Titel/anledning mangler.");
      return;
    }
    if (!eventForm.eventDate) {
      setError("Dato mangler.");
      return;
    }
    if (!eventForm.clientId) {
      setError("Vælg en kunde.");
      return;
    }
    setError(null);
    startTransition(async () => {
      if (eventDirty) {
        const result = await updateEvent(event.id, eventForm);
        if (!result.success) {
          setError(result.error ?? "Der opstod en fejl.");
          return;
        }
      }
      if (shiftDirty) {
        const result = await updateShift(shift.id, row);
        if (!result.success) {
          setError(result.error ?? "Der opstod en fejl.");
          return;
        }
      }
      router.refresh();
    });
  }

  async function onAttachFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    for (const file of Array.from(fileList)) {
      const result = await uploadAttachment(event.id, file);
      if (!result.success) {
        setError(result.error ?? "Kunne ikke uploade filen.");
        continue;
      }
      setAttachments((a) => [...a, result.attachment]);
    }
    router.refresh();
  }

  async function onRemoveAttachment(id: string, fileUrl: string) {
    setAttachments((a) => a.filter((att) => att.id !== id));
    await removeAttachment(id, fileUrl);
    router.refresh();
  }

  const readOnly = shift.status === "cancelled";

  return (
    <>
      <div
        className={
          "fixed inset-0 bg-[#1D1D1F]/30 transition-opacity duration-200 z-10 " +
          (visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={close}
      />
      <div
        className={
          "fixed top-0 right-0 bottom-0 w-[472px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform duration-200 z-20 flex flex-col " +
          (visible ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
          <span className="text-sm font-medium">Vagtdetaljer</span>
          <button onClick={close} className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
          <span className={"badge mb-4 inline-flex " + STATUS_BADGE_CLASS[shift.status]}>
            {STATUS_LABEL[shift.status]}
          </span>

          {!readOnly && (
            <>
              {shift.assignedFreelancerName && (
                <div className="flex items-center gap-2.5 py-2.5 border-b border-pepo-bd">
                  <Icon name="user-check" size={16} className="text-pepo-t3 flex-shrink-0" />
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
                    className="h-[30px] px-3 rounded-[7px] bg-pepo-wh text-[#C0021A] border border-[#F3C9C9] text-xs font-medium"
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

              <div className="border-t border-pepo-bd my-6" />
            </>
          )}

          {readOnly ? (
            <div className="text-[13.5px] text-pepo-t2 mb-4">
              {event.title} · {formatTimeRange(shift.startTime, shift.endTime)}
            </div>
          ) : (
            <>
              <Field label="Dato">
                <DateField value={eventForm.eventDate} onChange={(v) => setEventForm((f) => ({ ...f, eventDate: v }))} />
              </Field>

              <Field label="Titel / anledning">
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Fx Firmafest Kanal 4"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>

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

              <Field label="Briefing">
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                  rows={6}
                  placeholder="Detaljer om vagten (valgfrit)"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
                />
                <div className="flex flex-col gap-1.5 mt-2.5 mb-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-[13px] text-pepo-t1">
                      <Icon name="paperclip" className="text-pepo-t3" />
                      <a href={a.fileUrl} target="_blank" rel="noopener" className="flex-1 truncate hover:underline">
                        {a.fileName}
                      </a>
                      <button onClick={() => onRemoveAttachment(a.id, a.fileUrl)} className="text-pepo-t3 hover:text-[#C0021A]">
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="inline-flex items-center gap-1.5 text-[12.5px] text-pepo-p cursor-pointer hover:underline">
                  <Icon name="plus" size={13} />
                  Vedhæft fil
                  <input type="file" multiple className="hidden" onChange={(e) => onAttachFiles(e.target.files)} />
                </label>
              </Field>

              <ClientVenueField
                clients={clientsState}
                clientId={eventForm.clientId}
                venueId={eventForm.venueId}
                onChange={(clientId, venueId) => setEventForm((f) => ({ ...f, clientId, venueId }))}
                onClientSaved={onClientSaved}
              />

              {dirty && (
                <button
                  onClick={saveChanges}
                  disabled={isPending}
                  className="w-full h-9 rounded-[9px] text-[12.5px] font-medium bg-pepo-p text-white mt-5 mb-2 disabled:opacity-40"
                >
                  {isPending ? "Gemmer..." : "Gem ændringer"}
                </button>
              )}
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
            <Icon name="copy" size={18} />
            Duplikér vagt
          </button>
          {shift.status === "cancelled" ? (
            <button
              onClick={() => run(() => undeleteShift(shift.id), { closeOnSuccess: false })}
              disabled={isPending}
              className="flex-1 h-9 rounded-[9px] text-[12.5px] font-medium bg-pepo-wh text-pepo-t2 border border-pepo-bds hover:bg-pepo-su disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Icon name="arrow-back-up" size={18} />
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

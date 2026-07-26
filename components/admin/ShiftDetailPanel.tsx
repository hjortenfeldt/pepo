"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryOption, ClientOption, EventListItem, FreelancerOption, ShiftListItem } from "@/lib/admin-types";
import { formatEventDate, formatTimeRange } from "@/lib/format";
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
  updateShiftClockTimes,
  type EventFormInput,
  type ShiftRowInput,
} from "@/app/tenant/(protected)/shifts/actions";
import { TimeField } from "./ShiftFormFields";
import ClientVenueField from "./ClientVenueField";
import Icon from "@/components/Icon";
import { useSlidePanel } from "./useSlidePanel";
import FreelancerAssignDropdown from "./FreelancerAssignDropdown";
import { findConflictFreelancerIds, type BusyShift } from "@/lib/shift-conflicts";

// Konverterer en gemt stempel-tid (ISO-timestamp) til et "HH:MM"-tekstfelt i
// browserens lokale tid — matcher hvordan OverviewClient.tsx's "elapsed()"
// også regner ud fra new Date(clockInAt), og hvordan freelancer-appen selv
// skrev tiden (new Date().toISOString()) da den blev stemplet.
function isoToHHMM(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ShiftDetailPanel({
  shift,
  event,
  clients,
  categories,
  freelancers,
  busyShifts,
  onClose,
  onAssigned,
  onReleased,
  onSaved,
  onDeleted,
}: {
  shift: ShiftListItem;
  event: EventListItem;
  clients: ClientOption[];
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
  // Alle virksomhedens tildelte/til-salg-vagter (på tværs af events) — brugt
  // til at beregne "Utilgængelig"-mærkatet i FreelancerAssignDropdown, se
  // lib/shift-conflicts.ts. Udledes én gang i ShiftBoard.tsx/
  // EventDeepLinkView.tsx/UnfilledShiftsView.tsx via useMemo over `events`.
  busyShifts: BusyShift[];
  onClose: () => void;
  onAssigned?: (shiftId: string) => void;
  // Kaldes efter en vellykket "Frigiv vagt" — samme flash-mekanisme som
  // onAssigned, blot rød i stedet for grøn (se ShiftBoard.tsx's flashShift).
  onReleased?: (shiftId: string) => void;
  // Kaldes efter et vellykket "Gem ændringer" (redigerede vagt-/event-felter)
  // — samme flash-mekanisme igen, denne gang lilla (hverken tildeling eller
  // frigivelse, bare en almindelig redigering). "Duplikér vagt" genbruger
  // også denne, blot med den NYE vagts id (se duplicate() nedenfor).
  onSaved?: (shiftId: string) => void;
  // Kaldes efter en vellykket "Slet vagt" — starter den lilla-blink-så-
  // udtoning-så-kollaps-animation på selve vagt-kortet (se ShiftBoard.tsx's
  // removingShiftId/EventCard), i stedet for et almindeligt flash.
  onDeleted?: (shiftId: string) => void;
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

  // "Stemplet ind"/"Stemplet ud" — kun redigerbare felter, ingen egen
  // dato-vælger (se ShiftClockTimesInput i actions.ts: tiderne kombineres
  // med eventForm.eventDate ved gem).
  const [clockInTime, setClockInTime] = useState(isoToHHMM(shift.clockedInAt));
  const [clockOutTime, setClockOutTime] = useState(isoToHHMM(shift.clockedOutAt));
  const clockDirty = clockInTime !== isoToHHMM(shift.clockedInAt) || clockOutTime !== isoToHHMM(shift.clockedOutAt);

  // Lazy initializer (som OverviewClient.tsx's stopur) i stedet for et
  // direkte Date.now()-kald i selve render-kroppen — react-hooks/purity
  // regner rene funktionskald under render for en fejl, men accepterer et
  // engangs-opslag inde i useStates initializer.
  const [now] = useState(() => Date.now());
  const shiftStartMs = new Date(`${eventForm.eventDate}T${row.startTime || "00:00"}:00`).getTime();
  const shiftEndMs = new Date(`${eventForm.eventDate}T${row.endTime || "00:00"}:00`).getTime();
  // Stempel-ur-felterne vises først, når vagten faktisk er begyndt — inden
  // da giver "Mangler"/"Vagt i gang" ingen mening.
  const shiftHasStarted = Number.isFinite(shiftStartMs) && shiftStartMs <= now;
  const shiftHasEnded = Number.isFinite(shiftEndMs) && shiftEndMs <= now;

  // Briefing-feltet starter i to linjers højde, men vokser (og krymper
  // igen) med indholdet, så hele briefingen altid er synlig uden selv at
  // skulle scrolle i det lille felt — samme "auto-height"-teknik som andre
  // steder ikke bruger endnu: nulstil højden, mål så den reelle
  // scrollHeight, og sæt den som ny højde. Kører også ved mount, i tilfælde
  // af at en eksisterende briefing allerede fylder mere end to linjer.
  const briefingRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = briefingRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [eventForm.description]);

  function onClientSaved(client: ClientOption) {
    setClientsState((prev) => (prev.some((c) => c.id === client.id) ? prev.map((c) => (c.id === client.id ? client : c)) : [...prev, client]));
  }

  const shiftDirty =
    row.categoryId !== shift.categoryId || row.startTime !== shift.startTime || row.endTime !== shift.endTime;
  // title/eventDate er ikke længere redigerbare felter i dette panel (vises
  // nu read-only øverst i headeren i stedet — se dens kommentar), så de kan
  // aldrig afvige fra event-proppen; kun beskrivelse/kunde/sted kan gøre
  // eventForm "dirty".
  const eventDirty =
    eventForm.description !== (event.description ?? "") ||
    eventForm.clientId !== event.clientId ||
    eventForm.venueId !== event.venueId;
  const dirty = shiftDirty || eventDirty || clockDirty;

  // "Tildel vagt"-dropdownet viser kun godkendte freelancere, der reelt
  // matcher den (evt. lige nu redigerede) jobfunktion for DENNE vagt —
  // FreelancerOption.categories er en liste af jobfunktions-NAVNE (ikke
  // id'er, se lib/shifts-data.ts), så vi slår den valgte kategoris navn op
  // via id'et.
  const selectedCategoryName = categories.find((c) => c.id === row.categoryId)?.name ?? "";
  const matchingFreelancers = freelancers
    .filter((f) => f.categories.includes(selectedCategoryName))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "da"));

  // Genberegnes reaktivt når admin ændrer start-/sluttid FØR de gemmer —
  // dato er ikke redigerbar her (se eventDirty-kommentaren ovenfor), så
  // event.eventDate er stabil.
  const conflictFreelancerIds = useMemo(
    () => findConflictFreelancerIds(busyShifts, event.eventDate, row.startTime, row.endTime, shift.id),
    [busyShifts, event.eventDate, row.startTime, row.endTime, shift.id]
  );

  function run(
    action: () => Promise<{ success: boolean; error?: string }>,
    opts?: { closeOnSuccess?: boolean; onSuccess?: () => void }
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.refresh();
      opts?.onSuccess?.();
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
      if (clockDirty) {
        const result = await updateShiftClockTimes(shift.id, {
          clockEntryId: shift.clockEntryId,
          shiftDate: eventForm.eventDate,
          clockInTime,
          clockOutTime,
        });
        if (!result.success) {
          setError(result.error ?? "Der opstod en fejl.");
          return;
        }
      }
      router.refresh();
      // Samme luk-og-blink-mønster som tildeling (grøn)/frigivelse (rød),
      // her lilla — se onSaved-kommentaren ved komponentens props.
      onSaved?.(shift.id);
      close();
    });
  }

  // "Duplikér vagt" opretter en helt ny vagt — det er DEN, der skal lilla-
  // blinke (via samme onSaved-mekanisme), ikke den oprindelige vagt, som
  // ikke selv blev ændret. Kører derfor uden om den generiske run()-hjælper,
  // så vi kan læse result.id ud og videregive det.
  function duplicate() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateShift(shift.id);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.refresh();
      if (result.id) onSaved?.(result.id);
      close();
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
          "fixed top-0 right-0 bottom-0 w-full sm:w-[472px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform duration-200 z-20 flex flex-col " +
          // Ingen "translate-x-0" i synlig tilstand — se
          // [[feedback_slide_panel_native_picker_bug]] for hvorfor.
          (visible ? "" : "translate-x-full")
        }
      >
        <div className="flex items-start justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
          <div>
            <div className="text-sm font-medium">Vagtdetaljer</div>
            {/* Dato/titel er ikke redigerbare her (det gøres på eventets eget
                kort) — vist read-only i stedet, så de stadig er synlige. */}
            <div className="text-[15px] font-semibold text-pepo-t1 mt-3">{event.title}</div>
            <div className="text-[12.5px] text-pepo-t2 mt-0.5">{formatEventDate(event.eventDate)}</div>
          </div>
          <button onClick={close} className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su flex-shrink-0">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-[22px]">
          {!readOnly && (
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
                <Field label="Starttid" className="flex-1 min-w-0">
                  <TimeField value={row.startTime} onChange={(v) => setRow((r) => ({ ...r, startTime: v }))} />
                </Field>
                <Field label="Sluttid" className="flex-1 min-w-0">
                  <TimeField value={row.endTime} onChange={(v) => setRow((r) => ({ ...r, endTime: v }))} />
                </Field>
              </div>

              <div className="border-t border-pepo-bd my-5" />

              <FreelancerAssignDropdown
                freelancers={matchingFreelancers}
                selectedFreelancerId={shift.assignedFreelancerId}
                selectedFreelancerName={shift.assignedFreelancerName}
                interests={shift.interests}
                isForResale={shift.status === "for_resale"}
                conflictFreelancerIds={conflictFreelancerIds}
                disabled={isPending}
                onSelect={(freelancerId) => {
                  // Uændret valg (inkl. "Ledig vagt" på en allerede-ledig
                  // vagt) — luk bare menuen, ingen grund til et API-kald.
                  if (freelancerId === shift.assignedFreelancerId) return;
                  if (freelancerId === null) {
                    if (!confirm(`Frigiv vagten fra ${shift.assignedFreelancerName}? Vagten bliver åben igen.`)) return;
                    run(() => releaseShift(shift.id), {
                      closeOnSuccess: true,
                      onSuccess: () => onReleased?.(shift.id),
                    });
                  } else {
                    run(() => assignFreelancer(shift.id, freelancerId), {
                      closeOnSuccess: true,
                      onSuccess: () => onAssigned?.(shift.id),
                    });
                  }
                }}
              />

              <div className="border-t border-pepo-bd my-6" />
            </>
          )}

          {readOnly ? (
            // Titel/dato vises nu altid øverst i headeren — her er kun
            // vagtens eget tidsrum tilbage at vise.
            <div className="text-[13.5px] text-pepo-t2 mb-4">{formatTimeRange(shift.startTime, shift.endTime)}</div>
          ) : (
            <>
              {shiftHasStarted && (
                <div className="flex gap-2.5">
                  <Field label="Stemplet ind" className="flex-1 min-w-0">
                    <TimeField value={clockInTime} onChange={setClockInTime} placeholder="Mangler" />
                  </Field>
                  <Field label="Stemplet ud" className="flex-1 min-w-0">
                    <TimeField
                      value={clockOutTime}
                      onChange={setClockOutTime}
                      placeholder={shiftHasEnded ? "Mangler" : "Vagt i gang"}
                    />
                  </Field>
                </div>
              )}

              <ClientVenueField
                clients={clientsState}
                clientId={eventForm.clientId}
                venueId={eventForm.venueId}
                onChange={(clientId, venueId) => setEventForm((f) => ({ ...f, clientId, venueId }))}
                onClientSaved={onClientSaved}
              />

              <Field label="Briefing">
                <textarea
                  ref={briefingRef}
                  value={eventForm.description}
                  onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Detaljer om vagten (valgfrit)"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none overflow-hidden focus:border-pepo-p"
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
                  <Icon name="paperclip" size={13} />
                  Vedhæft fil
                  <input type="file" multiple className="hidden" onChange={(e) => onAttachFiles(e.target.files)} />
                </label>
              </Field>
            </>
          )}
        </div>

        {error && (
          <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Sticky bund-element — "Gem ændringer" (kun når der reelt er
            ændringer) ligger ØVERST i samme element som "Duplikér vagt"/
            "Slet vagt", ikke inde i det scrollbare indhold ovenfor, så den
            altid er synlig uden at skulle scrolle ned. */}
        <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0 flex flex-col gap-2">
          {dirty && (
            <button
              onClick={saveChanges}
              disabled={isPending}
              className="w-full h-9 rounded-[9px] text-[12.5px] font-medium bg-pepo-p text-white disabled:opacity-40"
            >
              {isPending ? "Gemmer..." : "Gem ændringer"}
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={duplicate}
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
                  if (confirm("Slet denne vagt?")) {
                    run(() => deleteShift(shift.id), {
                      closeOnSuccess: true,
                      onSuccess: () => onDeleted?.(shift.id),
                    });
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

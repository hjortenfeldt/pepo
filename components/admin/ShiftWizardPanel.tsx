"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryOption, ClientOption, EventListItem } from "@/lib/admin-types";
import {
  createEventWithShifts,
  addShiftsToEvent,
  updateEvent,
  uploadAttachment,
  removeAttachment,
  type EventFormInput,
  type ShiftRowInput,
} from "@/app/tenant/(protected)/shifts/actions";
import ClientVenueField from "./ClientVenueField";
import { DateField, TimeField } from "./ShiftFormFields";

export type WizardState =
  | { mode: "new"; presetDate?: string }
  | { mode: "editEvent"; event: EventListItem }
  | { mode: "addShift"; event: EventListItem };

let rowKeySeq = 0;
function nextRowKey() {
  rowKeySeq += 1;
  return `row-${rowKeySeq}`;
}

type RowState = ShiftRowInput & { key: string };

function blankRow(): RowState {
  return { key: nextRowKey(), id: null, categoryId: "", startTime: "10:00", endTime: "18:00" };
}

export default function ShiftWizardPanel({
  state,
  clients,
  categories,
  onClose,
}: {
  state: WizardState;
  clients: ClientOption[];
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const isAddShiftOnly = state.mode === "addShift";
  const existingEvent = state.mode === "editEvent" || state.mode === "addShift" ? state.event : null;

  const [step, setStep] = useState<1 | 2>(isAddShiftOnly ? 2 : 1);
  const [form, setForm] = useState<EventFormInput>(() => ({
    title: existingEvent?.title ?? "",
    eventDate: existingEvent?.eventDate ?? (state.mode === "new" ? state.presetDate ?? "" : ""),
    description: existingEvent?.description ?? "",
    clientId: existingEvent?.clientId ?? "",
    venueId: existingEvent?.venueId ?? null,
  }));
  const [rows, setRows] = useState<RowState[]>(() =>
    state.mode === "editEvent" ? [] : [blankRow()]
  );
  const [clientsState, setClientsState] = useState<ClientOption[]>(clients);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState(existingEvent?.attachments ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onClientSaved(client: ClientOption) {
    setClientsState((prev) => (prev.some((c) => c.id === client.id) ? prev.map((c) => (c.id === client.id ? client : c)) : [...prev, client]));
  }

  function validateStep1(): string | null {
    if (!form.title.trim()) return "Titel/anledning mangler.";
    if (!form.eventDate) return "Dato mangler.";
    if (!form.clientId) return "Vælg en kunde.";
    return null;
  }

  function goToRows() {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep(2);
  }

  function updateRow(key: string, patch: Partial<ShiftRowInput>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((r) => [...r, blankRow()]);
  }

  function removeRow(key: string) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function saveEventOnly() {
    if (!existingEvent) return;
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateEvent(existingEvent.id, form);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function saveShifts() {
    const rowInputs: ShiftRowInput[] = rows.map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      startTime: row.startTime,
      endTime: row.endTime,
    }));
    if (rowInputs.length === 0) {
      setError("Tilføj mindst én vagt.");
      return;
    }
    for (const r of rowInputs) {
      if (!r.categoryId) {
        setError("Vælg jobfunktion for alle vagter.");
        return;
      }
    }
    setError(null);

    startTransition(async () => {
      if (state.mode === "addShift") {
        const result = await addShiftsToEvent(state.event.id, rowInputs);
        if (!result.success) {
          setError(result.error ?? "Der opstod en fejl.");
          return;
        }
        router.refresh();
        onClose();
        return;
      }

      const result = await createEventWithShifts(form, rowInputs);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      for (const file of pendingFiles) {
        await uploadAttachment(result.eventId, file);
      }
      router.refresh();
      onClose();
    });
  }

  async function onAttachFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (!existingEvent) {
      setPendingFiles((f) => [...f, ...files]);
      return;
    }
    setError(null);
    for (const file of files) {
      const result = await uploadAttachment(existingEvent.id, file);
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

  const title =
    state.mode === "new"
      ? step === 1
        ? "Ny event"
        : "Vagter til " + (form.title || "eventet")
      : state.mode === "editEvent"
      ? "Redigér event"
      : "Tilføj vagt til " + state.event.title;

  return (
    <>
      <div className="fixed inset-0 bg-[#1D1D1F]/30 z-10" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[472px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] z-20 flex flex-col">
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
          <span className="text-sm font-medium">{title}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
          {step === 1 && (
            <>
              <Field label="Dato">
                <DateField value={form.eventDate} onChange={(v) => setForm((f) => ({ ...f, eventDate: v }))} />
              </Field>

              <Field label="Titel / anledning">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Fx Firmafest Kanal 4"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>

              <ClientVenueField
                clients={clientsState}
                clientId={form.clientId}
                venueId={form.venueId}
                onChange={(clientId, venueId) => setForm((f) => ({ ...f, clientId, venueId }))}
                onClientSaved={onClientSaved}
              />

              <Field label="Briefing">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={6}
                  placeholder="Beskrivelse af eventet (valgfrit)"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
                />
              </Field>

              <AttachmentsField
                attachments={attachments}
                pendingFiles={pendingFiles}
                onAttach={onAttachFiles}
                onRemove={onRemoveAttachment}
                onRemovePending={(i) => setPendingFiles((f) => f.filter((_, idx) => idx !== i))}
              />

              <div className="h-2" />
            </>
          )}

          {step === 2 && (
            <>
              {rows.map((row, i) => (
                <div key={row.key} className="border border-pepo-bd rounded-[10px] p-3 mb-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide">
                      Vagt {i + 1}
                    </span>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row.key)} className="text-pepo-t3 hover:text-[#C0021A]">
                        <i className="ti ti-x text-[14px]" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <select
                      value={row.categoryId}
                      onChange={(e) => updateRow(row.key, { categoryId: e.target.value })}
                      className="w-full border border-pepo-bds rounded-[9px] px-3 py-2 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh"
                    >
                      <option value="">Vælg jobfunktion...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2.5">
                      <div className="flex-1">
                        <TimeField value={row.startTime} onChange={(v) => updateRow(row.key, { startTime: v })} />
                      </div>
                      <div className="flex-1">
                        <TimeField value={row.endTime} onChange={(v) => updateRow(row.key, { endTime: v })} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addRow} className="text-[12.5px] text-pepo-p hover:underline mb-4">
                + Tilføj endnu en vagt
              </button>
            </>
          )}
        </div>

        {error && (
          <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0 flex gap-2.5">
          {state.mode === "editEvent" ? (
            <button
              onClick={saveEventOnly}
              disabled={isPending}
              className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <i className="ti ti-check" />
              {isPending ? "Gemmer..." : "Gem ændringer"}
            </button>
          ) : step === 1 ? (
            <button
              onClick={goToRows}
              className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5"
            >
              Videre til vagter
              <i className="ti ti-chevron-right" />
            </button>
          ) : (
            <>
              {!isAddShiftOnly && (
                <button
                  onClick={() => setStep(1)}
                  className="w-11 h-11 flex-shrink-0 rounded-[10px] border border-pepo-bds flex items-center justify-center text-pepo-t2"
                >
                  <i className="ti ti-chevron-left" />
                </button>
              )}
              <button
                onClick={saveShifts}
                disabled={isPending}
                className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <i className="ti ti-check" />
                {isPending ? "Gemmer..." : "Gem vagter"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function AttachmentsField({
  attachments,
  pendingFiles,
  onAttach,
  onRemove,
  onRemovePending,
}: {
  attachments: { id: string; fileName: string; fileUrl: string }[];
  pendingFiles: File[];
  onAttach: (files: FileList | null) => void;
  onRemove: (id: string, fileUrl: string) => void;
  onRemovePending: (index: number) => void;
}) {
  return (
    <Field label="Vedhæftninger">
      <div className="flex flex-col gap-1.5 mb-2">
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-[13px] text-pepo-t1">
            <i className="ti ti-paperclip text-pepo-t3" />
            <a href={a.fileUrl} target="_blank" rel="noopener" className="flex-1 truncate hover:underline">
              {a.fileName}
            </a>
            <button onClick={() => onRemove(a.id, a.fileUrl)} className="text-pepo-t3 hover:text-[#C0021A]">
              <i className="ti ti-x text-[13px]" />
            </button>
          </div>
        ))}
        {pendingFiles.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px] text-pepo-t1">
            <i className="ti ti-paperclip text-pepo-t3" />
            <span className="flex-1 truncate">{f.name}</span>
            <button onClick={() => onRemovePending(i)} className="text-pepo-t3 hover:text-[#C0021A]">
              <i className="ti ti-x text-[13px]" />
            </button>
          </div>
        ))}
      </div>
      <label className="inline-flex items-center gap-1.5 text-[12.5px] text-pepo-p cursor-pointer hover:underline">
        <i className="ti ti-plus text-[13px]" />
        Vedhæft fil
        <input type="file" multiple className="hidden" onChange={(e) => onAttach(e.target.files)} />
      </label>
    </Field>
  );
}

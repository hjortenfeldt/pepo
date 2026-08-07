"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { DateField, TimeField } from "@/components/admin/ShiftFormFields";
import { VenueAddressFields } from "@/components/admin/VenueAddressFields";
import type { ResolvedAddressResult } from "@/components/AddressAutocompleteInput";
import { getTransportEstimateForRequest } from "@/app/tenant/request/actions";
import { calculateLabourSubtotal, calculateTransportSurcharge, calculateTotal } from "@/lib/pricing";
import type { CategoryOptionWithRate, EventRequestSubmission } from "@/lib/event-requests";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  categories: CategoryOptionWithRate[];
  companyName?: string;
  companyLogoUrl?: string | null;
  onSubmit: (
    input: EventRequestSubmission
  ) => Promise<{ success: true; accessToken: string } | { success: false; error: string }>;
};

type JobLineState = { key: string; categoryId: string; startTime: string; endTime: string };

let rowKeySeq = 0;
function nextRowKey() {
  rowKeySeq += 1;
  return `row-${rowKeySeq}`;
}

function blankJobLine(): JobLineState {
  return { key: nextRowKey(), categoryId: "", startTime: "10:00", endTime: "18:00" };
}

type FormState = {
  title: string;
  eventDate: string;
  description: string;
  customerType: "company" | "private";
  clientName: string;
  cvrNumber: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
  venueName: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  eventDate: "",
  description: "",
  customerType: "company",
  clientName: "",
  cvrNumber: "",
  contactPerson: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
  venueName: "",
};

const STEP_NAMES = ["Personale & tid", "Om eventet", "Dine oplysninger", "Bekræft og send"];

function formatKr(value: number): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(value)) + " kr.";
}

export default function EventRequestForm({ categories, companyName, companyLogoUrl, onSubmit }: Props) {
  const [step, setStep] = useState(1);
  const [jobLines, setJobLines] = useState<JobLineState[]>(() => [blankJobLine()]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [venueAddressText, setVenueAddressText] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venuePostalCode, setVenuePostalCode] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueLat, setVenueLat] = useState<number | null>(null);
  const [venueLng, setVenueLng] = useState<number | null>(null);
  const [venueValidated, setVenueValidated] = useState(false);

  const [transportEstimate, setTransportEstimate] = useState<{ distanceKm: number | null; transportRatePerKm: number } | null>(null);
  const [isEstimating, startEstimating] = useTransition();

  const [submitResult, setSubmitResult] = useState<{ accessToken: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const rates = useMemo(() => new Map(categories.map((c) => [c.id, c.clientRatePerHour])), [categories]);

  const labourSubtotalKr = useMemo(
    () => calculateLabourSubtotal(jobLines, rates),
    [jobLines, rates]
  );

  const transportSurchargeKr = transportEstimate
    ? calculateTransportSurcharge(transportEstimate.distanceKm, transportEstimate.transportRatePerKm, jobLines.length)
    : null;
  const totalKr = calculateTotal(labourSubtotalKr, transportSurchargeKr);

  function updateJobLine(key: string, patch: Partial<JobLineState>) {
    setJobLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addJobLine() {
    setJobLines((rows) => [...rows, blankJobLine()]);
  }
  function removeJobLine(key: string) {
    setJobLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }

  function handleVenueAddressSelected(result: ResolvedAddressResult) {
    setVenueAddress(result.address);
    setVenuePostalCode(result.postalCode);
    setVenueCity(result.city);
    setVenueAddressText(result.formatted);
    setVenueValidated(true);
    setVenueLat(result.lat);
    setVenueLng(result.lng);

    startEstimating(async () => {
      const estimate = await getTransportEstimateForRequest(result.lat, result.lng);
      setTransportEstimate(estimate);
    });
  }

  const canContinueStep1 =
    jobLines.length > 0 && jobLines.every((r) => r.categoryId && r.startTime && r.endTime);

  const canContinueStep2 = form.title.trim().length > 0 && form.eventDate.length > 0;

  const hasUnvalidatedVenue = venueAddressText.trim().length > 0 && !venueValidated;
  const canContinueStep3 =
    (form.customerType === "company" ? form.clientName.trim().length > 0 : form.contactPerson.trim().length > 0) &&
    EMAIL_RE.test(form.contactEmail.trim()) &&
    venueAddress.trim().length > 0 &&
    !hasUnvalidatedVenue;

  function handleSubmit() {
    setError(null);
    const input: EventRequestSubmission = {
      jobLines: jobLines.map((r) => ({ categoryId: r.categoryId, startTime: r.startTime, endTime: r.endTime })),
      title: form.title.trim(),
      eventDate: form.eventDate,
      description: form.description.trim(),
      customerType: form.customerType,
      clientName: form.clientName.trim(),
      cvrNumber: form.cvrNumber.trim(),
      contactPerson: form.contactPerson.trim(),
      contactPhone: form.contactPhone.trim(),
      contactEmail: form.contactEmail.trim(),
      notes: form.notes.trim(),
      venueName: form.venueName.trim(),
      venueAddress,
      venuePostalCode,
      venueCity,
      venueLat,
      venueLng,
    };

    startTransition(async () => {
      const result = await onSubmit(input);
      if (result.success) {
        setSubmitResult({ accessToken: result.accessToken });
      } else {
        setError(result.error);
      }
    });
  }

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="bg-pepo-wh rounded-[20px] w-full max-w-[480px] px-[var(--page-px)] py-8 shadow-[0_4px_32px_rgba(62,31,138,0.10)]">
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
      ) : (
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-10 h-10 rounded-[10px] bg-pepo-p flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <circle cx="8.5" cy="11" r="5.5" fill="white" />
              <circle cx="17" cy="11" r="3.5" fill="white" opacity="0.6" />
            </svg>
          </div>
          <span className="text-xl font-medium text-pepo-t1">pepo</span>
        </div>
      )}
      {companyName && (
        <div className="text-[13px] text-pepo-t2 mb-6">Bed om personale til dit event hos {companyName}</div>
      )}
      {!companyName && <div className="mb-6" />}

      {submitResult ? (
        <SuccessScreen accessToken={submitResult.accessToken} email={form.contactEmail} />
      ) : (
        <>
          <StepBar step={step} />

          {step === 1 && (
            <Step1
              jobLines={jobLines}
              categories={categories}
              labourSubtotalKr={labourSubtotalKr}
              onUpdate={updateJobLine}
              onAdd={addJobLine}
              onRemove={removeJobLine}
              canContinue={canContinueStep1}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2 form={form} update={update} canContinue={canContinueStep2} onBack={() => setStep(1)} onNext={() => setStep(3)} />
          )}

          {step === 3 && (
            <Step3
              form={form}
              update={update}
              venueAddressText={venueAddressText}
              venueValidated={venueValidated}
              hasUnvalidatedVenue={hasUnvalidatedVenue}
              onVenueAddressTextChange={(text) => {
                setVenueAddressText(text);
                setVenueValidated(false);
              }}
              onVenueAddressSelected={handleVenueAddressSelected}
              canContinue={canContinueStep3}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}

          {step === 4 && (
            <Step4
              form={form}
              jobLines={jobLines}
              categoryName={categoryName}
              labourSubtotalKr={labourSubtotalKr}
              transportSurchargeKr={transportSurchargeKr}
              isEstimating={isEstimating}
              totalKr={totalKr}
              venueAddressText={venueAddressText}
              error={error}
              isPending={isPending}
              onBack={() => setStep(3)}
              onSubmit={handleSubmit}
            />
          )}
        </>
      )}
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="mb-7">
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[13px] font-medium text-pepo-p">{STEP_NAMES[step - 1]}</span>
        <span className="text-[13px] text-pepo-t3">Trin {step} af 4</span>
      </div>
      <div className="flex items-center gap-0">
        {[1, 2, 3, 4].map((n, i) => (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div
              className={
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 transition-all " +
                (n < step
                  ? "bg-pepo-p text-white"
                  : n === step
                  ? "bg-pepo-p text-white shadow-[0_0_0_4px_var(--pepo-pl)]"
                  : "bg-pepo-su text-pepo-t3 border border-pepo-bd")
              }
            >
              {n < step ? "✓" : n}
            </div>
            {i < 3 && <div className={"flex-1 h-0.5 mx-0 " + (n < step ? "bg-pepo-p" : "bg-pepo-bd")} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const inputClass =
  "w-full border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-sm text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p";
const labelClass = "block text-[13px] font-medium text-pepo-t1 mb-[5px]";

function Step1({
  jobLines,
  categories,
  labourSubtotalKr,
  onUpdate,
  onAdd,
  onRemove,
  canContinue,
  onNext,
}: {
  jobLines: JobLineState[];
  categories: CategoryOptionWithRate[];
  labourSubtotalKr: number;
  onUpdate: (key: string, patch: Partial<JobLineState>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  canContinue: boolean;
  onNext: () => void;
}) {
  return (
    <div>
      <Heading title="Personale & tid" subtitle="Hvilke jobfunktioner har I brug for, og hvornår?" />

      {jobLines.map((row) => (
        <div key={row.key} className="relative border border-pepo-bd rounded-[10px] pt-3.5 px-3.5 pb-3.5 mb-3">
          {jobLines.length > 1 && (
            <button
              type="button"
              onClick={() => onRemove(row.key)}
              title="Fjern"
              className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md flex items-center justify-center text-pepo-t3 hover:bg-pepo-su hover:text-[#C0021A]"
            >
              <Icon name="x" size={16} />
            </button>
          )}
          <div className="mb-3">
            <label className={labelClass}>Jobfunktion</label>
            <select
              className={inputClass + " bg-pepo-wh"}
              value={row.categoryId}
              onChange={(e) => onUpdate(row.key, { categoryId: e.target.value })}
            >
              <option value="">Vælg jobfunktion...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2.5">
            <div className="flex-1 min-w-0">
              <label className={labelClass}>Start</label>
              <TimeField value={row.startTime} onChange={(v) => onUpdate(row.key, { startTime: v })} />
            </div>
            <div className="flex-1 min-w-0">
              <label className={labelClass}>Slut</label>
              <TimeField value={row.endTime} onChange={(v) => onUpdate(row.key, { endTime: v })} />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="w-full h-10 rounded-[9px] border border-dashed border-pepo-bds bg-pepo-wh text-pepo-p text-[13px] font-medium flex items-center justify-center gap-1.5 mb-5 hover:bg-pepo-pl"
      >
        <Icon name="plus" size={14} />
        Tilføj endnu en jobfunktion
      </button>

      <div className="bg-pepo-su rounded-xl px-4 py-3.5 mb-5 flex items-center justify-between">
        <span className="text-[13px] text-pepo-t2">Personale i alt (uden transport)</span>
        <span className="text-[15px] font-medium text-pepo-t1">{formatKr(labourSubtotalKr)}</span>
      </div>

      <div className="flex gap-2.5 mt-2">
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          Fortsæt
        </PrimaryButton>
      </div>
    </div>
  );
}

function Step2({
  form,
  update,
  canContinue,
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  canContinue: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <Heading title="Om eventet" />

      <Field label="Titel / anledning">
        <input
          type="text"
          className={inputClass}
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </Field>

      <Field label="Dato">
        <DateField value={form.eventDate} onChange={(v) => update("eventDate", v)} />
      </Field>

      <Field label="Briefing">
        <textarea
          className={inputClass + " min-h-[100px] leading-relaxed resize-y"}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </Field>

      <div className="flex gap-2.5 mt-2">
        <OutlineButton onClick={onBack}>Tilbage</OutlineButton>
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          Fortsæt
        </PrimaryButton>
      </div>
    </div>
  );
}

function Step3({
  form,
  update,
  venueAddressText,
  venueValidated,
  hasUnvalidatedVenue,
  onVenueAddressTextChange,
  onVenueAddressSelected,
  canContinue,
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  venueAddressText: string;
  venueValidated: boolean;
  hasUnvalidatedVenue: boolean;
  onVenueAddressTextChange: (text: string) => void;
  onVenueAddressSelected: (result: ResolvedAddressResult) => void;
  canContinue: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <Heading title="Dine oplysninger" />

      <Field label="Kundetype">
        <div className="flex bg-pepo-su rounded-[9px] p-[3px]">
          <button
            type="button"
            onClick={() => update("customerType", "company")}
            className={
              "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
              (form.customerType === "company" ? "bg-pepo-p text-white" : "text-pepo-t2")
            }
          >
            Firmakunde
          </button>
          <button
            type="button"
            onClick={() => update("customerType", "private")}
            className={
              "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
              (form.customerType === "private" ? "bg-pepo-p text-white" : "text-pepo-t2")
            }
          >
            Privatkunde
          </button>
        </div>
      </Field>

      {form.customerType === "company" && (
        <>
          <Field label="Firmanavn">
            <input
              type="text"
              className={inputClass}
              value={form.clientName}
              onChange={(e) => update("clientName", e.target.value)}
            />
          </Field>
          <Field label="CVR-nummer">
            <input
              type="text"
              className={inputClass}
              value={form.cvrNumber}
              onChange={(e) => update("cvrNumber", e.target.value)}
            />
          </Field>
        </>
      )}

      <Field label="Kontaktperson">
        <input
          type="text"
          className={inputClass}
          value={form.contactPerson}
          onChange={(e) => update("contactPerson", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="min-w-0">
          <label className={labelClass}>Telefon</label>
          <input
            type="tel"
            className={inputClass}
            value={form.contactPhone}
            onChange={(e) => update("contactPhone", e.target.value)}
          />
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Email</label>
          <input
            type="email"
            className={inputClass}
            value={form.contactEmail}
            onChange={(e) => update("contactEmail", e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-pepo-bd my-5" />

      <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">
        Eventsted hvor personalet skal arbejde
      </div>
      <VenueAddressFields
        name={form.venueName}
        addressText={venueAddressText}
        validated={venueValidated}
        onNameChange={(value) => update("venueName", value)}
        onAddressTextChange={onVenueAddressTextChange}
        onAddressSelected={onVenueAddressSelected}
      />

      <Field label="Andet vi bør vide (valgfrit)">
        <textarea
          className={inputClass + " min-h-[80px] leading-relaxed resize-y"}
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </Field>

      <div className="flex gap-2.5 mt-2">
        <OutlineButton onClick={onBack}>Tilbage</OutlineButton>
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          Fortsæt
        </PrimaryButton>
      </div>
      {hasUnvalidatedVenue && (
        <p className="mt-3 text-[12px] text-[#9A6B00]">
          Vælg eventstedets adresse fra listen, før du kan fortsætte.
        </p>
      )}
    </div>
  );
}

function Step4({
  form,
  jobLines,
  categoryName,
  labourSubtotalKr,
  transportSurchargeKr,
  isEstimating,
  totalKr,
  venueAddressText,
  error,
  isPending,
  onBack,
  onSubmit,
}: {
  form: FormState;
  jobLines: JobLineState[];
  categoryName: (id: string) => string;
  labourSubtotalKr: number;
  transportSurchargeKr: number | null;
  isEstimating: boolean;
  totalKr: number;
  venueAddressText: string;
  error: string | null;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <Heading title="Bekræft og send" subtitle="Tjek oplysningerne inden du sender forespørgslen" />

      <div className="bg-pepo-su rounded-xl px-4 py-3.5 mb-4">
        <div className="text-[11px] text-pepo-t3 uppercase tracking-wide mb-2">Personale</div>
        {jobLines.map((r) => (
          <div key={r.key} className="text-sm text-pepo-t1 py-1">
            {categoryName(r.categoryId) || "—"}{" "}
            <span className="text-pepo-t2">
              · {r.startTime}–{r.endTime}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-pepo-su rounded-xl px-4 py-3.5 mb-4">
        <Row label="Event" value={form.title || "—"} />
        <Row label="Dato" value={form.eventDate || "—"} />
        <Row label="Eventsted" value={venueAddressText || "—"} />
        <Row
          label={form.customerType === "company" ? "Firma" : "Navn"}
          value={(form.customerType === "company" ? form.clientName : form.contactPerson) || "—"}
        />
        <Row label="Email" value={form.contactEmail || "—"} last />
      </div>

      <div className="bg-pepo-pl rounded-xl px-4 py-3.5 mb-5">
        <Row label="Personale i alt" value={formatKr(labourSubtotalKr)} plain />
        <Row
          label="Transporttillæg"
          value={isEstimating ? "Beregner..." : transportSurchargeKr != null ? formatKr(transportSurchargeKr) : "Beregnes"}
          plain
        />
        <div className="border-t border-pepo-p/15 my-2" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-pepo-t1">Samlet estimat</span>
          <span className="text-[17px] font-semibold text-pepo-p">{formatKr(totalKr)}</span>
        </div>
      </div>

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      <div className="flex gap-2.5 mt-2">
        <OutlineButton onClick={onBack} disabled={isPending}>
          Tilbage
        </OutlineButton>
        <PrimaryButton onClick={onSubmit} disabled={isPending}>
          {isPending ? "Sender..." : "Send forespørgsel"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function Row({ label, value, last, plain }: { label: string; value: string; last?: boolean; plain?: boolean }) {
  if (plain) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-[13px] text-pepo-t2">{label}</span>
        <span className="text-sm text-pepo-t1">{value}</span>
      </div>
    );
  }
  return (
    <div className={"py-2.5 " + (last ? "" : "border-b border-pepo-bd")}>
      <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-pepo-t1 mt-0.5">{value}</div>
    </div>
  );
}

function SuccessScreen({ accessToken, email }: { accessToken: string; email: string }) {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-full bg-[#EAF6EE] flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl text-pepo-gr">✓</span>
      </div>
      <div className="text-[22px] font-medium text-pepo-t1 tracking-tight mb-2">Tak for din forespørgsel!</div>
      <p className="text-sm text-pepo-t2 leading-relaxed">
        Vi gennemgår den og vender tilbage hurtigst muligt.
        {email && (
          <>
            <br />
            <br />
            Du vil modtage svar/opdateringer på <strong>{email}</strong>.
          </>
        )}
      </p>
      <div className="mt-7">
        <Link
          href={`/status/${accessToken}`}
          className="inline-block h-[46px] leading-[46px] px-6 rounded-[10px] text-[15px] font-medium bg-pepo-p text-white hover:opacity-90 transition-opacity"
        >
          Se status for forespørgslen
        </Link>
      </div>
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <div className="text-xl font-medium text-pepo-t1 tracking-tight">{title}</div>
      {subtitle && <div className="text-sm text-pepo-t2 mt-1">{subtitle}</div>}
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-[46px] rounded-[10px] text-[15px] font-medium flex-1 bg-pepo-p text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function OutlineButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-[46px] rounded-[10px] text-[15px] font-medium flex-1 bg-pepo-wh text-pepo-t2 border border-pepo-bds transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

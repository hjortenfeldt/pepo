"use client";

import { useMemo, useState, useTransition } from "react";
import { submitRegistration } from "@/app/actions";
import type { WorkCategory } from "@/lib/types";

type Props = {
  categories: WorkCategory[];
};

type FormState = {
  fullName: string;
  gender: string;
  birthDate: string;
  location: string;
  email: string;
  phone: string;
  categoryIds: string[];
  bio: string;
  socialMediaUrl: string;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  gender: "",
  birthDate: "",
  location: "",
  email: "",
  phone: "",
  categoryIds: [],
  bio: "",
  socialMediaUrl: "",
};

const STEP_NAMES = ["Om dig", "Arbejdskategorier", "Din profil", "Bekræft og send"];

function getInitials(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0][0].toUpperCase();
  return "?";
}

export default function RegistrationForm({ categories }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initials = useMemo(() => getInitials(form.fullName), [form.fullName]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategory(id: string) {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((c) => c !== id)
        : [...prev.categoryIds, id],
    }));
  }

  function canContinueFromStep1() {
    return (
      form.fullName.trim().length > 0 &&
      form.birthDate.length > 0 &&
      form.email.trim().length > 0 &&
      form.phone.trim().length > 0
    );
  }

  function handleSubmit() {
    setError(null);
    const fd = new FormData();
    fd.set("fullName", form.fullName.trim());
    fd.set("gender", form.gender);
    fd.set("birthDate", form.birthDate);
    fd.set("location", form.location.trim());
    fd.set("email", form.email.trim());
    fd.set("phone", form.phone.trim());
    fd.set("bio", form.bio.trim());
    fd.set("socialMediaUrl", form.socialMediaUrl.trim());
    form.categoryIds.forEach((id) => fd.append("categoryIds", id));
    if (profileImage) fd.set("profileImage", profileImage);

    startTransition(async () => {
      const result = await submitRegistration(fd);
      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setProfileImage(null);
    setSubmitted(false);
    setError(null);
    setStep(1);
  }

  const categoryNameById = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="bg-pepo-wh rounded-[20px] w-full max-w-[480px] p-8 shadow-[0_4px_32px_rgba(62,31,138,0.10)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-7">
        <div className="w-10 h-10 rounded-[10px] bg-pepo-p flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle cx="8.5" cy="11" r="5.5" fill="white" />
            <circle cx="17" cy="11" r="3.5" fill="white" opacity="0.6" />
          </svg>
        </div>
        <span className="text-xl font-medium text-pepo-t1">pepo</span>
      </div>

      {submitted ? (
        <SuccessScreen
          firstName={form.fullName.trim().split(/\s+/)[0] || "der"}
          email={form.email || "din email"}
          onReset={resetForm}
        />
      ) : (
        <>
          <StepBar step={step} />

          {step === 1 && (
            <Step1
              form={form}
              update={update}
              canContinue={canContinueFromStep1()}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2
              categories={categories}
              selected={form.categoryIds}
              onToggle={toggleCategory}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <Step3
              form={form}
              initials={initials}
              profileImage={profileImage}
              onProfileImage={setProfileImage}
              update={update}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}

          {step === 4 && (
            <Step4
              form={form}
              categoryNames={form.categoryIds.map(categoryNameById)}
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
        <span className="text-[13px] font-medium text-pepo-p">
          {STEP_NAMES[step - 1]}
        </span>
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
            {i < 3 && (
              <div
                className={
                  "flex-1 h-0.5 mx-0 " +
                  (n < step ? "bg-pepo-p" : "bg-pepo-bd")
                }
              />
            )}
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
  form,
  update,
  canContinue,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  canContinue: boolean;
  onNext: () => void;
}) {
  return (
    <div>
      <Heading title="Om dig" subtitle="Fortæl os lidt om dig selv" />

      <Field label="Fuldt navn">
        <input
          type="text"
          className={inputClass}
          placeholder="Maria Hansen"
          value={form.fullName}
          onChange={(e) => update("fullName", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className={labelClass}>Køn</label>
          <select
            className={inputClass}
            value={form.gender}
            onChange={(e) => update("gender", e.target.value)}
          >
            <option value="">Vælg</option>
            <option>Kvinde</option>
            <option>Mand</option>
            <option>Ikke-binær</option>
            <option>Ønsker ikke at oplyse</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Fødselsdato</label>
          <input
            type="date"
            className={inputClass}
            value={form.birthDate}
            onChange={(e) => update("birthDate", e.target.value)}
          />
        </div>
      </div>

      <Field label="By / postnummer">
        <input
          type="text"
          className={inputClass}
          placeholder="2200 København N"
          value={form.location}
          onChange={(e) => update("location", e.target.value)}
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          className={inputClass}
          placeholder="maria@email.dk"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
        />
      </Field>

      <Field label="Mobilnummer">
        <input
          type="tel"
          className={inputClass}
          placeholder="+45 20 11 22 33"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
        />
      </Field>

      <div className="flex gap-2.5 mt-2">
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          Fortsæt
        </PrimaryButton>
      </div>
    </div>
  );
}

function Step2({
  categories,
  selected,
  onToggle,
  onBack,
  onNext,
}: {
  categories: WorkCategory[];
  selected: string[];
  onToggle: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <Heading
        title="Arbejdskategorier"
        subtitle="Hvad er du uddannet eller erfaren som?"
      />
      <div className="mb-4">
        <label className={labelClass}>Vælg én eller flere kategorier</label>
        {categories.length === 0 ? (
          <p className="text-[13px] text-pepo-t3 mt-2">
            Ingen kategorier er sat op endnu. Kontakt Pepo, eller prøv igen
            senere.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1.5">
            {categories.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => onToggle(c.id)}
                  className={
                    "px-3.5 py-1.5 rounded-full border text-[13px] transition-all select-none " +
                    (on
                      ? "bg-pepo-pl border-pepo-p text-pepo-p font-medium"
                      : "bg-pepo-wh border-pepo-bds text-pepo-t2 hover:border-pepo-pm hover:text-pepo-pm")
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-pepo-t3 mt-1">
          Du kan altid ændre dine kategorier i profilen bagefter.
        </p>
      </div>
      <div className="flex gap-2.5 mt-2">
        <OutlineButton onClick={onBack}>Tilbage</OutlineButton>
        <PrimaryButton onClick={onNext} disabled={selected.length === 0}>
          Fortsæt
        </PrimaryButton>
      </div>
    </div>
  );
}

function Step3({
  form,
  initials,
  profileImage,
  onProfileImage,
  update,
  onBack,
  onNext,
}: {
  form: FormState;
  initials: string;
  profileImage: File | null;
  onProfileImage: (file: File | null) => void;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <Heading title="Din profil" subtitle="Et billede og lidt om din erfaring" />

      <div className="w-16 h-16 rounded-full bg-pepo-pl flex items-center justify-center text-[22px] font-medium text-pepo-p mx-auto mb-2">
        {initials}
      </div>
      <div className="text-center text-[13px] text-pepo-t2 mb-5">
        {form.fullName.trim() || "Dit navn"}
      </div>

      <Field label="Profilbillede">
        <label
          className={
            "block border-[1.5px] border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors " +
            (profileImage
              ? "border-pepo-gr bg-pepo-pl"
              : "border-pepo-bds hover:border-pepo-p hover:bg-pepo-pl")
          }
        >
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => onProfileImage(e.target.files?.[0] ?? null)}
          />
          <div className="text-[13px] font-medium text-pepo-t2">
            {profileImage
              ? `${profileImage.name} — valgt ✓`
              : "Tryk for at uploade"}
          </div>
          <div className="text-[11px] text-pepo-t3 mt-[3px]">
            JPG eller PNG · Max 5 MB
          </div>
        </label>
      </Field>

      <Field label="Om mig / arbejdserfaring">
        <textarea
          className={inputClass + " min-h-[80px] leading-relaxed resize-y"}
          placeholder="Jeg har 3 års erfaring som tjener og bartender på restauranter i København. Jeg er fleksibel, serviceminded og trives i travle miljøer..."
          value={form.bio}
          onChange={(e) => update("bio", e.target.value)}
        />
      </Field>

      <Field
        label={
          <>
            Link til SoMe-profil{" "}
            <span className="font-normal text-pepo-t3">(valgfrit)</span>
          </>
        }
      >
        <input
          type="text"
          className={inputClass}
          placeholder="https://instagram.com/mariahansen"
          value={form.socialMediaUrl}
          onChange={(e) => update("socialMediaUrl", e.target.value)}
        />
      </Field>

      <div className="flex gap-2.5 mt-2">
        <OutlineButton onClick={onBack}>Tilbage</OutlineButton>
        <PrimaryButton onClick={onNext}>Fortsæt</PrimaryButton>
      </div>
    </div>
  );
}

function Step4({
  form,
  categoryNames,
  error,
  isPending,
  onBack,
  onSubmit,
}: {
  form: FormState;
  categoryNames: string[];
  error: string | null;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Navn", value: form.fullName || "—" },
    { label: "Email", value: form.email || "—" },
    { label: "Mobil", value: form.phone || "—" },
    { label: "By", value: form.location || "—" },
    { label: "Kategorier", value: categoryNames.length ? categoryNames.join(", ") : "—" },
  ];

  return (
    <div>
      <Heading title="Bekræft og send" subtitle="Tjek dine oplysninger inden du sender" />

      <div className="bg-pepo-su rounded-xl px-4 py-3.5 mb-5">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={
              "py-2.5 " + (i < rows.length - 1 ? "border-b border-pepo-bd" : "")
            }
          >
            <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">
              {r.label}
            </div>
            <div className="text-sm text-pepo-t1 mt-0.5">{r.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="flex gap-2.5 mt-2">
        <OutlineButton onClick={onBack} disabled={isPending}>
          Tilbage
        </OutlineButton>
        <PrimaryButton onClick={onSubmit} disabled={isPending}>
          {isPending ? "Sender..." : "Send ansøgning"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function SuccessScreen({
  firstName,
  email,
  onReset,
}: {
  firstName: string;
  email: string;
  onReset: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-full bg-[#EAF6EE] flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl text-pepo-gr">✓</span>
      </div>
      <div className="text-[22px] font-medium text-pepo-t1 tracking-tight mb-2">
        Tak, {firstName}!
      </div>
      <p className="text-sm text-pepo-t2 leading-relaxed">
        Din ansøgning er modtaget. Vi gennemgår den og vender tilbage til dig
        hurtigst muligt.
        <br />
        <br />
        Du vil modtage en bekræftelse på <strong>{email}</strong>.
      </p>
      <div className="mt-7">
        <button
          type="button"
          onClick={onReset}
          className="h-[46px] px-6 rounded-[10px] text-[15px] font-medium bg-pepo-p text-white hover:opacity-90 transition-opacity"
        >
          Indsend endnu en ansøgning
        </button>
      </div>
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <div className="text-xl font-medium text-pepo-t1 tracking-tight">
        {title}
      </div>
      <div className="text-sm text-pepo-t2 mt-1">{subtitle}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
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

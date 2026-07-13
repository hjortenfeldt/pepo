"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { normalizePhone } from "@/lib/format";
import {
  updateCompanyProfile,
  updateCompanySlug,
  type CompanyProfileInput,
} from "@/app/tenant/(protected)/settings/company/actions";
import CompanyLogoSettings from "./CompanyLogoSettings";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

type CompanyProfileData = CompanyProfileInput & { slug: string; logoUrl: string | null };

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"mb-4 " + className}>
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p";

export default function CompanyProfileSettings({ initial }: { initial: CompanyProfileData }) {
  const [form, setForm] = useState<CompanyProfileInput>(initial);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, startProfileTransition] = useTransition();

  const [slug, setSlug] = useState(initial.slug);
  const [slugInput, setSlugInput] = useState(initial.slug);
  const [confirmingSlug, setConfirmingSlug] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [newSlugSaved, setNewSlugSaved] = useState<string | null>(null);
  const [isSavingSlug, startSlugTransition] = useTransition();

  function saveProfile() {
    setProfileError(null);
    setProfileSaved(false);
    startProfileTransition(async () => {
      const res = await updateCompanyProfile(form);
      if (!res.success) {
        setProfileError(res.error);
        return;
      }
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    });
  }

  function saveSlug() {
    setSlugError(null);
    startSlugTransition(async () => {
      const res = await updateCompanySlug(slugInput);
      if (!res.success) {
        setSlugError(res.error);
        return;
      }
      setSlug(res.slug);
      setSlugInput(res.slug);
      setConfirmingSlug(false);
      setNewSlugSaved(res.slug);
    });
  }

  const slugChanged = slugInput.trim().toLowerCase() !== slug;

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Firmaoplysninger</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">Jeres stamdata og virksomhedens webadresse</div>
      </div>

      <div className="px-8 py-[22px] pb-10 max-w-2xl">
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6 mb-4">
          <div className="text-[15px] font-semibold text-pepo-t1 mb-4">Virksomhedsoplysninger</div>

          <Field label="Firmanavn">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="CVR-nr.">
            <input
              value={form.cvrNumber}
              onChange={(e) => setForm((f) => ({ ...f, cvrNumber: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Adresse">
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Postnr." className="w-28">
              <input
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="By" className="flex-1">
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Kontaktperson">
            <input
              value={form.contactPerson}
              onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Telefon" className="flex-1">
              <input
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                onBlur={(e) => setForm((f) => ({ ...f, contactPhone: normalizePhone(e.target.value) }))}
                className={inputClass}
              />
            </Field>
            <Field label="Email" className="flex-1">
              <input
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                className={inputClass}
              />
            </Field>
          </div>

          {profileError && (
            <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {profileError}
            </p>
          )}

          <button
            type="button"
            onClick={saveProfile}
            disabled={isSavingProfile}
            className="h-11 px-4 rounded-[10px] text-[13px] font-medium bg-pepo-p text-white flex items-center gap-1.5 disabled:opacity-40"
          >
            <Icon name="check" size={16} />
            {isSavingProfile ? "Gemmer..." : profileSaved ? "Gemt" : "Gem ændringer"}
          </button>
        </div>

        <CompanyLogoSettings initialLogoUrl={initial.logoUrl} />

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="text-[15px] font-semibold text-pepo-t1 mb-1">Webadresse</div>
          <div className="text-[12.5px] text-pepo-t2 mb-4">
            Jeres nuværende adresse er{" "}
            <span className="font-medium text-pepo-t1">
              {slug}.{ROOT_DOMAIN}
            </span>
          </div>

          <Field label="Ny webadresse">
            <div className="flex items-center gap-1.5">
              <input
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(e.target.value);
                  setNewSlugSaved(null);
                }}
                className={inputClass + " flex-1"}
              />
              <span className="text-[13.5px] text-pepo-t3 flex-shrink-0">.{ROOT_DOMAIN}</span>
            </div>
          </Field>

          {slugError && (
            <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {slugError}
            </p>
          )}

          {newSlugSaved && (
            <div className="mb-4 text-[12.5px] text-[#1A7A34] bg-[#EAF6EE] border border-[#c9e9d3] rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
              <span>Webadressen er ændret. I skal logge ind igen på den nye adresse.</span>
              <a
                href={`https://${newSlugSaved}.${ROOT_DOMAIN}/login`}
                className="font-medium underline flex-shrink-0"
              >
                Gå til {newSlugSaved}.{ROOT_DOMAIN}
              </a>
            </div>
          )}

          {slugChanged && !confirmingSlug && (
            <button
              type="button"
              onClick={() => setConfirmingSlug(true)}
              className="h-10 px-4 rounded-[9px] text-[13px] font-medium border border-pepo-bds text-pepo-t1 hover:bg-pepo-su transition-colors"
            >
              Skift webadresse
            </button>
          )}

          {confirmingSlug && (
            <div className="rounded-[10px] border border-[#F3C9C9] bg-[#FDECEA] px-3.5 py-3">
              <div className="flex items-start gap-2 text-[12.5px] text-[#C0021A] leading-relaxed mb-3">
                <Icon name="alert-triangle" size={16} className="flex-shrink-0 mt-0.5" />
                <div>
                  Jeres nuværende adresse (<span className="font-medium">{slug}.{ROOT_DOMAIN}</span>) holder op
                  med at virke med det samme. Eventuelle bogmærker og jeres kalender-abonnementslink (under
                  Sync med kalender) skal opdateres til den nye adresse, ellers holder de op med at virke.
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={saveSlug}
                  disabled={isSavingSlug}
                  className="h-10 px-4 rounded-[9px] text-[13px] font-medium bg-[#C0021A] text-white disabled:opacity-40"
                >
                  {isSavingSlug ? "Skifter..." : "Ja, skift webadresse"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingSlug(false);
                    setSlugInput(slug);
                    setSlugError(null);
                  }}
                  disabled={isSavingSlug}
                  className="h-10 px-4 rounded-[9px] text-[13px] font-medium border border-pepo-bds text-pepo-t1 hover:bg-pepo-su transition-colors bg-pepo-wh"
                >
                  Fortryd
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

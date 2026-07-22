"use client";

import { useState, useTransition } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import { AddressAutocompleteInput, type ResolvedAddressResult } from "@/components/AddressAutocompleteInput";
import { updateMyProfile, type MyProfileFormInput } from "@/app/freelancer/(protected)/profil/actions";
import type { EditableProfile, WorkCategoryOption } from "@/lib/freelancer";

// Freelancer-lokation skal kun matche by/postnummer-niveau, ikke en fuld
// gadeadresse — samme grovere granularitet som admins "Redigér freelancer"
// (se [[project_address_soft_validation_feature]]).
const LOCATION_TYPES = ["locality", "postal_code"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

/**
 * Freelancerens egen "Rediger profil"-side, nået via profilklodsen øverst på
 * "Mere". Feltsæt og gemme-flow er bevidst en tro kopi af admins "Redigér
 * freelancer"-panel i components/admin/FreelancerBoard.tsx (samme labels,
 * samme rækkefølge, samme lokations-/foto-/jobfunktions-logik) — se
 * feedback_freelancer_profile_fields_in_sync. Layoutet er dog en almindelig
 * fremadrettet side (sticky header + sticky gem-knap i bunden af det
 * scrollende indhold), ikke et slide-in-panel, da freelancer-appen ikke har
 * det mønster andre steder (se fx ShiftRequestDetail.tsx/ColleagueDetail.tsx).
 */
export default function ProfileEditForm({
  profileId,
  profile,
  allCategories,
}: {
  profileId: string;
  profile: EditableProfile;
  allCategories: WorkCategoryOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<MyProfileFormInput>({
    fullName: profile.fullName,
    gender: profile.gender ?? "",
    birthDate: profile.birthDate ?? "",
    phone: profile.phone,
    email: profile.email ?? "",
    location: profile.location ?? "",
    bio: profile.bio ?? "",
    socialMediaUrl: profile.socialMediaUrl ?? "",
    categoryIds: profile.categoryIds,
    hasLicense: profile.hasLicense,
    photoDataUrl: null,
  });
  // Adressen (form.location) opdateres kun ved et bekræftet valg fra
  // Google-dropdown'en — locationText er den viste søgetekst, som kan være
  // midt i at blive redigeret uden endnu at være valideret.
  const [locationText, setLocationText] = useState(profile.location ?? "");
  const [locationValidated, setLocationValidated] = useState((profile.location ?? "").trim().length > 0);
  const [existingPhotoUrl] = useState<string | null>(profile.profileImageUrl);
  const [showPhotoUpload, setShowPhotoUpload] = useState(!profile.profileImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleCat(catId: string) {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(catId)
        ? f.categoryIds.filter((c) => c !== catId)
        : [...f.categoryIds, catId],
    }));
  }

  function onPhotoSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm((f) => ({ ...f, photoDataUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  }

  function handleLocationSelected(result: ResolvedAddressResult) {
    setForm((f) => ({ ...f, location: result.formatted }));
    setLocationText(result.formatted);
    setLocationValidated(true);
  }

  const hasUnvalidatedLocation = locationText.trim().length > 0 && !locationValidated;

  function handleSave() {
    setError(null);
    if (!form.fullName.trim()) {
      setError("Udfyld navn");
      return;
    }
    if (!form.birthDate) {
      setError("Udfyld fødselsdato");
      return;
    }
    if (form.categoryIds.length === 0) {
      setError("Vælg mindst én jobfunktion");
      return;
    }
    startTransition(async () => {
      const result = await updateMyProfile(profileId, form);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.push("/mere");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-pepo-wh px-4 py-3 border-b border-pepo-bd flex items-center">
        <Link href="/mere" className="flex items-center gap-2 text-pepo-t1 -ml-1 px-1 py-0.5">
          <Icon name="arrow-left" size={18} />
          <span className="text-[14px] font-medium">Rediger profil</span>
        </Link>
      </div>

      <div className="px-5 pt-5 pb-8">
        {!showPhotoUpload ? (
          <div className="mb-5">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Profilbillede
            </label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-pepo-pl text-pepo-p text-[15px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
                {existingPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={existingPhotoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials(form.fullName || "?")
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoUpload(true)}
                className="h-[34px] px-3.5 rounded-lg border border-pepo-bds bg-pepo-wh text-pepo-t1 text-[12.5px] font-medium hover:bg-pepo-su transition-colors"
              >
                Skift billede
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Profilbillede
            </label>
            <label className="block border-[1.5px] border-dashed border-pepo-bds rounded-xl p-5 text-center cursor-pointer hover:border-pepo-p hover:bg-pepo-pl transition-colors">
              {form.photoDataUrl ? (
                <div className="w-[52px] h-[52px] rounded-full overflow-hidden mx-auto mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.photoDataUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <Icon name="camera" size={26} className="text-pepo-t3 block mx-auto mb-1.5" />
              )}
              <div className="text-[13px] font-medium text-pepo-t2">
                {form.photoDataUrl ? "Tryk for at skifte billede" : "Tryk for at uploade"}
              </div>
              <div className="text-[11px] text-pepo-t3 mt-[3px]">JPG eller PNG · Max 5 MB</div>
              <input type="file" accept="image/*" className="hidden" onChange={onPhotoSelected} />
            </label>
          </div>
        )}

        <Field label="Navn">
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            placeholder="Fx Anna Berg"
            className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
          />
        </Field>

        <div className="flex gap-2.5">
          <Field label="Køn" className="flex-1">
            <select
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh"
            >
              <option value="">Vælg</option>
              <option>Kvinde</option>
              <option>Mand</option>
              <option>Ikke-binær</option>
              <option>Ønsker ikke at oplyse</option>
            </select>
          </Field>
          <Field label="Fødselsdato" className="flex-1">
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
          </Field>
        </div>

        <div className="flex gap-2.5">
          <Field label="Telefon" className="flex-1">
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="20 30 40 50"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
          </Field>
          <Field label="Email" className="flex-1">
            <input
              type="text"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="anna@email.dk"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
          </Field>
        </div>

        <Field label="Lokation">
          <AddressAutocompleteInput
            value={locationText}
            onChangeText={(text) => {
              setLocationText(text);
              setLocationValidated(false);
            }}
            onSelect={handleLocationSelected}
            includedPrimaryTypes={LOCATION_TYPES}
            placeholder="Fx 2100 København Ø"
            className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
          />
        </Field>
        {hasUnvalidatedLocation && (
          <p className="-mt-2 mb-4 text-[12px] text-[#9A6B00] bg-[#FFF7E6] border border-[#F5D889] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
            <Icon name="alert-triangle" size={14} className="flex-shrink-0 mt-px" />
            Vælg lokationen fra listen, der dukker op, mens du skriver — den skal bekræftes hos Google, før den kan gemmes.
          </p>
        )}

        <Field label="Jobfunktion(er)">
          <div className="flex flex-wrap gap-2">
            {allCategories.map((c) => {
              const on = form.categoryIds.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggleCat(c.id)}
                  className={
                    "px-3.5 py-[7px] rounded-full text-[12.5px] font-medium transition-colors " +
                    (on ? "bg-pepo-pl text-pepo-p" : "bg-pepo-su text-pepo-t2 hover:bg-pepo-bd")
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Note (valgfrit)">
          <textarea
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            rows={6}
            placeholder="Fx erfaring eller andet relevant"
            className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
          />
        </Field>

        <Field label="Link til SoMe-profil (valgfrit)">
          <input
            type="text"
            value={form.socialMediaUrl}
            onChange={(e) => setForm((f) => ({ ...f, socialMediaUrl: e.target.value }))}
            placeholder="https://instagram.com/annaberg"
            className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
          />
        </Field>

        <label className="flex items-center gap-2 text-[13px] text-pepo-t1 mb-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.hasLicense}
            onChange={(e) => setForm((f) => ({ ...f, hasLicense: e.target.checked }))}
            className="w-4 h-4 rounded border-pepo-bds accent-pepo-p"
          />
          Har kørekort
        </label>

        {error && (
          <p className="mt-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 bg-pepo-wh border-t border-pepo-bd px-5 py-3.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || hasUnvalidatedLocation}
          title={hasUnvalidatedLocation ? "Vælg lokationen fra Google-listen, før du kan gemme" : undefined}
          className="w-full h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Icon name="check" size={18} />
          {isPending ? "Gemmer..." : "Gem ændringer"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"mb-4 " + className}>
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

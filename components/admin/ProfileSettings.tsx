"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export type ProfileSaveResult =
  | { success: true; profileImageUrl: string | null }
  | { success: false; error: string };

export default function ProfileSettings({
  initial,
  onSave,
}: {
  initial: { fullName: string; email: string; profileImageUrl: string | null };
  /**
   * Server action der rent faktisk gemmer ændringerne. Genbruges af både
   * tenant-adminnernes og Pepo-superadminnernes profilside — de rammer
   * hver deres tabel (admin_users hhv. super_admins).
   */
  onSave: (input: {
    fullName: string;
    email: string;
    photoDataUrl: string | null;
  }) => Promise<ProfileSaveResult>;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(initial.profileImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await onSave({ fullName, email, photoDataUrl });
      if (!res.success) {
        setError(res.error);
        return;
      }
      if (res.profileImageUrl) {
        setExistingPhotoUrl(res.profileImageUrl);
        setPhotoDataUrl(null);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Opdaterer top-baren (navn/billede) og resten af layoutet med det samme.
      router.refresh();
    });
  }

  const displayPhoto = photoDataUrl ?? existingPhotoUrl;

  return (
    <div className="flex flex-col">
      <div className="px-[var(--page-px)] pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Profiloplysninger</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">Dine egne login- og kontaktoplysninger</div>
      </div>

      <div className="px-[var(--page-px)] py-[22px] pb-10 max-w-2xl">
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="mb-4">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Profilbillede <span className="normal-case font-normal text-pepo-t3">(valgfrit)</span>
            </label>
            <label className="block border-[1.5px] border-dashed border-pepo-bds rounded-xl p-5 text-center cursor-pointer hover:border-pepo-p hover:bg-pepo-pl transition-colors">
              {displayPhoto ? (
                <div className="w-[52px] h-[52px] rounded-full overflow-hidden mx-auto mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={displayPhoto} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-[52px] h-[52px] rounded-full bg-pepo-pl text-pepo-p text-[16px] font-medium flex items-center justify-center mx-auto mb-2">
                  {initials(fullName || "?")}
                </div>
              )}
              <div className="text-[13px] font-medium text-pepo-t2">
                {displayPhoto ? "Tryk for at skifte billede" : "Tryk for at uploade"}
              </div>
              <div className="text-[11px] text-pepo-t3 mt-[3px]">JPG eller PNG · Max 5 MB</div>
              <input type="file" accept="image/*" className="hidden" onChange={onPhotoSelected} />
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Navn
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
            <div className="text-[11.5px] text-pepo-t3 mt-1.5">
              Denne email bruges også til at logge ind — skifter du den, skal du logge ind med den nye email
              næste gang.
            </div>
          </div>

          {error && (
            <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="h-11 px-4 rounded-[10px] text-[13px] font-medium bg-pepo-p text-white flex items-center gap-1.5 disabled:opacity-40"
          >
            <Icon name="check" size={16} />
            {isPending ? "Gemmer..." : saved ? "Gemt" : "Gem ændringer"}
          </button>
        </div>
      </div>
    </div>
  );
}

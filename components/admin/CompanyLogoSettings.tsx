"use client";

import { useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updateCompanyLogo, removeCompanyLogo } from "@/app/tenant/(protected)/settings/company/actions";

/**
 * Egen sektion (mellem Virksomhedsoplysninger og Webadresse) frem for endnu
 * et felt i den store profil-formular, da upload sker med det samme ved
 * filvalg — ligesom profilbillede-upload andre steder i systemet — i
 * stedet for at skulle trykke en fælles "Gem ændringer"-knap for hele
 * siden.
 */
export default function CompanyLogoSettings({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      startTransition(async () => {
        const res = await updateCompanyLogo(dataUrl);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setLogoUrl(res.logoUrl);
      });
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // så den samme fil kan vælges igen senere, hvis fortrudt
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const res = await removeCompanyLogo();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setLogoUrl(null);
    });
  }

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6 mb-4">
      <div className="text-[15px] font-semibold text-pepo-t1 mb-1">Logo</div>
      <div className="text-[12.5px] text-pepo-t2 mb-4">
        Vises øverst i freelancer-appen. Har I ikke uploadet et logo, vises firmanavnet i stedet.
      </div>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-[12px] border border-pepo-bd bg-pepo-su flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Firmalogo" className="w-full h-full object-contain" />
          ) : (
            <Icon name="photo" size={22} className="text-pepo-t3" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className="h-9 px-3.5 rounded-[9px] text-[13px] font-medium border border-pepo-bds text-pepo-t1 hover:bg-pepo-su transition-colors disabled:opacity-40"
          >
            {isPending ? "Uploader..." : logoUrl ? "Skift logo" : "Upload logo"}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className="text-[12.5px] text-pepo-t3 underline text-left disabled:opacity-40"
            >
              Fjern logo
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {error && (
        <p className="mt-3 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

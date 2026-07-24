"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

type UrlKey = "apply" | "app";

function CopyableUrl({ id, url, copied, onCopy }: { id: UrlKey; url: string; copied: UrlKey | null; onCopy: (id: UrlKey) => void }) {
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        className="flex-1 min-w-0 border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[12.5px] text-pepo-t2 bg-pepo-su outline-none"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        onClick={() => onCopy(id)}
        className="h-[42px] px-3.5 rounded-[9px] border border-pepo-bds bg-pepo-wh text-pepo-t1 text-[12.5px] font-medium hover:bg-pepo-su transition-colors flex items-center gap-1.5 flex-shrink-0"
      >
        <Icon name={copied === id ? "check" : "copy"} size={16} />
        {copied === id ? "Kopieret" : "Kopiér"}
      </button>
    </div>
  );
}

export default function ImportantUrlsSettings({ tenantSlug }: { tenantSlug: string }) {
  const [copied, setCopied] = useState<UrlKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyUrl = `https://${tenantSlug}.${ROOT_DOMAIN}/apply`;
  const appUrl = `https://app.${ROOT_DOMAIN}`;

  async function copy(id: UrlKey) {
    const url = id === "apply" ? applyUrl : appUrl;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setError("Kunne ikke kopiere linket — markér og kopiér det manuelt.");
    }
  }

  return (
    <div className="flex flex-col">
      <div className="px-[var(--page-px)] pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Vigtige URL&apos;er</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Links I kan dele med jeres freelancere og på jeres egen hjemmeside
        </div>
      </div>

      <div className="px-[var(--page-px)] py-[22px] pb-10 max-w-2xl flex flex-col gap-5">
        {error && (
          <p className="text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="user-plus" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Vil I have at freelancere selv skal kunne ansøge om at arbejde for jer? Link til
              adressen herunder fra jeres hjemmeside, sociale medier eller et opslag — alle
              ansøgninger her går automatisk til jer, og I godkender dem under &quot;Freelancere&quot;.
            </div>
          </div>

          <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
            Ansøgningsside
          </label>
          <CopyableUrl id="apply" url={applyUrl} copied={copied} onCopy={copy} />
        </div>

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="device-mobile" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Jeres godkendte freelancere kan installere Pepo-appen på deres telefon via adressen
              herunder, og dermed nemt følge med i deres vagtplan, stemple ind/ud og få
              notifikationer om nye vagter. Samme adresse virker uanset hvor mange virksomheder en
              freelancer arbejder for.
            </div>
          </div>

          <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
            Freelancer-app
          </label>
          <CopyableUrl id="app" url={appUrl} copied={copied} onCopy={copy} />
        </div>
      </div>
    </div>
  );
}

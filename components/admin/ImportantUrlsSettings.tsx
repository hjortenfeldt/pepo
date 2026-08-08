"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updateImportantUrls, type ImportantUrlsInput } from "@/app/tenant/(protected)/settings/urls/actions";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

const inputClass =
  "w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p";

type UrlKey = "apply" | "app" | "request";

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

export default function ImportantUrlsSettings({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: ImportantUrlsInput;
}) {
  const [copied, setCopied] = useState<UrlKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ImportantUrlsInput>(initial);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startTransition] = useTransition();

  function save() {
    setSaveError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateImportantUrls(form);
      if (!res.success) {
        setSaveError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  const applyUrl = `https://${tenantSlug}.${ROOT_DOMAIN}/apply`;
  const appUrl = `https://app.${ROOT_DOMAIN}`;
  const requestUrl = `https://${tenantSlug}.${ROOT_DOMAIN}/request`;

  async function copy(id: UrlKey) {
    const url = id === "apply" ? applyUrl : id === "app" ? appUrl : requestUrl;
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

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="calendar-plus" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Vil I have at kommende kunder selv skal kunne bede om personale til et event? Link til
              adressen herunder fra jeres hjemmeside eller et tilbud — alle forespørgsler her går
              automatisk til jer, og I gennemgår og accepterer dem under &quot;Eventforespørgsler&quot;.
            </div>
          </div>

          <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
            Eventforespørgsel
          </label>
          <CopyableUrl id="request" url={requestUrl} copied={copied} onCopy={copy} />
        </div>

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="brand-google" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Jeres link til at give en anmeldelse på Google. Bruges i kort-koden{" "}
              <code className="bg-pepo-su border border-pepo-bds rounded px-1.5 py-0.5 text-pepo-p font-mono text-[11.5px]">
                [google-review-link]
              </code>{" "}
              i opfølgningsmailen efter et event.
            </div>
          </div>

          <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
            Google-anmeldelseslink
          </label>
          <input
            value={form.googleReviewUrl}
            onChange={(e) => setForm((f) => ({ ...f, googleReviewUrl: e.target.value }))}
            placeholder="https://g.page/r/..."
            className={inputClass}
          />
        </div>

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="world" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Jeres officielle hjemmeside. Bruges i kort-koden{" "}
              <code className="bg-pepo-su border border-pepo-bds rounded px-1.5 py-0.5 text-pepo-p font-mono text-[11.5px]">
                [company-website-url]
              </code>{" "}
              i klient-mailene under &quot;Tekster&quot;.
            </div>
          </div>

          <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
            Hjemmeside
          </label>
          <input
            value={form.websiteUrl}
            onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            placeholder="https://jeresfirma.dk"
            className={inputClass}
          />
        </div>

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="file-text" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Link til jeres lejebestemmelser. Bruges i kort-koden{" "}
              <code className="bg-pepo-su border border-pepo-bds rounded px-1.5 py-0.5 text-pepo-p font-mono text-[11.5px]">
                [rental-terms-url]
              </code>{" "}
              i klient-mailene under &quot;Tekster&quot;.
            </div>
          </div>

          <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
            Lejebestemmelser
          </label>
          <input
            value={form.rentalTermsUrl}
            onChange={(e) => setForm((f) => ({ ...f, rentalTermsUrl: e.target.value }))}
            placeholder="https://jeresfirma.dk/lejebestemmelser"
            className={inputClass}
          />
        </div>

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="help-circle" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Link til jeres FAQ. Bruges i kort-koden{" "}
              <code className="bg-pepo-su border border-pepo-bds rounded px-1.5 py-0.5 text-pepo-p font-mono text-[11.5px]">
                [faq-url]
              </code>{" "}
              i klient-mailene under &quot;Tekster&quot;.
            </div>
          </div>

          <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
            FAQ
          </label>
          <input
            value={form.faqUrl}
            onChange={(e) => setForm((f) => ({ ...f, faqUrl: e.target.value }))}
            placeholder="https://jeresfirma.dk/faq"
            className={inputClass}
          />
        </div>

        {saveError && (
          <p className="text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {saveError}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="self-start h-11 px-4 rounded-[10px] text-[13px] font-medium bg-pepo-p text-white flex items-center gap-1.5 disabled:opacity-40"
        >
          <Icon name="check" size={16} />
          {isSaving ? "Gemmer..." : saved ? "Gemt" : "Gem ændringer"}
        </button>
      </div>
    </div>
  );
}

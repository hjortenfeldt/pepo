"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { regenerateCalendarFeedToken } from "@/app/tenant/(protected)/settings/calendar/actions";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

function feedUrl(slug: string, token: string, scheme: "https" | "webcal") {
  return `${scheme}://${slug}.${ROOT_DOMAIN}/api/calendar/${token}.ics`;
}

export default function CalendarSyncSettings({
  tenantSlug,
  tenantName,
  initialToken,
}: {
  tenantSlug: string;
  tenantName: string;
  initialToken: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState<"https" | "webcal" | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function copy(scheme: "https" | "webcal") {
    try {
      await navigator.clipboard.writeText(feedUrl(tenantSlug, token, scheme));
      setCopied(scheme);
      setTimeout(() => setCopied((c) => (c === scheme ? null : c)), 2000);
    } catch {
      setError("Kunne ikke kopiere linket — markér og kopiér det manuelt.");
    }
  }

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const res = await regenerateCalendarFeedToken();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setToken(res.token);
      setConfirmingReset(false);
    });
  }

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Sync med kalender</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Abonnér på jeres events direkte i jeres almindelige kalender-app
        </div>
      </div>

      <div className="px-8 py-[22px] pb-10 max-w-2xl">
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-4 px-3.5 py-3 rounded-[9px] bg-pepo-pl text-[13.5px] text-pepo-p leading-relaxed">
            <Icon name="calendar-cog" size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">VIGTIGT:</span> Abonnér på denne kalender for at se ALLE{" "}
              {tenantName}&apos;s events og vagter i din kalender på computeren/telefonen.
            </div>
          </div>

          <div className="flex items-start gap-3 mb-5 px-3.5 py-3 rounded-[9px] bg-[#FEF3E2] text-[13.5px] text-[#9A5F00] leading-relaxed">
            <Icon name="alert-triangle" size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">BEMÆRK:</span> Kun {tenantName}&apos;s admins bør abonnere på denne
              kalender (da den viser alle jeres vagter og hvem de er tildelt til). Den enkelte freelancer bør i
              stedet for at abonnere på den kalender som kun viser deres egne vagter — hvilket de kan gøre inde
              fra freelancer-app&apos;en (app.pepo.team).
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Abonnementslink (webcal)
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={feedUrl(tenantSlug, token, "webcal")}
                className="flex-1 border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[12.5px] text-pepo-t2 bg-pepo-su outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <a
                href={feedUrl(tenantSlug, token, "webcal")}
                className="h-[42px] px-3.5 rounded-[9px] bg-pepo-p text-white text-[12.5px] font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 flex-shrink-0"
              >
                <Icon name="calendar-plus" size={16} />
                Abonnér
              </a>
            </div>
            <div className="text-[11.5px] text-pepo-t3 mt-1.5">
              Klik på &quot;Abonnér&quot; for at åbne kalender-appen på denne enhed direkte, eller kopiér linket herover
              og indsæt det som &quot;Abonnér på kalender&quot; i Apple Kalender, Google Kalender eller Outlook.
            </div>
          </div>

          {error && (
            <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-start gap-2.5 mb-5 px-3.5 py-3 rounded-[9px] bg-pepo-su text-[12.5px] text-pepo-t2 leading-relaxed">
            <Icon name="info-circle" size={16} className="flex-shrink-0 mt-0.5 text-pepo-t3" />
            <div>
              Et kalender-abonnement henter selv opdateringer med jævne mellemrum — Pepo sender ikke besked ud,
              når der sker en ændring. Nye eller ændrede vagter kan derfor gå op til flere timer eller dage,
              før de dukker op i jeres kalender. På en computer kan I ofte selv vælge hvor tit der opdateres
              (kig efter &quot;Auto-refresh&quot; i kalender-appens indstillinger for abonnementet) — vælg gerne den
              hyppigste mulighed. På telefoner styrer styresystemet selv opdateringsfrekvensen, uden at man kan
              indstille det.
            </div>
          </div>

          <div className="border-t border-pepo-bd pt-5 pb-5">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-[13px] font-medium text-pepo-t1">Avanceret</span>
              <Icon
                name={showAdvanced ? "chevron-down" : "chevron-right"}
                size={24}
                className="text-pepo-t2 flex-shrink-0"
              />
            </button>
            {showAdvanced && (
              <div className="mt-4">
                <div className="text-[12.5px] text-pepo-t2 mb-3">
                  De fleste har kun brug for webcal-linket ovenfor. Https-linket er til de tilfælde hvor et
                  kalendersystem kræver, at man selv indsætter en almindelig webadresse i stedet for at klikke
                  på et link — fx Google Kalenders &quot;Fra URL&quot;-funktion på web, som ikke forstår webcal-links.
                </div>
                <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
                  Abonnementslink (https, til manuel indsætning)
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={feedUrl(tenantSlug, token, "https")}
                    className="flex-1 border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[12.5px] text-pepo-t2 bg-pepo-su outline-none"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={() => copy("https")}
                    className="h-[42px] px-3.5 rounded-[9px] border border-pepo-bds bg-pepo-wh text-pepo-t1 text-[12.5px] font-medium hover:bg-pepo-su transition-colors flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Icon name={copied === "https" ? "check" : "copy"} size={16} />
                    {copied === "https" ? "Kopieret" : "Kopiér"}
                  </button>
                </div>

                <div className="border-t border-pepo-bd mt-5 pt-5">
                  <div className="text-[13px] font-medium text-pepo-t1 mb-1">Generér nyt link</div>
                  <div className="text-[12.5px] text-pepo-t2 mb-3">
                    Det nuværende link holder op med at virke, og skal opdateres i alle kalender-apps der
                    allerede abonnerer. Brug kun dette hvis linket er delt med nogen der ikke længere skal have
                    adgang.
                  </div>
                  {confirmingReset ? (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={regenerate}
                        disabled={isPending}
                        className="h-10 px-4 rounded-[9px] text-[13px] font-medium bg-[#C0021A] text-white disabled:opacity-40"
                      >
                        {isPending ? "Genererer..." : "Ja, generér nyt link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingReset(false)}
                        disabled={isPending}
                        className="h-10 px-4 rounded-[9px] text-[13px] font-medium border border-pepo-bds text-pepo-t1 hover:bg-pepo-su transition-colors"
                      >
                        Fortryd
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(true)}
                      className="h-10 px-4 rounded-[9px] text-[13px] font-medium border border-pepo-bds text-pepo-t1 hover:bg-pepo-su transition-colors"
                    >
                      Generér nyt link
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

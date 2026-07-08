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
  initialToken,
}: {
  tenantSlug: string;
  initialToken: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState<"https" | "webcal" | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <div className="flex flex-col h-screen">
      <div className="px-8 pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Sync med kalender</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Abonnér på jeres events direkte i jeres almindelige kalender-app
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-[22px] pb-10 max-w-2xl">
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
              <Icon name="calendar-cog" size={20} />
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-relaxed">
              Abonnerer I på linket herunder, dukker alle events der oprettes i Pepo automatisk op i jeres
              kalender på telefonen eller computeren — med titel, adresse, vagtoversigt, briefing og
              kundeoplysninger. Kalender-appen opdaterer sig selv med jævne mellemrum.
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
              Klik på "Abonnér" for at åbne kalender-appen på denne enhed direkte, eller kopiér linket herover
              og indsæt det som "Abonnér på kalender" i Apple Kalender, Google Kalender eller Outlook.
            </div>
          </div>

          <div className="mb-5">
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
          </div>

          {error && (
            <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="border-t border-pepo-bd pt-5">
            <div className="text-[13px] font-medium text-pepo-t1 mb-1">Generér nyt link</div>
            <div className="text-[12.5px] text-pepo-t2 mb-3">
              Det nuværende link holder op med at virke, og skal opdateres i alle kalender-apps der allerede
              abonnerer. Brug kun dette hvis linket er delt med nogen der ikke længere skal have adgang.
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
      </div>
    </div>
  );
}

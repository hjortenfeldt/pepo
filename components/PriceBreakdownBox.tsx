/**
 * Den lilla prisboks — oprindeligt kun bygget til Eventforespørgsler
 * (EventRequestDetailClient.tsx), udtrukket herhen 2026-08-08 så Eventdetaljer
 * (EventDeepLinkView.tsx) kan vise nøjagtig samme boks for et allerede
 * booket/oprettet event, uden at duplikere markup'et. Se
 * [[project_event_correspondence_and_system_log]].
 *
 * Rent præsentations-komponent — selve beregningen (labourSubtotalKr/
 * transportSurchargeKr/vatKr/totalKr) sker hos kalderen: for en
 * eventforespørgsel er tallene et FROSSET snapshot gemt på selve
 * forespørgslen (lib/event-requests.ts), for et rigtigt event er de LIVE
 * genberegnet hver gang siden hentes (se labourSubtotalKr på EventListItem i
 * lib/shifts-data.ts) — begge bruger dog PRÆCIS samme formler (lib/pricing.ts).
 */
export default function PriceBreakdownBox({
  labourSubtotalKr,
  transportSurchargeKr,
  vatKr,
  totalKr,
  showVat,
  className,
}: {
  labourSubtotalKr: number | null;
  transportSurchargeKr: number | null;
  vatKr: number | null;
  totalKr: number | null;
  // Momslinjen vises kun for firmakunder — privatkunder får bevidst intet
  // momstillæg (se lib/pricing.ts's calculateVat).
  showVat: boolean;
  className?: string;
}) {
  return (
    <div className={"bg-pepo-pl rounded-[14px] px-4 py-3.5" + (className ? " " + className : "")}>
      <RowPlain label="Personale i alt" value={labourSubtotalKr != null ? formatKr(labourSubtotalKr) : "—"} />
      <RowPlain
        label="Transporttillæg"
        value={transportSurchargeKr != null ? formatKr(transportSurchargeKr) : "Ukendt"}
      />
      {showVat && <RowPlain label="Moms" value={vatKr != null ? formatKr(vatKr) : "Ukendt"} />}
      <div className="border-t border-pepo-p/15 my-2" />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-pepo-t1">Samlet estimat</span>
        <span className="text-[17px] font-semibold text-pepo-p">{totalKr != null ? formatKr(totalKr) : "—"}</span>
      </div>
    </div>
  );
}

function formatKr(value: number): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(value)) + " kr.";
}

function RowPlain({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-pepo-t2">{label}</span>
      <span className="text-sm text-pepo-t1">{value}</span>
    </div>
  );
}

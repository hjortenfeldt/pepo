"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import {
  requestShift,
  withdrawShiftRequest,
  putShiftForResale,
  cancelShiftResale,
} from "@/app/freelancer/(protected)/actions";
import { formatEventDate, formatTimeRange, hoursBetween } from "@/lib/format";
import { PullToRefreshHeader, PullToRefreshFooter } from "@/components/freelancer/PullToRefresh";

export type ShiftStatus = "open" | "for_resale" | "assigned" | "completed" | "cancelled";

export type SiblingShift = {
  id: string;
  startTime: string;
  endTime: string;
  categoryName: string;
  status: ShiftStatus;
  isCurrent: boolean;
  isMine: boolean;
  assignedFreelancerName: string | null;
};

export type ShiftAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
};

export type OpenShiftDetail = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
  isMine: boolean;
  categoryName: string;
  /** Ikon-navn fra work_categories.icon (samme kebab-case Tabler-navn som i
   * tenant-admin-systemet, fx CategoryList.tsx/ShiftBoard.tsx) — null for
   * kategorier uden valgt ikon. */
  categoryIcon: string | null;
  eventTitle: string;
  briefing: string | null;
  venueName: string | null;
  venueAddress: string | null;
  /** Kundens firmanavn, eller kontaktpersonens navn hvis privatkunde — null hvis ukendt/intet event. */
  clientName: string | null;
  /** true når kunden er en privatkunde (intet firmanavn) — styrer ikonvalg, se ShiftBoard.tsx's samme felt admin-side. */
  clientIsPrivate: boolean;
  clientPhone: string | null;
  /** Fugleflugtsafstand (km) fra freelancerens geokodede bopæls-lokation til vagtstedet — null hvis en af de to mangler koordinater. */
  distanceKm: number | null;
  alreadyApplied: boolean;
  siblingShifts: SiblingShift[];
  attachments: ShiftAttachment[];
};

/**
 * Navnekolonnen i "kollegaer til dette event"-listen nedenfor — "Dig" for
 * ens egne vagter (uanset om det er den man kigger på lige nu eller en
 * anden rolle man selv har på samme event), "Ubesat" for åbne vagter, ellers
 * den tildelte kollegas navn. En vagt "til salg" hænger stadig ved sælgeren
 * indtil en anden tager den (se samme logik i components/admin/ShiftBoard.tsx),
 * så den viser navnet + en lille markering i stedet for "Ubesat".
 */
function colleagueLabel(s: SiblingShift): string {
  if (s.isMine) return "Dig";
  if (s.status === "open") return "Ubesat";
  const name = s.assignedFreelancerName ?? "Ubesat";
  return s.status === "for_resale" ? `${name} · Til salg` : name;
}

/** "8" eller "7,5" — brugt i parentesen efter start/sluttid, se bodyContent. */
function durationLabel(startTime: string, endTime: string): string {
  const hours = hoursBetween(startTime, endTime);
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(".", ",");
  return `${label} timer`;
}

/** "5 km." / "Under 1 km." — helt tal, ingen decimaler (fugleflugtsafstanden er kun vejledende). */
function distanceLabel(km: number): string {
  const rounded = Math.round(km);
  if (rounded < 1) return "Under 1 km.";
  return `${rounded} km.`;
}

/**
 * Universalt Google Maps-søgelink — åbner Google Maps-appen hvis
 * installeret (både iOS og Android), ellers en fungerende webvisning i
 * Safari/Chrome. Bevidst IKKE et Apple Maps-link (maps.apple.com), da det
 * ikke har nogen god fallback for Android-brugere.
 */
function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function ShiftRequestDetail({
  shift,
  onClose,
  onChanged,
}: {
  shift: OpenShiftDetail;
  /**
   * Kun sat når komponenten vises i overlay-panelet fra Overblik-siden
   * (ShiftDetailPanel.tsx) — dens fravær er det, der afgør om komponenten
   * kører i "fuld side"- eller "embedded"-tilstand herunder, og bruges også
   * til at lukke panelet efter en handling.
   */
  onClose?: () => void;
  /** Kaldes lige inden onClose, så den bagvedliggende Overblik-side kan
   * blinke det pågældende vagtkort — se OverviewClient.tsx's flashShift. */
  onChanged?: (shiftId: string) => void;
}) {
  const [alreadyApplied, setAlreadyApplied] = useState(shift.alreadyApplied);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const embedded = Boolean(onClose);

  const requestable = shift.status === "open" || shift.status === "for_resale";
  // Den, der har sat SIN EGEN vagt til salg, ser ikke "Anmod om vagt" for
  // den (selvom `requestable` teknisk er true for for_resale-vagter) —
  // de skal i stedet kunne følge/fortryde deres eget salg. Se footeren
  // nedenfor for prioriteringen.
  const isSellerListing = shift.status === "for_resale" && shift.isMine;

  // Efter en statusændrende handling: i embedded (panel-) tilstand skal
  // panelet lukke og det bagvedliggende kort blinke; i fuld-side-tilstand
  // sker der intet ekstra (router.refresh() er nok, som hidtil).
  function afterChange() {
    router.refresh();
    onChanged?.(shift.id);
    onClose?.();
  }

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const res = await requestShift(shift.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setAlreadyApplied(true);
      afterChange();
    });
  }

  function handleWithdraw() {
    setError(null);
    startTransition(async () => {
      const res = await withdrawShiftRequest(shift.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setAlreadyApplied(false);
      afterChange();
    });
  }

  function handlePutForResale() {
    // Confirm-dialog for at undgå fejltryk (Hjorth 2026-07-29) — vagten
    // forsvinder ikke med det samme (den er stadig freelancerens indtil en
    // anden tager den), men handlingen gør den synlig for alle kollegaer med
    // adgang til jobfunktionen, så et fejltryk bør stadig kunne fortrydes
    // inden det sker.
    if (!confirm(`Sæt "${shift.categoryName}"-vagten (${formatEventDate(shift.date)}) til salg? Andre kolleger kan så tage den, indtil vagten starter.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await putShiftForResale(shift.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      afterChange();
    });
  }

  function handleCancelResale() {
    setError(null);
    startTransition(async () => {
      const res = await cancelShiftResale(shift.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      afterChange();
    });
  }

  const bodyContent = (
    <div className="px-[var(--page-px)] pt-5 pb-8">
      {/* Jobfunktions-badgens ikon er bevidst IKKE gjort større/mørkere
          sammen med resten af sektionens ikoner nedenfor (ønsket eksplicit
          af Hjorth) — kun badgens tekststørrelse er ændret, så den matcher
          eventtitlen lige under. */}
      <span className="inline-flex items-center gap-2 bg-pepo-pl text-pepo-p rounded-full px-5 py-2 text-[20px] font-semibold mb-3">
        <Icon name={shift.categoryIcon || "briefcase"} size={26} />
        {shift.categoryName}
      </span>
      <div className="text-[20px] font-bold text-pepo-t1 tracking-tight">{shift.eventTitle}</div>
      {/* Dato og klokkeslæt på hver sin linje (i stedet for "·"-adskilt på
          én linje), samme mørke tekstfarve som eventtitlen ovenfor —
          varighed tilføjet i parentes efter sluttidspunktet. */}
      <div className="text-[13px] text-pepo-t1 mt-1">
        <div>{formatEventDate(shift.date)}</div>
        <div>
          {formatTimeRange(shift.startTime, shift.endTime)} ({durationLabel(shift.startTime, shift.endTime)})
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        {(shift.clientName || shift.venueName || shift.venueAddress) && (
          <div className="flex items-start gap-2 text-[13px] text-pepo-t2">
            <Icon
              name={shift.clientIsPrivate ? "user" : "building-store"}
              size={21}
              className="text-pepo-t2 flex-shrink-0 mt-0.5"
            />
            <div className="min-w-0">
              {shift.clientName && (
                <div>
                  {shift.clientName}
                  {shift.clientPhone && (
                    <>
                      {" "}
                      (Tel:{" "}
                      <a href={`tel:${shift.clientPhone}`} className="text-pepo-p">
                        {shift.clientPhone}
                      </a>
                      )
                    </>
                  )}
                </div>
              )}
              {shift.venueName && <div>{shift.venueName}</div>}
              {shift.venueAddress && (
                <a
                  href={mapsSearchUrl([shift.venueName, shift.venueAddress].filter(Boolean).join(", "))}
                  target="_blank"
                  rel="noopener"
                  className="block text-pepo-p underline decoration-pepo-p/40"
                >
                  {shift.venueAddress}
                </a>
              )}
            </div>
          </div>
        )}
        {shift.distanceKm != null && (
          <div className="flex items-center gap-2 text-[13px] text-pepo-t2">
            <Icon name="route" size={21} className="text-pepo-t2 flex-shrink-0" />
            <span>{distanceLabel(shift.distanceKm)} fra din bopæl.</span>
          </div>
        )}
      </div>

      {shift.siblingShifts.length > 0 && (
        <>
          <div className="h-px bg-pepo-bd my-5" />
          {/* Hvem-er-på-hvad for hele eventet — kronologisk (get_event_shift_summary
              sorterer selv efter start_time), tid → jobfunktion → navn/"Ubesat",
              så man kan se hvilke kolleger man arbejder sammen med (ønsket af
              Hjorth 2026-07-29). Vises altid når vagten hører til et event, også
              hvis man selv er den eneste på det lige nu. */}
          <div className="text-[14px] font-semibold text-pepo-t1 mb-2.5">
            Kollegaer til dette event ({shift.siblingShifts.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {shift.siblingShifts.map((s) => (
              <div
                key={s.id}
                className={
                  "flex items-center gap-3 rounded-[10px] px-3 py-2 border " +
                  (s.isCurrent ? "border-pepo-p bg-pepo-pl/30" : "border-pepo-bd")
                }
              >
                <div className="text-[12px] font-medium text-pepo-t2 tabular-nums flex-shrink-0 w-[84px]">
                  {formatTimeRange(s.startTime, s.endTime)}
                </div>
                <div className="min-w-0 flex-1 text-[13px] font-medium text-pepo-t1 truncate">
                  {s.categoryName}
                </div>
                <div
                  className={
                    "min-w-0 max-w-[38%] flex-shrink-0 text-[13px] truncate text-right " +
                    (s.isMine ? "font-semibold text-pepo-p" : "text-pepo-t2")
                  }
                >
                  {colleagueLabel(s)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="h-px bg-pepo-bd my-5" />
      <div className="text-[14px] font-semibold text-pepo-t1 mb-2">Briefing</div>
      <div className="text-[13px] text-pepo-t2 leading-relaxed whitespace-pre-line">
        {shift.briefing || "Ingen briefing tilføjet endnu."}
      </div>

      {shift.attachments.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3">
          {shift.attachments.map((a) => (
            <a
              key={a.id}
              href={a.fileUrl}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 text-[13px] text-pepo-p hover:underline"
            >
              <Icon name="paperclip" size={14} className="text-pepo-t3 flex-shrink-0" />
              <span className="truncate">{a.fileName}</span>
            </a>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );

  // pb-10 (pt-3.5 uændret) i stedet for ens py-3.5 hele vejen rundt —
  // knapperne heri sad for tæt på bunden af skærmen og blev delvist skjult
  // bag iPhonens afrundede hjørner/home-indicator-området (ønsket af Hjorth
  // 2026-07-27, først forsøgt med pb-7, som stadig ikke var nok).
  const footerContent = (
    <div className={embedded ? "bg-pepo-wh border-t border-pepo-bd px-[var(--page-px)] pt-3.5 pb-10 flex-shrink-0" : "bg-pepo-wh border-t border-pepo-bd px-[var(--page-px)] pt-3.5 pb-10"}>
      {isSellerListing ? (
        <>
          <div className="text-center text-[12.5px] text-pepo-t3 py-2.5">
            Vagten er sat til salg — den er stadig din, hvis ingen andre tager den inden vagten starter.
          </div>
          <button
            type="button"
            onClick={handleCancelResale}
            disabled={isPending}
            className="w-full text-center text-[13px] text-pepo-t3 underline decoration-pepo-t3 disabled:opacity-50"
          >
            {isPending ? "Fortryder..." : "Fortryd salg"}
          </button>
        </>
      ) : !requestable ? (
        shift.status === "assigned" && shift.isMine ? (
          <button
            type="button"
            onClick={handlePutForResale}
            disabled={isPending}
            className="w-full h-[46px] rounded-[10px] text-[15px] font-semibold bg-pepo-wh text-pepo-t2 border border-pepo-bds flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
          >
            <Icon name="arrows-exchange" size={18} />
            {isPending ? "Sætter til salg..." : "Sæt vagten til salg"}
          </button>
        ) : (
          <div className="text-center text-[12.5px] text-pepo-t3 py-2.5">Denne vagt er ikke længere ledig.</div>
        )
      ) : alreadyApplied ? (
        <>
          <button
            type="button"
            disabled
            className="w-full h-[46px] rounded-[10px] text-[15px] font-semibold bg-[#1A7A34] text-white flex items-center justify-center gap-2 opacity-90"
          >
            <Icon name="check" size={18} />
            Anmodet
          </button>
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={isPending}
            className="w-full text-center text-[13px] text-pepo-t3 underline decoration-pepo-t3 mt-2.5 disabled:opacity-50"
          >
            Annuller anmodning
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleRequest}
          disabled={isPending}
          className="w-full h-[46px] rounded-[10px] text-[15px] font-semibold bg-pepo-p text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
        >
          <Icon name="hand-stop" size={18} />
          {isPending ? "Sender anmodning..." : "Anmod om vagt"}
        </button>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full bg-pepo-su">
        <div className="z-10 bg-pepo-wh px-4 py-3 border-b border-pepo-bd flex items-center flex-shrink-0">
          <button type="button" onClick={onClose} className="flex items-center gap-2 text-pepo-t1 -ml-1 px-1 py-0.5">
            <Icon name="arrow-left" size={18} />
            <span className="text-[14px] font-medium">Vagtdetaljer</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{bodyContent}</div>
        {footerContent}
      </div>
    );
  }

  return (
    <div>
      <PullToRefreshHeader>
        <div className="z-10 bg-pepo-wh px-4 py-3 border-b border-pepo-bd flex items-center">
          <Link href="/" className="flex items-center gap-2 text-pepo-t1 -ml-1 px-1 py-0.5">
            <Icon name="arrow-left" size={18} />
            <span className="text-[14px] font-medium">Vagtdetaljer</span>
          </Link>
        </div>
      </PullToRefreshHeader>

      {bodyContent}

      <PullToRefreshFooter>{footerContent}</PullToRefreshFooter>
    </div>
  );
}

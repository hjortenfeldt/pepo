"use client";

import { Fragment, forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import type { PanInfo } from "motion/react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type {
  CategoryOption,
  ClientOption,
  EventListItem,
  FreelancerOption,
  ShiftListItem,
  ShiftStatus,
} from "@/lib/admin-types";
import { formatDayHeading, formatTimeRange, todayIso } from "@/lib/format";
import { hasPendingShiftRequest, countPendingShiftRequests, countMatchingPendingRequests } from "@/lib/shift-request-utils";
import type { BusyShift } from "@/lib/shift-conflicts";
import ShiftWizardPanel, { type WizardState } from "./ShiftWizardPanel";
import ShiftDetailPanel from "./ShiftDetailPanel";
import ExpandingSearchButton from "./ExpandingSearchButton";

const krFmt = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
const kmFmt = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 });

type Tab = "upcoming" | "past" | "requests";

const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Kommende",
  past: "Tidligere",
  requests: "Vagtanmodninger",
};

const STATUS_LABEL: Record<ShiftStatus, string> = {
  open: "Mangler",
  for_resale: "Til salg",
  assigned: "Tildelt",
  cancelled: "Slettet",
};

const STATUS_BADGE_CLASS: Record<ShiftStatus, string> = {
  open: "bg-[#FDECEA] text-[#C0021A]",
  for_resale: "bg-[#FEF3E2] text-[#9A5F00]",
  assigned: "bg-[#EAF6EE] text-[#1A7A34]",
  cancelled: "bg-pepo-su text-pepo-t3",
};

// Kortets kant er farvet som badgens lyse baggrund i hvile, og mørkner til
// badgens tekstfarve ved hover — matcher .scard[data-status]-reglerne i
// Pepo – Admin vagter.html.
const SHIFT_BORDER_CLASS: Record<ShiftStatus, string> = {
  open: "border-[#FDECEA] hover:border-[#C0021A]",
  for_resale: "border-[#FEF3E2] hover:border-[#9A5F00]",
  assigned: "border-[#EAF6EE] hover:border-[#1A7A34]",
  cancelled: "border-pepo-bd hover:border-pepo-t3",
};

const STATUS_TEXT_CLASS: Record<ShiftStatus, string> = {
  open: "text-[#C0021A]",
  for_resale: "text-[#9A5F00]",
  assigned: "text-[#1A7A34]",
  cancelled: "text-pepo-t3",
};

// Sorteringsprioritet for vagter med samme starttid+jobfunktion — "Tildelt"
// først, "Mangler" sidst, "Til salg" i midten (en mellemting: den HAR en
// freelancer, men er på vej væk). "cancelled" forekommer aldrig reelt her
// (activeShifts filtrerer dem fra før sortering), men skal med for at
// Record<ShiftStatus, number> er komplet.
const STATUS_SORT_ORDER: Record<ShiftStatus, number> = {
  assigned: 0,
  for_resale: 1,
  open: 2,
  cancelled: 3,
};

// Vagter under et event sorteres efter starttid (tidligst først), dernæst
// alfabetisk efter jobfunktion (dansk sortering, så æ/ø/å havner rigtigt),
// og til sidst efter status (se STATUS_SORT_ORDER) — så to ens vagter med
// samme jobfunktion og starttid altid viser den tildelte før den ubesatte.
//
// `removingShiftId` er den vagt, der lige nu kører "Slet vagt"-animationen
// (blink → udtoning → kollaps, se ShiftCard) — så længe den animerer,
// sorteres den efter sin OPRINDELIGE status (previousStatus), ikke den nye
// "cancelled"-status, ellers ville kortet visuelt hoppe ned til bunden af
// listen i det øjeblik det starter med at forsvinde, i stedet for at blive
// stående og bare falde væk der hvor det allerede lå.
function compareShifts(a: ShiftListItem, b: ShiftListItem, removingShiftId?: string | null): number {
  if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
  const categoryCompare = a.category.localeCompare(b.category, "da");
  if (categoryCompare !== 0) return categoryCompare;
  const effectiveStatus = (s: ShiftListItem) =>
    s.id === removingShiftId ? s.previousStatus ?? s.status : s.status;
  return STATUS_SORT_ORDER[effectiveStatus(a)] - STATUS_SORT_ORDER[effectiveStatus(b)];
}

function dateStatusDot(events: EventListItem[], dateStr: string): "green" | "red" | "gray" | "none" {
  const dayEvents = events.filter((e) => e.eventDate === dateStr);
  if (dayEvents.length === 0) return "none";
  const activeShifts = dayEvents.flatMap((e) => e.shifts).filter((s) => s.status !== "cancelled");
  if (activeShifts.length === 0) return "gray";
  return activeShifts.every((s) => s.status === "assigned") ? "green" : "red";
}

export default function ShiftBoard({
  events,
  clients,
  categories,
  freelancers,
  initialTab,
}: {
  events: EventListItem[];
  clients: ClientOption[];
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
  // Sat af page.tsx ud fra ?tab=upcoming|past — se dens kommentar for
  // hvorfor (Dashboard-siden's "Se alle"-knapper).
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "upcoming");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [openShift, setOpenShift] = useState<{ shift: ShiftListItem; event: EventListItem } | null>(null);
  const [flash, setFlash] = useState<{ shiftId: string; color: "green" | "red" | "purple" } | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Vagten der lige nu kører "Slet vagt"-animationen, og hvilken af de tre
  // faser den er i — se startRemoving() nedenfor og ShiftCard/EventCard for
  // hvordan de bruges.
  const [removingShiftId, setRemovingShiftId] = useState<string | null>(null);
  const [removeStage, setRemoveStage] = useState<"flash" | "fade" | "collapse" | null>(null);
  const removeTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Skifter man visning (liste/kalender), nulstilles en evt. aktiv søgning,
  // så det nye view altid starter fra sit eget standardindhold (faneblade
  // synlige igen) i stedet for at bevare søgeresultater fra det forrige
  // view. Samme mønster i FreelancerBoard.tsx og ClientBoard.tsx.
  function changeViewMode(mode: "list" | "calendar") {
    setViewMode(mode);
    setSearch("");
    setSearchOpen(false);
  }

  // Kaldes fra ShiftDetailPanel lige efter en vellykket tildeling (grøn,
  // standard) ELLER frigivelse (rød) — panelet lukker sig selv
  // (closeOnSuccess) i begge tilfælde, så dette er brugerens eneste visuelle
  // bekræftelse af HVILKEN vagt der lige blev opdateret. 1300ms matcher
  // .pepo-flash-green/red-animationernes varighed (se globals.css).
  function flashShift(shiftId: string, color: "green" | "red" | "purple" = "green") {
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    setFlash({ shiftId, color });
    flashTimeout.current = setTimeout(() => setFlash(null), 1300);
  }

  // Kaldes fra ShiftDetailPanel lige efter en vellykket "Slet vagt" — panelet
  // lukker sig selv (closeOnSuccess), og her kører vi de tre sekventielle
  // faser af blink-udtoning-kollaps (se ShiftCard's kommentar for hvorfor
  // netop disse tre trin og varigheder). Selve vagten holdes bevidst i
  // EventCard's activeShifts, indtil removingShiftId nulstilles her til
  // sidst — se dens filter.
  function startRemoving(shiftId: string) {
    removeTimeouts.current.forEach(clearTimeout);
    removeTimeouts.current = [];
    setRemovingShiftId(shiftId);
    setRemoveStage("flash");
    removeTimeouts.current.push(
      setTimeout(() => {
        setRemoveStage("fade");
        removeTimeouts.current.push(
          setTimeout(() => {
            setRemoveStage("collapse");
            removeTimeouts.current.push(
              setTimeout(() => {
                setRemovingShiftId(null);
                setRemoveStage(null);
              }, 300)
            );
          }, 300)
        );
      }, 1300)
    );
  }

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      removeTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  const now = todayIso();

  // Antal ventende vagtanmodninger — vist som rødt iOS-stil badge på
  // "Vagtanmodninger"-fanen, samme stil som "Ansøgninger"-fanen på
  // Freelancere-siden (FreelancerBoard.tsx).
  const requestsCount = useMemo(() => countPendingShiftRequests(events, now), [events, now]);

  // Udledt af den samme company-wide `events`-liste (allerede hentet uden
  // paginering, se getShiftsBoardData) — bruges af FreelancerAssignDropdown
  // i ShiftDetailPanel/ShiftWizardPanel til "Utilgængelig"-mærkatet, se
  // lib/shift-conflicts.ts. Ingen ny forespørgsel nødvendig.
  const busyShifts = useMemo<BusyShift[]>(
    () =>
      events.flatMap((e) =>
        e.shifts
          .filter((s) => s.assignedFreelancerId && (s.status === "assigned" || s.status === "for_resale"))
          .map((s) => ({
            shiftId: s.id,
            freelancerId: s.assignedFreelancerId as string,
            date: s.shiftDate,
            startTime: s.startTime,
            endTime: s.endTime,
          }))
      ),
    [events]
  );

  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = events;
    // Uden søgeord filtreres der på den valgte fane som hidtil. MED søgeord
    // ignoreres fane-datofilteret helt — søgningen skal kunne finde både
    // tidligere og kommende events uanset hvilken fane man står på.
    if (!q) {
      if (tab === "upcoming") list = list.filter((e) => e.eventDate >= now && e.shifts.some((s) => s.status !== "cancelled"));
      if (tab === "past") list = list.filter((e) => e.eventDate < now);
      // Kommende events med mindst én ubesat vagt, der har en ventende
      // vagtanmodning admin endnu ikke har taget stilling til — se
      // hasPendingShiftRequest (lib/shift-request-utils.ts), delt med
      // fanens antals-badge og page.tsx's valg af standard-fane.
      if (tab === "requests")
        list = list.filter((e) => e.eventDate >= now && e.shifts.some(hasPendingShiftRequest));
    } else {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.clientName.toLowerCase().includes(q) ||
          e.shifts.some(
            (s) =>
              s.category.toLowerCase().includes(q) ||
              (s.assignedFreelancerName ?? "").toLowerCase().includes(q)
          )
      );
    }
    // "Tidligere" vises nyeste først (faldende) — "Kommende" holder sin
    // oprindelige stigende sortering (næste event nærmest i tid øverst).
    return [...list].sort((a, b) =>
      tab === "past" ? b.eventDate.localeCompare(a.eventDate) : a.eventDate.localeCompare(b.eventDate)
    );
  }, [events, tab, search, now]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, EventListItem[]>();
    for (const e of filtered) {
      const list = groups.get(e.eventDate) ?? [];
      list.push(e);
      groups.set(e.eventDate, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  function openEditEvent(event: EventListItem) {
    setWizard({ mode: "editEvent", event });
  }

  function openAddShift(event: EventListItem) {
    setWizard({ mode: "addShift", event });
  }

  function openShiftDetail(shift: ShiftListItem, event: EventListItem) {
    setOpenShift({ shift, event });
  }

  const agendaDate = selectedDate ?? now;
  const agendaEvents = events.filter((e) => e.eventDate === agendaDate);

  return (
    <div className="flex flex-col">
      <div className="px-[var(--page-px)] pt-[22px]">
        <div className="flex items-start justify-between mb-[18px]">
          <div>
            <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Events & vagter</div>
            <div className="text-[13.5px] text-pepo-t2 mt-[3px]">Opret vagter og tildel freelancere</div>
          </div>
          <button
            onClick={() => setWizard({ mode: "new", presetDate: selectedDate ?? undefined })}
            className="h-[38px] px-4 rounded-[9px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Icon name="plus" size={17} />
            Ny event
          </button>
        </div>

      </div>

      <div className="border-t border-pepo-bd" />
      <div className="flex items-center gap-2 px-[var(--page-px)] py-4">
        {/* Flyttet op over fanebladene, så toggle-knapperne sidder samme sted
            uanset liste- eller kalendervisning — før lå denne række UNDER
            fanebladene, som kun fandtes i listevisning, så hele rækken
            hoppede opad, når man skiftede til kalendervisning. Samlet
            view-toggle med samme tynde stroke/rounding som søge-knappen
            (border-pepo-bds, rounded-[9px]) i stedet for den tidligere
            udfyldte bg-pepo-su-baggrund, så de to knapper visuelt fremstår
            som ÉN samlet funktion ved siden af søgningen. */}
        <div className="flex border border-pepo-bds rounded-[9px] bg-pepo-wh p-[3px] gap-0.5">
          <button
            onClick={() => changeViewMode("list")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center transition-colors " +
              (viewMode === "list" ? "bg-pepo-p text-white" : "text-pepo-t2")
            }
            title="Listevisning"
          >
            <Icon name="list" size={20} />
          </button>
          <button
            onClick={() => changeViewMode("calendar")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center transition-colors " +
              (viewMode === "calendar" ? "bg-pepo-p text-white" : "text-pepo-t2")
            }
            title="Kalendervisning"
          >
            <Icon name="calendar" size={20} />
          </button>
        </div>
        {viewMode === "list" && (
          <ExpandingSearchButton open={searchOpen} onOpenChange={setSearchOpen} value={search} onValueChange={setSearch} />
        )}
      </div>
      <div className="border-t border-pepo-bd" />

      {/* Fanebladene skjules, mens søgningen er foldet ud — søgning kigger
          jo bevidst på tværs af "Kommende"/"Tidligere" (se filtered ovenfor),
          så fanebladene giver ikke mening at vise samtidig. De kommer tilbage,
          når søgefeltet foldes ind igen (krydset nulstiller searchOpen). */}
      {viewMode === "list" && !searchOpen && (
        <div className="flex gap-1.5 border-b border-pepo-bd px-[var(--page-px)]">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "py-2.5 px-1 mr-[22px] text-[13.5px] font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors " +
                (tab === t ? "text-pepo-p border-pepo-p" : "text-pepo-t2 border-transparent hover:text-pepo-t1")
              }
            >
              {TAB_LABELS[t]}
              {t === "requests" && requestsCount > 0 && (
                <span className="bg-[#C0021A] text-white text-[11px] font-bold min-w-[18px] h-[18px] rounded-full inline-flex items-center justify-center px-1 leading-none">
                  {requestsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="px-[var(--page-px)] py-[22px] pb-10 max-w-[760px]">
        {viewMode === "list" ? (
          searchOpen && !search.trim() ? null : groupedByDate.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-[60px] text-pepo-t3">
              <Icon name="calendar-event" size={32} className="mb-2.5" />
              <span className="text-[13.5px]">Ingen vagter i denne visning</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groupedByDate.map(([date, dayEvents]) => (
                <div key={date}>
                  <div className="text-[13px] font-semibold text-pepo-t2 capitalize mb-2.5">
                    {formatDayHeading(date)}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {dayEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        freelancers={freelancers}
                        flash={flash}
                        removingShiftId={removingShiftId}
                        removeStage={removeStage}
                        onEditEvent={() => openEditEvent(event)}
                        onAddShift={() => openAddShift(event)}
                        onOpenShift={(s) => openShiftDetail(s, event)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <CalendarView
              events={events}
              calYear={calYear}
              calMonth={calMonth}
              selectedDate={selectedDate}
              onNav={(delta) => {
                let m = calMonth + delta;
                let y = calYear;
                if (m < 0) {
                  m = 11;
                  y -= 1;
                } else if (m > 11) {
                  m = 0;
                  y += 1;
                }
                setCalMonth(m);
                setCalYear(y);
              }}
              onToday={() => {
                const d = new Date();
                setCalYear(d.getFullYear());
                setCalMonth(d.getMonth());
                setSelectedDate(now);
              }}
              onSelectDay={setSelectedDate}
            />
            <div className="text-[13px] font-semibold text-pepo-t2 capitalize mb-2.5">
              {formatDayHeading(agendaDate)}
            </div>
            {agendaEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-[30px] text-pepo-t3">
                <Icon name="calendar-event" size={32} className="mb-2.5" />
                <span className="text-[13.5px]">Ingen vagter denne dag</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {agendaEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    freelancers={freelancers}
                    flash={flash}
                    removingShiftId={removingShiftId}
                    removeStage={removeStage}
                    onEditEvent={() => openEditEvent(event)}
                    onAddShift={() => openAddShift(event)}
                    onOpenShift={(s) => openShiftDetail(s, event)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {wizard && (
        <ShiftWizardPanel
          state={wizard}
          clients={clients}
          categories={categories}
          freelancers={freelancers}
          busyShifts={busyShifts}
          onClose={() => setWizard(null)}
        />
      )}

      {openShift && (
        <ShiftDetailPanel
          shift={openShift.shift}
          event={openShift.event}
          categories={categories}
          freelancers={freelancers}
          busyShifts={busyShifts}
          onClose={() => setOpenShift(null)}
          onAssigned={flashShift}
          onReleased={(shiftId) => flashShift(shiftId, "red")}
          onSaved={(shiftId) => flashShift(shiftId, "purple")}
          onDeleted={startRemoving}
        />
      )}
    </div>
  );
}

// Eksporteret — genbruges af EventDeepLinkView.tsx (kalender-feedets
// "REDIGÉR OPLYSNINGER"-link peger på en dedikeret side med kun ÉT event,
// se app/tenant/(protected)/shifts/event/[id]/page.tsx), så selve
// kort-visningen ikke skal duplikeres.
export function EventCard({
  event,
  freelancers,
  flash,
  removingShiftId,
  removeStage,
  showDate,
  onEventDetailsPage,
  onEditEvent,
  onAddShift,
  onOpenShift,
}: {
  event: EventListItem;
  // Virksomhedens fulde freelancerliste — kun brugt til at udregne et
  // korrekt "X vagtanmodninger"-tal pr. vagt (se ShiftCard's
  // pendingRequestCount nedenfor), IKKE til selve tildelingen (den sker i
  // ShiftDetailPanel/ShiftWizardPanel).
  freelancers: FreelancerOption[];
  flash: { shiftId: string; color: "green" | "red" | "purple" } | null;
  // Vagten der lige nu kører "Slet vagt"-animationen (se ShiftCard) — holdes
  // midlertidigt i activeShifts nedenfor, selvom dens status allerede er
  // "cancelled", indtil forælderen selv nulstiller removingShiftId (se
  // ShiftBoard.tsx's startRemoving).
  removingShiftId?: string | null;
  removeStage?: "flash" | "fade" | "collapse" | null;
  // Viser eventets dato ØVERST i selve kortet, over titlen — kun sat af
  // EventDeepLinkView.tsx (deep-link-siden viser kun ét event, uden en
  // dato-gruppeoverskrift over sig, i modsætning til ShiftBoard.tsx's
  // fulde liste, som allerede grupperer kort under sin egen
  // formatDayHeading-overskrift pr. dag — der ville datoen dubleres).
  showDate?: boolean;
  // Sat af EventDeepLinkView.tsx (samme sted som showDate) — vi ER allerede
  // på "Eventdetaljer"-siden for netop dette event, så knappen der ellers
  // ville linke derhen vises i stedet fremhævet og ikke-klikbar (ingen grund
  // til at kunne "navigere" til den side man allerede kigger på).
  onEventDetailsPage?: boolean;
  onEditEvent: () => void;
  onAddShift: () => void;
  onOpenShift: (shift: ShiftListItem) => void;
}) {
  // Memoized på `event.shifts` (ikke bare `.filter()` direkte), for at
  // undgå at måle-effekten nedenfor genkører i et uendeligt loop: uden
  // useMemo får `activeShifts` en NY array-reference ved hvert render,
  // effektens dependency-array ser det som "ændret" hver gang, og
  // setCorners()-kaldet i effekten trigger selv et nyt render — en
  // uendelig loop, der reelt gjorde "Events & vagter"-siden usvarende
  // (rapporteret af Hjorth 2026-07-16 som "kan ikke loades").
  //
  // Sorteret efter starttid → jobfunktion → status (se compareShifts
  // ovenfor), så rækkefølgen er forudsigelig uanset hvilken rækkefølge
  // vagterne blev oprettet i. En vagt under sletning ("removingShiftId")
  // holdes bevidst med i listen selvom dens status allerede er "cancelled",
  // så ShiftCard kan nå at spille blink/udtoning/kollaps-animationen,
  // FØR den forsvinder helt — se ShiftCard's "removeStage"-prop.
  const activeShifts = useMemo(
    () =>
      event.shifts
        .filter((s) => s.status !== "cancelled" || s.id === removingShiftId)
        .sort((a, b) => compareShifts(a, b, removingShiftId)),
    [event.shifts, removingShiftId]
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [tickYs, setTickYs] = useState<number[]>([]);

  // Måler de faktiske korthøjder i DOM'en i stedet for at antage en fast
  // 64px korthøjde (se [[feedback_connector_line_single_shift_visual_fix]]).
  //
  // To designs er allerede afprøvet og forladt her:
  // 1) Hardcodet -top-10/h-[72px] ud fra en antaget korthøjde — virkede
  //    kun for kort #1 (forankret uafhængigt af søskende); enhver afvigelse
  //    fra 64px (fx to-linjet "X vagtanmodninger"-tekst) gav en fejl der
  //    voksede for hvert efterfølgende kort.
  // 2) Målt korthøjde, men stadig ét L-formet "hjørne" pr. kort kædet
  //    sammen (hvert hjørnes top = forrige hjørnes bund). Geometrisk
  //    korrekt (bekræftet med getBoundingClientRect i browseren — boksene
  //    mødtes pixel-for-pixel), men SÅ STADIG ud som et hak: `rounded-bl`
  //    får det forrige korts venstre kant til at bue væk fra x-positionen
  //    de sidste ~6px før dens bund, mens det næste korts kant starter
  //    fladt fra x-positionen i nøjagtig samme højde — ingen af dem tegner
  //    linjen i det lille overlap, så det ser ud som et gab, selv når
  //    tallene stemmer.
  //
  // Løsningen: adskil "trunk" (den lodrette linje) fra "hjørne" (kurven
  // ind i det enkelte kort). Trunken er ÉT sammenhængende element fra
  // -8px (under event-kortet) til det SIDSTE korts tud-punkt — den kan
  // aldrig få et hak, fordi den ikke er sat sammen af flere stykker.
  // Hvert korts hjørne er en lille, uafhængig kasse (kun høj nok til at
  // vise buen) forankret i KORTETS EGEN tud-position og ligger oven på
  // trunken i stedet for at udgøre en del af den.
  useLayoutEffect(() => {
    function measure() {
      const next: number[] = [];
      for (const el of cardRefs.current) {
        if (!el) continue;
        next.push(el.offsetTop + el.offsetHeight / 2);
      }
      // Springer over setState hvis værdierne er uændrede, så en
      // ResizeObserver, der fyrer uden en reel størrelsesændring, ikke
      // selv kan skabe en render-loop.
      setTickYs((prev) => (prev.length === next.length && prev.every((y, idx) => y === next[idx]) ? prev : next));
    }
    measure();
    const ro = new ResizeObserver(measure);
    cardRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [activeShifts]);

  const CORNER_HEIGHT = 18; // nok til en blød 6px-kurve plus lidt lige indløb
  const trunkHeight = tickYs.length > 0 ? tickYs[tickYs.length - 1] + 8 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={onEditEvent}
        className="bg-pepo-wh border border-pepo-bd rounded-xl px-[15px] py-[13px] cursor-pointer hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-colors"
      >
        {/* Info-kolonnen (titel + kunde/sted/afstand) og knap-klyngen er BEGGE
            børn af samme flex-række, i stedet for at knap-klyngen kun deler
            række med titlen alene — ellers dikterer knap-klyngens højde
            (tre stablede knapper) rækkens højde, og kunde/sted-linjerne
            (separate elementer UNDER hele rækken) rykker med ned, hvilket gav
            et stort, uønsket tomrum under titlen (rapporteret af Hjorth
            2026-08-07, se skærmbillede). Nu ligger kunde/sted/afstand INDE i
            info-kolonnen ved siden af knapperne, så et tomrum i stedet havner
            til HØJRE for en kort info-kolonne (usynligt, bag knapperne) i
            stedet for at skubbe teksten nedad. */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            {showDate && (
              <div className="text-[12.5px] text-pepo-t2 capitalize mb-1">{formatDayHeading(event.eventDate)}</div>
            )}
            <div className="text-[13.5px] font-semibold text-pepo-t1 py-px">{event.title}</div>
            <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
              <Icon name={event.clientIsPrivate ? "user" : "building-store"} size={21} className="text-pepo-t2 flex-shrink-0" />
              {event.clientName}
            </div>
            {event.venueLabel && (
              // items-start (ikke items-center) så pin-ikonet altid følger
              // toppen af venue-teksten, i stedet for at flyde midt i hele
              // linjen når teksten wrapper til to linjer. whitespace-pre-line
              // gør venueLabel()'s "\n" mellem navn og adresse til et rigtigt
              // linjeskift i stedet for en bindestreg (se lib/format.ts).
              <div className="text-xs text-pepo-t2 mt-0.5 flex items-start gap-1.5">
                <Icon name="map-pin" size={21} className="text-pepo-t2 flex-shrink-0 mt-px" />
                <span className="whitespace-pre-line">{event.venueLabel}</span>
              </div>
            )}
            {(event.venueDistanceKm != null || event.transportSurchargeKr != null) && (
              // Afstand og transporttillæg slået sammen på én linje (kun ét
              // route-ikon, bil-ikonet droppet) — ønsket af Hjorth 2026-07-27.
              <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
                <Icon name="route" size={21} className="text-pepo-t2 flex-shrink-0" />
                <span>
                  {event.venueDistanceKm != null && `Afstand: ${kmFmt.format(event.venueDistanceKm)} km.`}
                  {event.venueDistanceKm != null && event.transportSurchargeKr != null && " — "}
                  {event.transportSurchargeKr != null &&
                    `Transporttillæg (t/r): ${krFmt.format(event.transportSurchargeKr)} kr.`}
                </span>
              </div>
            )}
            {/* Forventet antal gæster/briefing/vedhæftninger — kun på selve
                "Eventdetaljer"-siden (onEventDetailsPage), IKKE i den
                kompakte kort-liste på "Events & vagter" (ville gøre hvert
                kort alt for langt der). Formålet er at admin kan se ALT om
                eventet her uden at skulle åbne "Redigér event" (Hjorth
                2026-08-08). */}
            {onEventDetailsPage && event.expectedGuests && (
              <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
                <Icon name="users" size={21} className="text-pepo-t2 flex-shrink-0" />
                <span>Forventet antal gæster: {event.expectedGuests}</span>
              </div>
            )}
            {onEventDetailsPage && event.description && (
              <div className="text-xs text-pepo-t2 mt-0.5 flex items-start gap-1.5">
                <Icon name="notes" size={21} className="text-pepo-t2 flex-shrink-0 mt-px" />
                <span className="whitespace-pre-line">{event.description}</span>
              </div>
            )}
            {onEventDetailsPage && event.attachments.length > 0 && (
              <div className="text-xs text-pepo-t2 mt-0.5 flex items-start gap-1.5">
                <Icon name="paperclip" size={21} className="text-pepo-t2 flex-shrink-0 mt-px" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  {event.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={a.fileUrl}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="truncate hover:text-pepo-p hover:underline"
                    >
                      {a.fileName}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex-shrink-0 flex flex-col gap-1.5">
            {onEventDetailsPage ? (
              <div
                aria-current="page"
                className="h-[30px] px-3 rounded-[7px] bg-pepo-p text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-default"
              >
                <Icon name="list-details" size={14} />
                Eventdetaljer
              </div>
            ) : (
              <Link
                href={`/shifts/event/${event.id}`}
                onClick={(e) => e.stopPropagation()}
                className="h-[30px] px-3 rounded-[7px] border border-pepo-bds text-xs font-medium text-pepo-p hover:bg-pepo-pl hover:border-pepo-pl transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Icon name="list-details" size={14} />
                Eventdetaljer
              </Link>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditEvent();
              }}
              className="h-[30px] px-3 rounded-[7px] border border-pepo-bds text-xs font-medium text-pepo-p hover:bg-pepo-pl hover:border-pepo-pl transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Icon name="pencil" size={14} />
              Redigér event
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddShift();
              }}
              className="h-[30px] px-3 rounded-[7px] border border-pepo-bds text-xs font-medium text-pepo-p hover:bg-pepo-pl hover:border-pepo-pl transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Icon name="plus" size={14} />
              Tilføj vagt
            </button>
          </div>
        </div>
      </div>
      {activeShifts.length > 0 && (
        <div ref={containerRef} className="relative pl-6 flex flex-col gap-2">
          {trunkHeight > 0 && (
            <div
              className="absolute left-2 w-[1.5px] bg-pepo-bds pointer-events-none"
              style={{ top: -8, height: trunkHeight }}
            />
          )}
          {activeShifts.map((shift, i) => (
            <Fragment key={shift.id}>
              {tickYs[i] !== undefined && (
                <div
                  className="absolute left-2 w-3.5 border-l-[1.5px] border-b-[1.5px] border-pepo-bds rounded-bl-[6px] pointer-events-none"
                  style={{ top: tickYs[i] - CORNER_HEIGHT, height: CORNER_HEIGHT }}
                />
              )}
              <ShiftCard
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                shift={shift}
                pendingRequestCount={countMatchingPendingRequests(shift, freelancers)}
                flashColor={shift.id === flash?.shiftId ? flash.color : null}
                removeStage={shift.id === removingShiftId ? removeStage ?? null : null}
                onClick={() => onOpenShift(shift)}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

const ShiftCard = forwardRef<
  HTMLDivElement,
  {
    shift: ShiftListItem;
    // Antal "pending" anmodninger fra freelancere der rent faktisk matcher
    // vagtens jobfunktion — udregnet af forælderen (EventCard) via
    // countMatchingPendingRequests(), IKKE shift.interests.length/rå
    // status-filtrering, som kunne tælle en anmodning med der slet ikke kan
    // vises som et "Anmodet"-mærkat i FreelancerAssignDropdown.tsx (se
    // [[project_shift_detail_panel_deferred_save]]).
    pendingRequestCount: number;
    // null = ikke ved at blinke. "green" efter en tildeling, "red" efter en
    // frigivelse, "purple" efter en almindelig "Gem ændringer"/"Duplikér
    // vagt" — se flashShift i ShiftBoard.tsx/EventDeepLinkView.tsx/
    // UnfilledShiftsView.tsx.
    flashColor: "green" | "red" | "purple" | null;
    // "Slet vagt"-animationens tre sekventielle faser for netop dette kort,
    // styret af forælderen (se ShiftBoard.tsx's startRemoving — samme
    // imperative mønster som flashShift, ikke en reaktiv effekt her i
    // komponenten):
    // 1) "flash" (1300ms) — samme lilla blink som "Gem ændringer"/
    //    "Duplikér vagt" (matcher pepo-flash-purple's varighed, se
    //    globals.css), så det er tydeligt HVILKET kort der lige blev slettet.
    // 2) "fade" (300ms) — kortet toner ud (opacity → 0), men beholder sin
    //    fulde plads i layoutet indtil det er helt gennemsigtigt.
    // 3) "collapse" (300ms) — FØRST når kortet er usynligt, kollapser dets
    //    højde, så resten af vagterne glider op og fylder hullet ud, i
    //    stedet for at springe med det samme. `maxHeight` sættes til en fast
    //    pixelværdi i "fade"-fasen (uden selv at transitionere), så der er
    //    en forpligtet startværdi CSS-transitionen faktisk kan animere FRA
    //    i "collapse"-fasen — man kan ikke transitionere fra en
    //    uspecificeret (auto) højde.
    removeStage: "flash" | "fade" | "collapse" | null;
    onClick: () => void;
  }
>(function ShiftCard({ shift, pendingRequestCount, flashColor, removeStage, onClick }, ref) {
  // For en "til salg"-vagt hænger sælgeren (assignedFreelancerName) stadig
  // ved som assigned_freelancer_id, selvom vagten reelt er ledig igen — så
  // snart nogen har anmodet om den, skal antallet af anmodninger vises i
  // stedet for sælgerens navn (ellers ville en ny anmodning aldrig kunne
  // ses her). For en almindelig tildelt vagt vinder sælgerens/den tildeltes
  // navn altid, uanset (der forekommer reelt aldrig anmodninger på en
  // allerede tildelt vagt).
  const rightText =
    shift.status === "for_resale" && pendingRequestCount > 0
      ? `${pendingRequestCount} vagtanmodning${pendingRequestCount === 1 ? "" : "er"}`
      : shift.assignedFreelancerName
      ? shift.assignedFreelancerName
      : pendingRequestCount > 0
      ? `${pendingRequestCount} vagtanmodning${pendingRequestCount === 1 ? "" : "er"}`
      : "";
  const flashClass =
    removeStage === "flash"
      ? " pepo-flash-purple"
      : flashColor === "green"
      ? " pepo-flash-green"
      : flashColor === "red"
      ? " pepo-flash-red"
      : flashColor === "purple"
      ? " pepo-flash-purple"
      : "";
  return (
    <div
      ref={ref}
      className="overflow-hidden"
      style={
        removeStage === "fade"
          ? { opacity: 0, maxHeight: 200, transition: "opacity 300ms ease" }
          : removeStage === "collapse"
          ? { opacity: 0, maxHeight: 0, transition: "max-height 300ms ease" }
          : undefined
      }
    >
      <button
        onClick={onClick}
        className={
          "relative text-left w-full bg-pepo-wh border rounded-xl px-[15px] py-[13px] flex items-center gap-3 transition-colors hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] " +
          SHIFT_BORDER_CLASS[shift.status] +
          flashClass
        }
      >
        <div className="w-[38px] h-[38px] rounded-[10px] bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0 text-base">
          <Icon name={shift.categoryIcon || "briefcase"} size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium text-pepo-t1">{shift.category}</div>
          <div className="text-xs text-pepo-t2 mt-0.5">{formatTimeRange(shift.startTime, shift.endTime)}</div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={"badge " + STATUS_BADGE_CLASS[shift.status]}>{STATUS_LABEL[shift.status]}</span>
          {rightText && <span className={"text-[11.5px] " + STATUS_TEXT_CLASS[shift.status]}>{rightText}</span>}
        </div>
        <style jsx>{`
          .badge {
            display: inline-flex;
            padding: 3px 9px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            flex-shrink: 0;
          }
        `}</style>
      </button>
    </div>
  );
});

// Bygger de 42 kalenderceller (inkl. nabomånedernes udfyldningsdage) for
// en given måned — udtrukket til en selvstændig funktion så CalendarView
// kan bygge tre måneders celler på én gang (forrige/nuværende/næste), som
// alle tre altid ligger side om side i drag-baren nedenfor.
function buildMonthCells(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // mandag = 0
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date: d, dateStr, otherMonth: d.getMonth() !== month };
  });
}

function addMonths(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function CalendarView({
  events,
  calYear,
  calMonth,
  selectedDate,
  onNav,
  onToday,
  onSelectDay,
}: {
  events: EventListItem[];
  calYear: number;
  calMonth: number;
  selectedDate: string | null;
  onNav: (delta: number) => void;
  onToday: () => void;
  onSelectDay: (date: string) => void;
}) {
  const now = todayIso();
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("da-DK", {
    month: "long",
    year: "numeric",
  });

  const dotColor: Record<string, string> = {
    green: "bg-[#1A7A34]",
    red: "bg-[#C0021A]",
    gray: "bg-pepo-t3",
    none: "bg-transparent",
  };

  // Ægte live-drag-karrusel (Hjorth 2026-07-31: "mens jeg stadig holder
  // fingeren nede... vil jeg DRAGE den nye måned ind i synsfeltet fra den
  // rigtige side... og først ved slip glider måneden resten af vejen på
  // plads"). Den tidligere version (touchstart/touchend + kun EFTER slip en
  // hel animation) gav ingen fornemmelse af at trække selv — erstattet med
  // Motions rigtige drag="x"-gestus, bygget efter emil-design-eng-skillens
  // og motion.dev's egen dokumentation (drag/gestures/motion-values).
  //
  // Arkitektur: tre måneders grids (forrige/nuværende/næste) ligger altid
  // side om side i én flex-bar. Det midterste panel starter centreret i
  // viewport'et via `marginLeft: -100%` på det første panel — et rent
  // CSS-tricks der skubber hele rækken én panel-bredde til venstre, uden at
  // vi behøver måle bredden for selve hvile-positionen. `trackX` (en
  // useMotionValue, ikke en x/y-genvej på et statisk objekt) styrer den
  // LEVENDE forskydning under selve trækket — Motion optimerer denne vej
  // med hardware-accelereret transform.
  const shouldReduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackX = useMotionValue(0);
  const [panelWidth, setPanelWidth] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setPanelWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "I dag"-knappen og pil-knapperne kan ændre calYear/calMonth udefra
  // (props), mens et drag er i gang. Skifter det ydre måned-index, snapper
  // vi trækket tilbage til hvile med det samme, så det ikke fryser midt i
  // en gammel gestus.
  const monthIndex = calYear * 12 + calMonth;
  const [prevMonthIndex, setPrevMonthIndex] = useState(monthIndex);
  if (monthIndex !== prevMonthIndex) {
    setPrevMonthIndex(monthIndex);
    trackX.jump(0);
  }

  const prev = addMonths(calYear, calMonth, -1);
  const next = addMonths(calYear, calMonth, 1);
  const panels = [
    { ...prev, key: `${prev.year}-${prev.month}` },
    { year: calYear, month: calMonth, key: `${calYear}-${calMonth}` },
    { ...next, key: `${next.year}-${next.month}` },
  ];

  // Ignorerer klik på en dato-celle hvis der lige har været et reelt træk
  // (Motions egen pan-gestus aktiveres først efter ~3px bevægelse, så et
  // "rigtigt" træk sætter altid dette flag). Nulstilles en anelse forsinket
  // efter slip, så det stadig gælder når den efterfølgende syntetiske
  // click-event (museknap/desktop) rammer den underliggende dato-knap —
  // rene touch-enheder undertrykker allerede selv click efter et langt
  // touchmove, men musetræk gør ikke, så vagten er nødvendig for begge.
  const justDraggedRef = useRef(false);

  function handleDragStart() {
    justDraggedRef.current = true;
  }

  function handleDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    window.setTimeout(() => {
      justDraggedRef.current = false;
    }, 0);

    if (panelWidth <= 0) {
      animate(trackX, 0, { type: "spring", stiffness: 420, damping: 40 });
      return;
    }

    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const distanceThreshold = panelWidth * 0.3;
    const velocityThreshold = 500;

    let delta = 0;
    if (offset <= -distanceThreshold || velocity <= -velocityThreshold) delta = 1;
    else if (offset >= distanceThreshold || velocity >= velocityThreshold) delta = -1;

    if (delta !== 0) {
      const target = delta === 1 ? -panelWidth : panelWidth;
      animate(trackX, target, {
        type: shouldReduceMotion ? "tween" : "spring",
        duration: shouldReduceMotion ? 0.12 : undefined,
        stiffness: 380,
        damping: 38,
        onComplete: () => {
          // Skifter måneden i det øjeblik glidningen er færdig, og hopper
          // trækket tilbage til 0 UDEN overgang i samme kald — de nye
          // paneler (beregnet af calYear/calMonth ovenfor) rykker samtidig
          // ét hak, så illusionen er sømløs (samme trick som Embla/
          // react-slick bruger til uendelig paging med kun 3 renderede
          // paneler ad gangen).
          onNav(delta);
          trackX.jump(0);
        },
      });
    } else {
      animate(trackX, 0, { type: "spring", stiffness: 420, damping: 40 });
    }
  }

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-[22px] mb-7">
      <div className="flex items-center justify-between mb-3.5">
        {/* Massiv mørklilla med hvide pile i stedet for den tidligere tynde
            grå streg-knap — for utydelig til at se med det samme (Hjorth
            2026-07-30). */}
        <button onClick={() => onNav(-1)} className="w-[30px] h-[30px] rounded-lg bg-pepo-p flex items-center justify-center text-white hover:opacity-90 transition-opacity">
          <Icon name="chevron-left" size={16} />
        </button>
        <div className="text-center">
          <div className="text-[14.5px] font-semibold capitalize">{monthLabel}</div>
          <button onClick={onToday} className="text-[12px] font-medium text-pepo-p">
            I dag
          </button>
        </div>
        <button onClick={() => onNav(1)} className="w-[30px] h-[30px] rounded-lg bg-pepo-p flex items-center justify-center text-white hover:opacity-90 transition-opacity">
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      {/* Ugedagsoverskrifterne er ens uanset måned, så de ligger UDENFOR den
          trækbare bane nedenfor — kun selve datocellerne skal
          følge med fingeren, ellers ville "Man/Tir/..."-rækken fejlagtigt
          rykke med under trækket hver gang. */}
      <div className="grid grid-cols-7 gap-[3px] mb-1.5">
        {["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"].map((d) => (
          <div key={d} className="text-center text-[10.5px] font-medium uppercase text-pepo-t3">
            {d}
          </div>
        ))}
      </div>
      <div ref={viewportRef} className="relative overflow-hidden">
        <motion.div
          className="flex"
          style={{ x: trackX, touchAction: "pan-y" }}
          drag={panelWidth > 0 ? "x" : false}
          dragConstraints={{ left: -panelWidth, right: panelWidth }}
          dragElastic={0.15}
          dragMomentum={false}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {panels.map((panel, i) => (
            <div
              key={panel.key}
              className="w-full shrink-0 grid grid-cols-7 gap-[3px]"
              style={i === 0 ? { marginLeft: "-100%" } : undefined}
            >
              {buildMonthCells(panel.year, panel.month).map(({ date, dateStr, otherMonth }) => {
                const isToday = dateStr === now;
                const isSelected = dateStr === selectedDate;
                const dot = dateStatusDot(events, dateStr);
                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      if (justDraggedRef.current) return;
                      onSelectDay(dateStr);
                    }}
                    className={
                      "aspect-square rounded-lg flex flex-col items-center justify-center gap-1 text-[12.5px] transition-colors " +
                      (isSelected
                        ? "bg-pepo-pl text-pepo-p font-medium"
                        : otherMonth
                        ? "text-pepo-t3 opacity-35"
                        : "text-pepo-t1 hover:bg-pepo-su") +
                      (isToday ? " border-[1.5px] border-pepo-p font-medium" : "")
                    }
                  >
                    <span>{date.getDate()}</span>
                    <span className={"w-1.5 h-1.5 rounded-full " + dotColor[dot]} />
                  </button>
                );
              })}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

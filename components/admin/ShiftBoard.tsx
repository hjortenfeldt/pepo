"use client";

import { Fragment, forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import ShiftWizardPanel, { type WizardState } from "./ShiftWizardPanel";
import ShiftDetailPanel from "./ShiftDetailPanel";

const krFmt = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });

type Tab = "upcoming" | "past" | "all";

const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Kommende",
  past: "Tidligere",
  all: "Alle",
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
}: {
  events: EventListItem[];
  clients: ClientOption[];
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [openShift, setOpenShift] = useState<{ shift: ShiftListItem; event: EventListItem } | null>(null);
  const [flashShiftId, setFlashShiftId] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kaldes fra ShiftDetailPanel lige efter en vellykket tildeling — panelet
  // lukker sig selv (closeOnSuccess), så dette er brugerens eneste visuelle
  // bekræftelse af HVILKEN vagt der lige blev opdateret. 1300ms matcher
  // .pepo-flash-green-animationens varighed (se globals.css).
  function flashShift(shiftId: string) {
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    setFlashShiftId(shiftId);
    flashTimeout.current = setTimeout(() => setFlashShiftId(null), 1300);
  }

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  const now = todayIso();

  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = events;
    if (tab === "upcoming") list = list.filter((e) => e.eventDate >= now && e.shifts.some((s) => s.status !== "cancelled"));
    if (tab === "past") list = list.filter((e) => e.eventDate < now);
    const q = search.trim().toLowerCase();
    if (q) {
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
    return [...list].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
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
      <div className="px-8 pt-[22px]">
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

      {viewMode === "list" && (
        <div className="flex gap-1.5 border-b border-pepo-bd px-8">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "py-2.5 px-1 mr-[22px] text-[13.5px] font-medium border-b-2 -mb-px transition-colors " +
                (tab === t ? "text-pepo-p border-pepo-p" : "text-pepo-t2 border-transparent hover:text-pepo-t1")
              }
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-pepo-bd" />
      <div className="flex items-center justify-between px-8 py-4">
        {viewMode === "list" ? (
          <div className="relative w-[38px] h-[38px] flex-shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Søg"
              className="w-[38px] h-[38px] rounded-[9px] border border-pepo-bds bg-pepo-wh text-pepo-t2 flex items-center justify-center hover:bg-pepo-su"
            >
              <Icon name="search" size={20} />
            </button>
            <div
              className={
                "absolute top-0 left-0 h-[38px] overflow-hidden border rounded-[9px] bg-pepo-wh transition-[width] duration-150 ease-out z-[5] " +
                (searchOpen
                  ? "w-[300px] border-pepo-bds opacity-100 pointer-events-auto"
                  : "w-0 border-transparent opacity-0 pointer-events-none")
              }
            >
              <Icon name="search" size={19} className="absolute left-[11px] top-1/2 -translate-y-1/2 text-pepo-t3 pointer-events-none" />
              <input
                type="text"
                autoFocus={searchOpen}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søg..."
                className="w-full h-full border-none outline-none px-[34px] text-[13.5px] bg-transparent"
              />
              <div
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-[6px] flex items-center justify-center cursor-pointer text-pepo-t3 hover:bg-pepo-su hover:text-pepo-t1"
              >
                <Icon name="x" size={20} />
              </div>
            </div>
          </div>
        ) : (
          <div />
        )}
        <div className="flex bg-pepo-su rounded-[9px] p-[3px] gap-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center transition-colors " +
              (viewMode === "list" ? "bg-pepo-wh shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-pepo-p" : "text-pepo-t2")
            }
            title="Listevisning"
          >
            <Icon name="list" size={20} />
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center transition-colors " +
              (viewMode === "calendar" ? "bg-pepo-wh shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-pepo-p" : "text-pepo-t2")
            }
            title="Kalendervisning"
          >
            <Icon name="calendar" size={20} />
          </button>
        </div>
      </div>
      <div className="border-t border-pepo-bd" />

      <div className="px-8 py-[22px] pb-10 max-w-[760px]">
        {viewMode === "list" ? (
          groupedByDate.length === 0 ? (
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
                        flashShiftId={flashShiftId}
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
                    flashShiftId={flashShiftId}
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
          onClose={() => setWizard(null)}
        />
      )}

      {openShift && (
        <ShiftDetailPanel
          shift={openShift.shift}
          event={openShift.event}
          clients={clients}
          categories={categories}
          freelancers={freelancers}
          onClose={() => setOpenShift(null)}
          onAssigned={flashShift}
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
  flashShiftId,
  onEditEvent,
  onAddShift,
  onOpenShift,
}: {
  event: EventListItem;
  flashShiftId: string | null;
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
  const activeShifts = useMemo(
    () => event.shifts.filter((s) => s.status !== "cancelled"),
    [event.shifts]
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
        className="bg-pepo-wh border border-pepo-bd rounded-xl px-[15px] py-[13px] cursor-pointer hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-colors flex items-center justify-between gap-2.5"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-pepo-t1 py-px">{event.title}</div>
          <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
            <Icon name="building-store" size={14} className="text-pepo-t3 flex-shrink-0" />
            {event.clientName}
          </div>
          {event.venueLabel && (
            <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
              <Icon name="map-pin" size={14} className="text-pepo-t3 flex-shrink-0" />
              {event.venueLabel}
            </div>
          )}
          {event.transportSurchargeKr != null && (
            <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
              <Icon name="car" size={14} className="text-pepo-t3 flex-shrink-0" />
              Transporttillæg: {krFmt.format(event.transportSurchargeKr)} kr.
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddShift();
          }}
          className="flex-shrink-0 h-[30px] px-3 rounded-[7px] border border-pepo-bds text-xs font-medium text-pepo-p hover:bg-pepo-pl hover:border-pepo-pl transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          <Icon name="plus" size={14} />
          Tilføj vagt til event
        </button>
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
                isFlashing={shift.id === flashShiftId}
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
  HTMLButtonElement,
  {
    shift: ShiftListItem;
    isFlashing: boolean;
    onClick: () => void;
  }
>(function ShiftCard({ shift, isFlashing, onClick }, ref) {
  const rightText = shift.assignedFreelancerName
    ? shift.assignedFreelancerName
    : shift.interests.length > 0
    ? `${shift.interests.length} vagtanmodning${shift.interests.length === 1 ? "" : "er"}`
    : "";
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={
        "relative text-left bg-pepo-wh border rounded-xl px-[15px] py-[13px] flex items-center gap-3 transition-colors hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] " +
        SHIFT_BORDER_CLASS[shift.status] +
        (isFlashing ? " pepo-flash-green" : "")
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
  );
});

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

  const firstOfMonth = new Date(calYear, calMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // mandag = 0
  const gridStart = new Date(calYear, calMonth, 1 - startOffset);

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date: d, dateStr, otherMonth: d.getMonth() !== calMonth };
  });

  const dotColor: Record<string, string> = {
    green: "bg-[#1A7A34]",
    red: "bg-[#C0021A]",
    gray: "bg-pepo-t3",
    none: "bg-transparent",
  };

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-[22px] mb-7">
      <div className="flex items-center justify-between mb-3.5">
        <button onClick={() => onNav(-1)} className="w-[30px] h-[30px] rounded-lg border border-pepo-bd flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
          <Icon name="chevron-left" size={16} />
        </button>
        <div className="text-center">
          <div className="text-[14.5px] font-semibold capitalize">{monthLabel}</div>
          <button onClick={onToday} className="text-[12px] font-medium text-pepo-p">
            I dag
          </button>
        </div>
        <button onClick={() => onNav(1)} className="w-[30px] h-[30px] rounded-lg border border-pepo-bd flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"].map((d) => (
          <div key={d} className="text-center text-[10.5px] font-medium uppercase text-pepo-t3 pb-1.5">
            {d}
          </div>
        ))}
        {cells.map(({ date, dateStr, otherMonth }) => {
          const isToday = dateStr === now;
          const isSelected = dateStr === selectedDate;
          const dot = dateStatusDot(events, dateStr);
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDay(dateStr)}
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
    </div>
  );
}

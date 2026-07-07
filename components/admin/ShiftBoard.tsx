"use client";

import { useMemo, useState } from "react";
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
  completed: "Afsluttet",
  cancelled: "Slettet",
};

const STATUS_BADGE_CLASS: Record<ShiftStatus, string> = {
  open: "bg-[#FDECEA] text-[#C0021A]",
  for_resale: "bg-[#FEF3E2] text-[#9A5F00]",
  assigned: "bg-[#EAF6EE] text-[#1A7A34]",
  completed: "bg-pepo-su text-pepo-t2",
  cancelled: "bg-pepo-su text-pepo-t3",
};

// Kortets kant er farvet som badgens lyse baggrund i hvile, og mørkner til
// badgens tekstfarve ved hover — matcher .scard[data-status]-reglerne i
// Pepo – Admin vagter.html.
const SHIFT_BORDER_CLASS: Record<ShiftStatus, string> = {
  open: "border-[#FDECEA] hover:border-[#C0021A]",
  for_resale: "border-[#FEF3E2] hover:border-[#9A5F00]",
  assigned: "border-[#EAF6EE] hover:border-[#1A7A34]",
  completed: "border-pepo-bd hover:border-pepo-t3",
  cancelled: "border-pepo-bd hover:border-pepo-t3",
};

const STATUS_TEXT_CLASS: Record<ShiftStatus, string> = {
  open: "text-[#C0021A]",
  for_resale: "text-[#9A5F00]",
  assigned: "text-[#1A7A34]",
  completed: "text-pepo-t3",
  cancelled: "text-pepo-t3",
};

function dateStatusDot(events: EventListItem[], dateStr: string): "green" | "red" | "gray" | "none" {
  const dayEvents = events.filter((e) => e.eventDate === dateStr);
  if (dayEvents.length === 0) return "none";
  const activeShifts = dayEvents.flatMap((e) => e.shifts).filter((s) => s.status !== "cancelled");
  if (activeShifts.length === 0) return "gray";
  return activeShifts.every((s) => s.status === "assigned" || s.status === "completed") ? "green" : "red";
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
    <div className="flex flex-col h-screen">
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
            <i className="ti ti-plus" />
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
                "py-2.5 mr-[22px] text-[13.5px] font-medium border-b-2 -mb-px transition-colors " +
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
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Søg titel, kunde, kategori eller freelancer..."
              className={
                "h-[38px] border border-pepo-bds rounded-[9px] pl-[34px] pr-3 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p transition-all " +
                (searchOpen || search ? "w-[300px]" : "w-[38px] cursor-pointer")
              }
            />
            <i className="ti ti-search absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-pepo-t3 pointer-events-none" />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-pepo-t3 hover:text-pepo-t1"
              >
                <i className="ti ti-x text-[13px]" />
              </button>
            )}
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
            <i className="ti ti-list text-[16px]" />
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center transition-colors " +
              (viewMode === "calendar" ? "bg-pepo-wh shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-pepo-p" : "text-pepo-t2")
            }
            title="Kalendervisning"
          >
            <i className="ti ti-calendar text-[16px]" />
          </button>
        </div>
      </div>
      <div className="border-t border-pepo-bd" />

      <div className="flex-1 overflow-y-auto px-8 py-[22px] pb-10 max-w-[760px]">
        {viewMode === "list" ? (
          groupedByDate.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
              <i className="ti ti-calendar-event text-[32px] mb-2.5" />
              <span className="text-[13.5px]">Ingen events i denne visning</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groupedByDate.map(([date, dayEvents]) => (
                <div key={date}>
                  <div className="text-[12.5px] font-medium text-pepo-t2 capitalize mb-2.5">
                    {formatDayHeading(date)}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {dayEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
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
          >
            <div className="mt-5">
              <div className="text-[12.5px] font-medium text-pepo-t2 capitalize mb-2.5">
                {formatDayHeading(agendaDate)}
              </div>
              {agendaEvents.length === 0 ? (
                <div className="text-[13px] text-pepo-t3 py-6 text-center">Ingen vagter denne dag</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {agendaEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onEditEvent={() => openEditEvent(event)}
                      onAddShift={() => openAddShift(event)}
                      onOpenShift={(s) => openShiftDetail(s, event)}
                    />
                  ))}
                </div>
              )}
            </div>
          </CalendarView>
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
          categories={categories}
          freelancers={freelancers}
          onClose={() => setOpenShift(null)}
          onEditEvent={() => {
            const event = openShift.event;
            setOpenShift(null);
            openEditEvent(event);
          }}
        />
      )}
    </div>
  );
}

function EventCard({
  event,
  onEditEvent,
  onAddShift,
  onOpenShift,
}: {
  event: EventListItem;
  onEditEvent: () => void;
  onAddShift: () => void;
  onOpenShift: (shift: ShiftListItem) => void;
}) {
  const activeShifts = event.shifts.filter((s) => s.status !== "cancelled");
  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={onEditEvent}
        className="bg-pepo-wh border border-pepo-bd rounded-xl px-[15px] py-[13px] cursor-pointer hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-colors flex items-center justify-between gap-2.5"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-pepo-t1 py-px">{event.title}</div>
          <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
            <i className="ti ti-building-store text-xs text-pepo-t3 w-[13px] text-center flex-shrink-0" />
            {event.clientName}
          </div>
          {event.venueLabel && (
            <div className="text-xs text-pepo-t2 mt-0.5 flex items-center gap-1.5">
              <i className="ti ti-map-pin text-xs text-pepo-t3 w-[13px] text-center flex-shrink-0" />
              {event.venueLabel}
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
          <i className="ti ti-plus text-xs" />
          Tilføj vagt til event
        </button>
      </div>
      {activeShifts.length > 0 && (
        <div className="relative pl-6 flex flex-col gap-2">
          <div className="absolute left-2 -top-2 bottom-8 w-[1.5px] bg-pepo-bds" />
          {activeShifts.map((shift) => (
            <ShiftCard key={shift.id} shift={shift} onClick={() => onOpenShift(shift)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftCard({ shift, onClick }: { shift: ShiftListItem; onClick: () => void }) {
  const rightText = shift.assignedFreelancerName
    ? shift.assignedFreelancerName
    : shift.interests.length > 0
    ? `${shift.interests.length} vagtanmodning${shift.interests.length === 1 ? "" : "er"}`
    : "";
  return (
    <button
      onClick={onClick}
      className={
        "relative text-left bg-pepo-wh border rounded-xl px-[15px] py-[13px] flex items-center gap-3 transition-colors hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] " +
        SHIFT_BORDER_CLASS[shift.status]
      }
    >
      <div className="absolute -left-4 top-8 w-3.5 h-[1.5px] bg-pepo-bds" />
      <div className="w-[38px] h-[38px] rounded-[10px] bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0 text-base">
        <i className="ti ti-briefcase" />
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
}

function CalendarView({
  events,
  calYear,
  calMonth,
  selectedDate,
  onNav,
  onToday,
  onSelectDay,
  children,
}: {
  events: EventListItem[];
  calYear: number;
  calMonth: number;
  selectedDate: string | null;
  onNav: (delta: number) => void;
  onToday: () => void;
  onSelectDay: (date: string) => void;
  children: React.ReactNode;
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
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-[22px]">
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-[14.5px] font-semibold capitalize">{monthLabel}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={onToday} className="text-[12px] font-medium text-pepo-p px-2.5 py-1 rounded-lg hover:bg-pepo-su">
            I dag
          </button>
          <button onClick={() => onNav(-1)} className="w-[30px] h-[30px] rounded-lg border border-pepo-bd flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
            <i className="ti ti-chevron-left text-[15px]" />
          </button>
          <button onClick={() => onNav(1)} className="w-[30px] h-[30px] rounded-lg border border-pepo-bd flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
            <i className="ti ti-chevron-right text-[15px]" />
          </button>
        </div>
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
                (isToday && !isSelected ? " border border-pepo-p font-medium" : "")
              }
            >
              <span>{date.getDate()}</span>
              <span className={"w-1.5 h-1.5 rounded-full " + dotColor[dot]} />
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

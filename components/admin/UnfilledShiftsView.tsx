"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type { CategoryOption, ClientOption, EventListItem, FreelancerOption, ShiftListItem } from "@/lib/admin-types";
import { formatDayHeading } from "@/lib/format";
import ShiftWizardPanel, { type WizardState } from "./ShiftWizardPanel";
import ShiftDetailPanel from "./ShiftDetailPanel";
import { EventCard } from "./ShiftBoard";

/**
 * Deep-link-mål for "Ubesat(te) vagt(er) om få dage"-push'en — samme
 * stripped-down-filosofi som EventDeepLinkView.tsx (ingen faner/søgning/
 * liste-kalender-toggle/"+ Ny event"), men viser FLERE events grupperet pr.
 * dato ligesom ShiftBoard's listevisning, i stedet for ét enkelt event.
 * `events`-proppen er allerede filtreret af den kaldende page.tsx (se
 * lib/shifts-data.ts's filterEventsWithUnfilledShiftsWithinDays), så
 * komponenten her viser blot det den får.
 */
export default function UnfilledShiftsView({
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
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [openShift, setOpenShift] = useState<{ shift: ShiftListItem; event: EventListItem } | null>(null);
  const [flashShiftId, setFlashShiftId] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Samme mønster som ShiftBoard.tsx/EventDeepLinkView.tsx.
  function flashShift(shiftId: string) {
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    setFlashShiftId(shiftId);
    flashTimeout.current = setTimeout(() => setFlashShiftId(null), 1300);
  }

  // Samme sortering (næste event øverst) og gruppering pr. dato som
  // ShiftBoard's listevisning.
  const groupedByDate = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const groups = new Map<string, EventListItem[]>();
    for (const e of sorted) {
      const list = groups.get(e.eventDate) ?? [];
      list.push(e);
      groups.set(e.eventDate, list);
    }
    return [...groups.entries()];
  }, [events]);

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[22px] pb-10 max-w-[760px]">
        <Link
          href="/shifts"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-pepo-t2 hover:text-pepo-t1 transition-colors mb-4"
        >
          <Icon name="arrow-left" size={15} />
          Alle events
        </Link>

        <div className="text-[18px] font-semibold tracking-tight text-pepo-t1 mb-4">
          Ledige vagter i løbet af de næste syv dage
        </div>

        {groupedByDate.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-[60px] text-pepo-t3">
            <Icon name="calendar-event" size={32} className="mb-2.5" />
            <span className="text-[13.5px]">Ingen ubesatte vagter lige nu — godt gået!</span>
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
                      onEditEvent={() => setWizard({ mode: "editEvent", event })}
                      onAddShift={() => setWizard({ mode: "addShift", event })}
                      onOpenShift={(shift) => setOpenShift({ shift, event })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wizard && (
        <ShiftWizardPanel state={wizard} clients={clients} categories={categories} onClose={() => setWizard(null)} />
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

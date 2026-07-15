"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type { CategoryOption, ClientOption, EventListItem, FreelancerOption, ShiftListItem } from "@/lib/admin-types";
import { formatDayHeading } from "@/lib/format";
import ShiftWizardPanel, { type WizardState } from "./ShiftWizardPanel";
import ShiftDetailPanel from "./ShiftDetailPanel";
import { EventCard } from "./ShiftBoard";

/**
 * Stripped-down variant af ShiftBoard, til deep-link fra kalender-feedets
 * "REDIGÉR OPLYSNINGER"-link (URL-egenskaben i lib/ics.ts) — viser KUN det
 * ene event man klikkede sig herind på (kort + tilhørende vagt-kort), uden
 * faner ("Kommende"/"Tidligere"/"Alle"), søgning, list/kalender-toggle eller
 * "+ Ny event"-knappen. Overskriften er bevidst blot eventets dato, ikke
 * "Events & vagter" — hele pointen er at admin lander direkte på DET
 * relevante event, uden at skulle lede efter det blandt alle virksomhedens
 * andre events (som en admin ellers ville skulle gøre via søgefeltet på den
 * fulde /shifts-side).
 *
 * Genbruger EventCard (fra ShiftBoard.tsx), ShiftWizardPanel og
 * ShiftDetailPanel uændret — klik på selve event-kortet åbner redigering af
 * eventets egne oplysninger (kunde/sted/briefing osv.), klik på et vagt-kort
 * åbner den vagts detaljepanel, og "Tilføj vagt til event"-knappen på selve
 * kortet virker som normalt. Efter en gemt ændring kalder disse paneler selv
 * router.refresh(), som genkører den server-rendered forælder-side
 * (page.tsx) og dermed opdaterer `event`-proppen her automatisk.
 */
export default function EventDeepLinkView({
  event,
  clients,
  categories,
  freelancers,
}: {
  event: EventListItem;
  clients: ClientOption[];
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
}) {
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [openShift, setOpenShift] = useState<{ shift: ShiftListItem; event: EventListItem } | null>(null);
  const [flashShiftId, setFlashShiftId] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Samme mønster som ShiftBoard.tsx — se dens kommentar for hvorfor 1300ms.
  function flashShift(shiftId: string) {
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    setFlashShiftId(shiftId);
    flashTimeout.current = setTimeout(() => setFlashShiftId(null), 1300);
  }

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

        <div className="text-[18px] font-semibold tracking-tight text-pepo-t1 capitalize mb-4">
          {formatDayHeading(event.eventDate)}
        </div>

        <EventCard
          event={event}
          flashShiftId={flashShiftId}
          onEditEvent={() => setWizard({ mode: "editEvent", event })}
          onAddShift={() => setWizard({ mode: "addShift", event })}
          onOpenShift={(shift) => setOpenShift({ shift, event })}
        />
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

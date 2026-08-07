"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type { CategoryOption, ClientOption, EventListItem, FreelancerOption, ShiftListItem } from "@/lib/admin-types";
import { formatDayHeading } from "@/lib/format";
import type { BusyShift } from "@/lib/shift-conflicts";
import type { EventMessageItem } from "@/lib/event-messages";
import { replyToEventAsAdmin, uploadEventMessageAttachmentForEvent } from "@/app/tenant/(protected)/shifts/actions";
import CorrespondenceThread from "@/components/CorrespondenceThread";
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
  allEvents,
  clients,
  categories,
  freelancers,
  messages,
}: {
  event: EventListItem;
  // Virksomhedens FULDE, ikke-paginerede eventliste (samme data som
  // ShiftBoard.tsx modtager) — kun brugt til at udlede busyShifts nedenfor,
  // så "Utilgængelig"-tjekket i FreelancerAssignDropdown også fanger
  // overlap med vagter på ANDRE events end netop dette ene.
  allEvents: EventListItem[];
  clients: ClientOption[];
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
  // Eventets fulde korrespondance-tråd (dialog + system-ændringslog) — se
  // [[project_event_correspondence_and_system_log]]. Hentet server-side af
  // page.tsx, som også allerede har markeret klient-beskederne som læst.
  messages: EventMessageItem[];
}) {
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [openShift, setOpenShift] = useState<{ shift: ShiftListItem; event: EventListItem } | null>(null);
  const [flash, setFlash] = useState<{ shiftId: string; color: "green" | "red" | "purple" } | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Vagten der lige nu kører "Slet vagt"-animationen, og hvilken fase — se
  // ShiftBoard.tsx's startRemoving-kommentar for hvorfor.
  const [removingShiftId, setRemovingShiftId] = useState<string | null>(null);
  const [removeStage, setRemoveStage] = useState<"flash" | "fade" | "collapse" | null>(null);
  const removeTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Samme udledning som ShiftBoard.tsx's busyShifts — se dens kommentar.
  const busyShifts = useMemo<BusyShift[]>(
    () =>
      allEvents.flatMap((e) =>
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
    [allEvents]
  );

  // Samme mønster som ShiftBoard.tsx — se dens kommentar for hvorfor 1300ms
  // og for grøn (tildeling)/rød (frigivelse)/lilla (gem ændringer) farvevalget.
  function flashShift(shiftId: string, color: "green" | "red" | "purple" = "green") {
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    setFlash({ shiftId, color });
    flashTimeout.current = setTimeout(() => setFlash(null), 1300);
  }

  // Samme mønster som ShiftBoard.tsx's startRemoving — se dens kommentar.
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

  return (
    <div className="flex flex-col">
      <div className="px-[var(--page-px)] pt-[22px] pb-10 max-w-[760px]">
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
          freelancers={freelancers}
          flash={flash}
          removingShiftId={removingShiftId}
          removeStage={removeStage}
          onEditEvent={() => setWizard({ mode: "editEvent", event })}
          onAddShift={() => setWizard({ mode: "addShift", event })}
          onOpenShift={(shift) => setOpenShift({ shift, event })}
        />

        <div id="korrespondance" className="mt-8 scroll-mt-6">
          <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Korrespondance</div>
          <CorrespondenceThread
            messages={messages}
            viewerRole="admin"
            selfSenderName="Dig"
            placeholder="Skriv en besked..."
            maxHeightClassName="max-h-[420px]"
            onSend={(body, attachments) => replyToEventAsAdmin(event.id, body, attachments)}
            onUploadAttachment={(file) => uploadEventMessageAttachmentForEvent(event.id, file)}
          />
        </div>
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

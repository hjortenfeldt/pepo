import { todayIso } from "@/lib/format";
import type { ShiftStatus, InterestStatus } from "@/lib/admin-types";

/**
 * Rene, side-effekt-frie hjælpefunktioner der arbejder på allerede hentede
 * events/vagter — bevidst IKKE i lib/shifts-data.ts (som har
 * `import "server-only"` og derfor ikke må importeres fra en client-
 * component). Bruges både server-side (page.tsx's valg af standard-fane,
 * Dashboard-sidens "Afventer handling"-kort) og client-side (ShiftBoard.tsx's
 * "Vagtanmodninger"-fanes filter/antals-badge) — en tidligere version lå i
 * shifts-data.ts og fik hele "Events & vagter"-siden til at fejle i build
 * (webpack: "server-only" bundlet ind i en client-component via
 * ShiftBoard.tsx → EventDeepLinkView.tsx).
 *
 * Parameter-typerne herunder er bevidst minimale (kun de felter selve
 * beregningen bruger), IKKE de fulde ShiftListItem/EventListItem — så
 * Dashboard-sidens lettere DashboardShift/DashboardEvent (som ikke har fx
 * kategori-navn eller freelancer-navn, kun det staffing-relevante) også
 * strukturelt matcher og kan genbruge nøjagtig samme regel, uden en tredje
 * duplikeret udgave af betingelsen.
 */

export type PendingRequestShift = {
  status: ShiftStatus;
  assignedFreelancerId: string | null;
  interests: { status: InterestStatus }[];
};

export type PendingRequestEvent = {
  eventDate: string;
  shifts: PendingRequestShift[];
};

/**
 * Afgør om en vagt har en ventende vagtanmodning, admin endnu ikke har
 * taget stilling til — samme betingelse som ShiftCard (ShiftBoard.tsx)
 * bruger til at vise "X vagtanmodninger" i stedet for et tildelt navn.
 */
export function hasPendingShiftRequest(shift: PendingRequestShift): boolean {
  return shift.status !== "cancelled" && !shift.assignedFreelancerId && shift.interests.some((i) => i.status === "pending");
}

/** Antal ventende vagtanmodninger på tværs af alle KOMMENDE events. */
export function countPendingShiftRequests(events: PendingRequestEvent[], today: string = todayIso()): number {
  let count = 0;
  for (const e of events) {
    if (e.eventDate < today) continue;
    for (const s of e.shifts) {
      if (hasPendingShiftRequest(s)) count++;
    }
  }
  return count;
}

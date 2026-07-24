import { todayIso } from "@/lib/format";
import type { EventListItem, ShiftListItem } from "@/lib/admin-types";

/**
 * Rene, side-effekt-frie hjælpefunktioner der arbejder på allerede hentede
 * events/vagter — bevidst IKKE i lib/shifts-data.ts (som har
 * `import "server-only"` og derfor ikke må importeres fra en client-
 * component). Bruges både server-side (page.tsx's valg af standard-fane) og
 * client-side (ShiftBoard.tsx's "Vagtanmodninger"-fanes filter/antals-badge)
 * — en tidligere version lå i shifts-data.ts og fik hele "Events & vagter"-
 * siden til at fejle i build (webpack: "server-only" bundlet ind i en
 * client-component via ShiftBoard.tsx → EventDeepLinkView.tsx).
 */

/**
 * Afgør om en vagt har en ventende vagtanmodning, admin endnu ikke har
 * taget stilling til — samme betingelse som ShiftCard (ShiftBoard.tsx)
 * bruger til at vise "X vagtanmodninger" i stedet for et tildelt navn.
 */
export function hasPendingShiftRequest(shift: ShiftListItem): boolean {
  return shift.status !== "cancelled" && !shift.assignedFreelancerId && shift.interests.some((i) => i.status === "pending");
}

/** Antal ventende vagtanmodninger på tværs af alle KOMMENDE events. */
export function countPendingShiftRequests(events: EventListItem[], today: string = todayIso()): number {
  let count = 0;
  for (const e of events) {
    if (e.eventDate < today) continue;
    for (const s of e.shifts) {
      if (hasPendingShiftRequest(s)) count++;
    }
  }
  return count;
}

// Beregner "Utilgængelig"-mærkatet i FreelancerAssignDropdown.tsx: om en
// freelancer allerede er tildelt en ANDEN vagt samme dato, hvis tidsrum
// overlapper den vagt, admin er ved at tildele/oprette. Bruges af BÅDE
// ShiftDetailPanel.tsx (redigering af en eksisterende vagt) og
// ShiftWizardPanel.tsx (oprettelse af nye vagter) — se
// [[project_unified_assign_dropdown]].
//
// Ingen ny databaseforespørgsel nødvendig: al virksomhedens vagtdata er
// allerede hentet company-wide til board-siderne (ShiftBoard.tsx,
// EventDeepLinkView.tsx, UnfilledShiftsView.tsx via getShiftsBoardData) —
// blot nestet under events. Board-siderne udleder `busyShifts` herfra én
// gang via useMemo og sender det ned som prop.
export type BusyShift = {
  shiftId: string;
  freelancerId: string;
  date: string; // ISO-dato
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Standard interval-overlap (slutspunkter er eksklusive) — to vagter der
// bare "rører" hinanden (fx 10:00–14:00 og 14:00–18:00) tæller ikke som
// overlap.
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

// excludeShiftId: udelader vagten man selv er ved at redigere, så den ikke
// falsk overlapper "sig selv" i den oprindelige (endnu ikke gemte) tid.
export function findConflictFreelancerIds(
  busyShifts: BusyShift[],
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string | null
): Set<string> {
  const ids = new Set<string>();
  if (!date || !startTime || !endTime) return ids;
  for (const b of busyShifts) {
    if (b.shiftId === excludeShiftId) continue;
    if (b.date !== date) continue;
    if (timesOverlap(startTime, endTime, b.startTime, b.endTime)) {
      ids.add(b.freelancerId);
    }
  }
  return ids;
}

import { hoursBetween } from "@/lib/format";
import type { DashboardEventItem, DashboardEventRole, MonthlyFinancials, ShiftStatus } from "@/lib/admin-types";

export type DashboardShift = {
  category: string;
  status: ShiftStatus;
  startTime: string;
  endTime: string;
  clientRatePerHour: number;
  freelancerRatePerHour: number;
};

export type DashboardEvent = {
  id: string;
  title: string;
  eventDate: string; // ISO dato
  shifts: DashboardShift[];
};

function hasActiveShift(event: DashboardEvent): boolean {
  return event.shifts.some((s) => s.status !== "cancelled");
}

/**
 * Omsætning/udgift pr. måned for et givent kalenderår. Indtjening tælles
 * for alle ikke-annullerede vagter (kunden faktureres for det bestilte,
 * uanset bemandingsstatus). Udbetaling tælles kun for assigned/completed
 * (man betaler ikke honorar for en vagt ingen er tildelt).
 */
export function monthlyFinancials(events: DashboardEvent[], year: number): MonthlyFinancials[] {
  const months: MonthlyFinancials[] = Array.from({ length: 12 }, () => ({ revenue: 0, expense: 0 }));

  for (const event of events) {
    if (!event.eventDate.startsWith(String(year))) continue;
    const monthIndex = new Date(event.eventDate + "T00:00:00").getMonth();
    for (const shift of event.shifts) {
      if (shift.status === "cancelled") continue;
      const hours = hoursBetween(shift.startTime, shift.endTime);
      months[monthIndex].revenue += hours * shift.clientRatePerHour;
      if (shift.status === "assigned" || shift.status === "completed") {
        months[monthIndex].expense += hours * shift.freelancerRatePerHour;
      }
    }
  }

  return months;
}

export function eventCounts(events: DashboardEvent[], today: string) {
  return {
    booket: events.filter(hasActiveShift).length,
    afviklet: events.filter((e) => e.eventDate < today).length,
    kommende: events.filter((e) => e.eventDate >= today).length,
  };
}

export function freelancerHourStats(events: DashboardEvent[], approvedCount: number, today: string) {
  let timerArbejdet = 0;
  let timerPlanlagt = 0;

  for (const event of events) {
    for (const shift of event.shifts) {
      const hours = hoursBetween(shift.startTime, shift.endTime);
      if (event.eventDate < today && (shift.status === "assigned" || shift.status === "completed")) {
        timerArbejdet += hours;
      } else if (event.eventDate >= today && shift.status !== "cancelled") {
        timerPlanlagt += hours;
      }
    }
  }

  return { ansatte: approvedCount, timerArbejdet, timerPlanlagt };
}

function computeRoles(shifts: DashboardShift[]): DashboardEventRole[] {
  const byCategory = new Map<string, DashboardEventRole>();
  for (const shift of shifts) {
    if (shift.status === "cancelled") continue;
    const role = byCategory.get(shift.category) ?? {
      category: shift.category,
      assigned: 0,
      open: 0,
      forResale: 0,
    };
    if (shift.status === "assigned" || shift.status === "completed") role.assigned += 1;
    else if (shift.status === "open") role.open += 1;
    else if (shift.status === "for_resale") role.forResale += 1;
    byCategory.set(shift.category, role);
  }
  return [...byCategory.values()];
}

export function eventFullyStaffed(roles: DashboardEventRole[]): boolean {
  return roles.every((r) => r.open === 0 && r.forResale === 0);
}

function toEventItem(event: DashboardEvent): DashboardEventItem {
  return { id: event.id, title: event.title, eventDate: event.eventDate, roles: computeRoles(event.shifts) };
}

export function upcomingEvents(events: DashboardEvent[], today: string, limit = 5): DashboardEventItem[] {
  return events
    .filter((e) => hasActiveShift(e) && e.eventDate >= today)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .slice(0, limit)
    .map(toEventItem);
}

export function recentEvents(events: DashboardEvent[], today: string, limit = 5): DashboardEventItem[] {
  return events
    .filter((e) => hasActiveShift(e) && e.eventDate < today)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
    .slice(0, limit)
    .map(toEventItem);
}

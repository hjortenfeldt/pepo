import "server-only";
import { formatDateDisplay } from "@/lib/format";

/**
 * Opbygger en gyldig iCalendar (.ics)-fil til tenantens
 * kalender-abonnement ("Sync med kalender" under Indstillinger).
 *
 * Én VEVENT pr. event (ikke pr. vagt) — DTSTART/DTEND spænder fra den
 * tidligste vagts starttid til den seneste vagts sluttid samme dag (eller
 * dagen efter, hvis en vagt går over midnat). Har eventet ingen vagter,
 * bliver det en heldagsbegivenhed.
 */

export type IcsShiftInput = {
  category: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  /** Allerede beregnet visningstekst, fx "Ida Jensen", "Ida Jensen (til salg)" eller "Mangler". */
  statusText: string;
};

export type IcsEventInput = {
  id: string;
  title: string;
  eventDateIso: string; // "2026-07-11"
  tenantSlug: string;
  /** Virksomhedens visningsnavn — bruges i SUMMARY som "[Tenant name] (admin): ...". */
  tenantName: string;
  venueAddress: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  briefing: string | null;
  attachmentUrls: string[];
  shifts: IcsShiftInput[];
  updatedAtIso: string; // til DTSTAMP/LAST-MODIFIED
};

// Eksporteret (ikke kun brugt herinde) — genbruges af lib/freelancer-ics.ts,
// som bygger et andet ICS-feed (freelancerens eget "Sync med din kalender")
// med samme lavniveau RFC 5545-mekanik, men helt anderledes indhold/struktur.

// Escaper tekst til ICS TEXT-værdier iht. RFC 5545 §3.3.11.
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Folder lange linjer til maks. 75 oktetter pr. linje iht. RFC 5545 §3.1 —
// fortsættelseslinjer starter med et enkelt mellemrum. Skærer konservativt
// ved 73 tegn ad gangen for at undgå at splitte flerbyte UTF-8-tegn
// (æ/ø/å fylder 2 byte) midt over.
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const CHUNK = 73;
  const parts: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const chunk = rest.slice(0, CHUNK);
    parts.push((first ? "" : " ") + chunk);
    rest = rest.slice(CHUNK);
    first = false;
  }
  return parts.join("\r\n");
}

export function icsLine(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

export function icsDateTimeLocal(dateIso: string, time: string): string {
  const [y, m, d] = dateIso.split("-");
  const [hh, mm] = time.split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

export function icsDateOnly(dateIso: string): string {
  return dateIso.replaceAll("-", "");
}

export function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

// Standard VTIMEZONE-blok for Europe/Copenhagen (CET/CEST med EU's
// DST-regler), så lokale klokkeslæt vises korrekt uanset kalenderklient.
export const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Copenhagen",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function shiftEndDateIso(event: IcsEventInput, shift: IcsShiftInput): string {
  return shift.endTime <= shift.startTime ? addDays(event.eventDateIso, 1) : event.eventDateIso;
}

function buildDescription(event: IcsEventInput): string {
  const lines: string[] = [];

  lines.push("EVENT:");
  lines.push(`${event.title} - ${formatDateDisplay(event.eventDateIso)}`);
  lines.push("");

  lines.push("VAGTER:");
  if (event.shifts.length === 0) {
    lines.push("(Ingen vagter oprettet)");
  } else {
    event.shifts.forEach((s, i) => {
      lines.push(`#${i + 1} - ${s.category}, ${s.startTime}–${s.endTime} : ${s.statusText}`);
    });
  }
  lines.push("");

  lines.push("BRIEFING TIL JOBBET:");
  lines.push(event.briefing?.trim() || "(Ingen briefing angivet)");

  if (event.attachmentUrls.length > 0) {
    lines.push("");
    event.attachmentUrls.forEach((url, i) => {
      lines.push(`Link #${i + 1}: ${url}`);
    });
  }
  lines.push("");

  lines.push("EVENT-STED:");
  lines.push(event.venueAddress || "(Ikke angivet)");
  lines.push("");

  lines.push("KUNDEN:");
  lines.push(event.clientName || "(Ikke angivet)");
  lines.push(`Mail: ${event.clientEmail || "—"}`);
  lines.push(`Tel: ${event.clientPhone || "—"}`);
  lines.push("");

  lines.push("—————");
  lines.push("");
  lines.push("REDIGÉR OPLYSNINGER:");
  lines.push(`${event.tenantSlug}.pepo.team/shifts?event=${event.id}`);

  return lines.join("\n");
}

function buildVEvent(event: IcsEventInput): string {
  const activeShiftCount = event.shifts.length;
  const summary = `${event.tenantName} (admin): ${event.title} - ${activeShiftCount} vagter`;
  const description = buildDescription(event);
  const dtstamp = utcStamp(event.updatedAtIso || new Date().toISOString());

  const lines: string[] = ["BEGIN:VEVENT", `UID:event-${event.id}@pepo.team`, `DTSTAMP:${dtstamp}`, `LAST-MODIFIED:${dtstamp}`];

  if (event.shifts.length === 0) {
    lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(event.eventDateIso)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDateOnly(addDays(event.eventDateIso, 1))}`);
  } else {
    const earliestStart = event.shifts.reduce((min, s) => (s.startTime < min ? s.startTime : min), event.shifts[0].startTime);
    let latestEndDate = event.eventDateIso;
    let latestEndTime = "00:00";
    for (const s of event.shifts) {
      const endDate = shiftEndDateIso(event, s);
      if (endDate > latestEndDate || (endDate === latestEndDate && s.endTime > latestEndTime)) {
        latestEndDate = endDate;
        latestEndTime = s.endTime;
      }
    }
    lines.push(`DTSTART;TZID=Europe/Copenhagen:${icsDateTimeLocal(event.eventDateIso, earliestStart)}`);
    lines.push(`DTEND;TZID=Europe/Copenhagen:${icsDateTimeLocal(latestEndDate, latestEndTime)}`);
  }

  lines.push(icsLine("SUMMARY", icsEscape(summary)));
  if (event.venueAddress) lines.push(icsLine("LOCATION", icsEscape(event.venueAddress)));
  lines.push(icsLine("DESCRIPTION", icsEscape(description)));
  lines.push("END:VEVENT");

  return lines.join("\r\n");
}

export function buildCalendarFeed(events: IcsEventInput[]): string {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pepo//Personaleportalen//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pepo",
    VTIMEZONE,
    ...events.map(buildVEvent),
    "END:VCALENDAR",
  ].join("\r\n");
  return body + "\r\n";
}

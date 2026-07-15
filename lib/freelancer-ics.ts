import "server-only";
import { formatDateDisplay } from "@/lib/format";
import {
  icsEscape,
  foldLine,
  icsLine,
  icsDateTimeLocal,
  icsDateOnly,
  addDays,
  utcStamp,
  VTIMEZONE,
} from "@/lib/ics";

/**
 * Bygger den personlige "Sync med din kalender"-feed en freelancer selv kan
 * abonnere på fra "Mere"-siden i freelancer-appen (components/freelancer
 * MenuRow "Sync med din kalender") — helt adskilt fra lib/ics.ts, som bygger
 * TENANT-adminens feed over ALLE virksomhedens events. Denne feed viser kun
 * events hvor freelanceren selv har en aktiv vagt, hos ÉN virksomhed ad
 * gangen (samme virksomhed som freelancer_profiles-rækken token'et hører
 * til — se freelancer_profiles.calendar_feed_token).
 *
 * Én VEVENT pr. event (ikke pr. vagt) — DTSTART/DTEND spænder fra
 * freelancerens EGEN(E) vagt(er) ved eventet, IKKE fra hele eventets
 * samlede vagtspænd (i modsætning til tenant-feedet) — det er trods alt
 * freelancerens EGEN kalender, så den skal vise hvornår DE selv arbejder.
 */

export type FreelancerIcsShiftRow = {
  category: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  /** Navnet på den freelancer vagten er tildelt, eller null hvis den (endnu) er ledig. */
  freelancerName: string | null;
};

export type FreelancerIcsEventInput = {
  id: string;
  title: string;
  eventDateIso: string; // "2026-07-11"
  companyName: string;
  venueAddress: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  briefing: string | null;
  attachmentUrls: string[];
  /** Freelancerens EGNE vagt(er) ved dette event — normalt præcis én. */
  myShifts: FreelancerIcsShiftRow[];
  /** Alle ANDRE (ikke-annullerede) vagter ved samme event. */
  colleagueShifts: FreelancerIcsShiftRow[];
  updatedAtIso: string; // til DTSTAMP/LAST-MODIFIED
};

function shiftEndDateIso(eventDateIso: string, shift: FreelancerIcsShiftRow): string {
  return shift.endTime <= shift.startTime ? addDays(eventDateIso, 1) : eventDateIso;
}

function shiftLine(s: FreelancerIcsShiftRow): string {
  return `${s.category}, ${s.startTime}–${s.endTime}`;
}

function buildDescription(event: FreelancerIcsEventInput): string {
  const lines: string[] = [];

  lines.push("EVENT:");
  lines.push(`${event.title} - ${formatDateDisplay(event.eventDateIso)}`);
  lines.push("");

  lines.push("MIN VAGT:");
  event.myShifts.forEach((s) => lines.push(shiftLine(s)));
  lines.push("");

  lines.push("KOLLEGAER PÅ ARBEJDE TIL SAMME EVENT:");
  if (event.colleagueShifts.length === 0) {
    lines.push("(Ingen andre vagter oprettet)");
  } else {
    event.colleagueShifts.forEach((s) => {
      lines.push(`${shiftLine(s)} : ${s.freelancerName ?? "Ledig vagt"}`);
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

  return lines.join("\n");
}

function buildVEvent(event: FreelancerIcsEventInput): string {
  const summary = `Vagt for ${event.companyName}: ${event.title}`;
  const description = buildDescription(event);
  const dtstamp = utcStamp(event.updatedAtIso || new Date().toISOString());

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:freelancer-event-${event.id}@pepo.team`,
    `DTSTAMP:${dtstamp}`,
    `LAST-MODIFIED:${dtstamp}`,
  ];

  // Spænder over freelancerens EGNE vagter ved eventet (normalt kun én) —
  // samme mønster som tenant-feedets earliest/latest-udregning, men afgrænset
  // til myShifts i stedet for samtlige vagter ved eventet.
  const earliestStart = event.myShifts.reduce(
    (min, s) => (s.startTime < min ? s.startTime : min),
    event.myShifts[0].startTime
  );
  let latestEndDate = event.eventDateIso;
  let latestEndTime = "00:00";
  for (const s of event.myShifts) {
    const endDate = shiftEndDateIso(event.eventDateIso, s);
    if (endDate > latestEndDate || (endDate === latestEndDate && s.endTime > latestEndTime)) {
      latestEndDate = endDate;
      latestEndTime = s.endTime;
    }
  }
  lines.push(`DTSTART;TZID=Europe/Copenhagen:${icsDateTimeLocal(event.eventDateIso, earliestStart)}`);
  lines.push(`DTEND;TZID=Europe/Copenhagen:${icsDateTimeLocal(latestEndDate, latestEndTime)}`);

  lines.push(icsLine("SUMMARY", icsEscape(summary)));
  if (event.venueAddress) lines.push(icsLine("LOCATION", icsEscape(event.venueAddress)));
  lines.push(icsLine("DESCRIPTION", icsEscape(description)));
  lines.push("END:VEVENT");

  return lines.join("\r\n");
}

export function buildFreelancerCalendarFeed(companyName: string, events: FreelancerIcsEventInput[]): string {
  const calName = `${companyName} - Mine vagter`;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pepo//Personaleportalen//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${icsEscape(calName)}`),
    VTIMEZONE,
    ...events.map(buildVEvent),
    "END:VCALENDAR",
  ].join("\r\n");
  return body + "\r\n";
}

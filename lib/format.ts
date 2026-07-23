/**
 * Fjerner alle mellemrum fra et telefonnummer, så det altid gemmes i samme
 * format i databasen — ellers ved man ikke om man skal søge med eller uden
 * mellemrum for at finde en freelancer/kunde ud fra deres telefonnummer.
 *
 * Bruges alle steder telefonnumre gemmes (registrering, adminsystemets
 * kunde- og freelancer-formularer).
 */
export function normalizePhone(value: string): string {
  return value.replace(/\s+/g, "");
}

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** "2026-07-09" → "Torsdag, 9. juli, 2026" — brugt i event-wizardens datofelt. */
export function formatEventDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const weekday = WEEKDAYS[d.getDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d.getDate()}. ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/**
 * Fortolker fritekst-klokkeslæt til 24-timers "HH:MM", ligesom prototypens
 * formatTimeInput(): "23"→23:00, "9"→09:00, "2315"/"930"→23:15/09:30 (uden
 * kolon, sidste to cifre er minutter), og "9:5"/"23:30" (med kolon).
 * Returnerer null hvis input slet ikke kan tolkes som et klokkeslæt.
 */
export function parseTimeInput(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return "";
  let h: number;
  let m: number;
  if (cleaned.includes(":")) {
    const [hh, mm] = cleaned.split(":");
    h = parseInt(hh, 10);
    m = parseInt(mm, 10);
    if (Number.isNaN(m)) m = 0;
  } else {
    const digits = cleaned.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length <= 2) {
      h = parseInt(digits, 10);
      m = 0;
    } else if (digits.length === 3) {
      h = parseInt(digits.slice(0, 1), 10);
      m = parseInt(digits.slice(1), 10);
    } else {
      h = parseInt(digits.slice(0, 2), 10);
      m = parseInt(digits.slice(2, 4), 10);
    }
  }
  if (Number.isNaN(h)) return null;
  h = Math.max(0, Math.min(23, h));
  m = Math.max(0, Math.min(59, m));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "2026-07-09" → "torsdag, 9. juli" — brugt som dag-overskrift i vagtlisten. */
export function formatDayHeading(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${start}–${end}`;
}

/** "2026-07-09" → "9. juli 2026" — samme som formatEventDate, men uden ugedag. */
export function formatDateDisplay(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Antal timer mellem to "HH:MM"-klokkeslæt. Håndterer vagter der krydser
 * midnat (fx 22:00–02:00) ved at lægge et døgn til, hvis sluttid ikke er
 * senere end starttid.
 */
export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

/** Dags dato som "YYYY-MM-DD", til sammenligning med shift_date/event_date. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lægger N dage til en "YYYY-MM-DD"-dato — bruges bl.a. til at udregne
 * "de næste 7 dage"-vinduet på /shifts/ubesatte (se
 * lib/shifts-data.ts's filterEventsWithUnfilledShiftsWithinDays), så
 * grænsen regnes ens i JS her og i SQL-funktionen bag selve push-tallet
 * (get_companies_with_unfilled_shifts_next_7_days).
 */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "I dag"/"I morgen"/"I overmorgen"/"Om N dage" for fremtidige datoer,
 * "I går"/"I forgårs"/"For N dage siden" for fortidige — matcher
 * prototypens relativeDateLabel() i Pepo – Admin dashboard.html.
 */
export function relativeDateLabel(isoDate: string, today: string = todayIso()): string {
  const diffDays = Math.round(
    (new Date(isoDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000
  );
  if (diffDays === 0) return "I dag";
  if (diffDays === 1) return "I morgen";
  if (diffDays === 2) return "I overmorgen";
  if (diffDays > 2) return `Om ${diffDays} dage`;
  if (diffDays === -1) return "I går";
  if (diffDays === -2) return "I forgårs";
  return `For ${Math.abs(diffDays)} dage siden`;
}

/**
 * Kernen af "Sidst aktiv [...]"-teksten (uden "Sidst aktiv "-forstavelse og
 * afsluttende punktum) til freelancerprofiler i tenant-admin, ud fra
 * freelancer_profiles.last_active_at (kun kalenderdag-præcision, opdateres
 * højst én gang i døgnet — se touchProfileActivity i lib/freelancer.ts).
 * Egen bucket-inddeling (uger/måneder), bevidst forskellig fra
 * relativeDateLabel() ovenfor, som kun dækker dage og også fremtid — denne
 * dækker kun fortid, og de præcise dag-grænser her er defineret af Hjorth.
 * Måneder/år regnes med 30/365-dages tilnærmelse, ikke kalendermåneder —
 * præcist nok til en grov aktivitetsindikator.
 *
 * Returnerer null hvis freelanceren aldrig har været aktiv — kaldere bruger
 * det til at afgøre om der skal vises en aktivitetsdato eller i stedet en
 * "Send invitation"-knap (se FreelancerBoard.tsx).
 */
export function lastActivePhrase(lastActiveDate: string | null, today: string = todayIso()): string | null {
  if (!lastActiveDate) return null;

  const diffDays = Math.round(
    (new Date(today + "T00:00:00").getTime() - new Date(lastActiveDate + "T00:00:00").getTime()) / 86400000
  );

  if (diffDays <= 0) return "i dag";
  if (diffDays === 1) return "i går";
  if (diffDays === 2) return "i forgårs";
  if (diffDays <= 6) return `for ${diffDays} dage siden`;
  if (diffDays <= 13) return "for en uge siden";
  if (diffDays <= 20) return "for to uger siden";
  if (diffDays <= 27) return "for tre uger siden";
  if (diffDays <= 59) return "for en måned siden";
  if (diffDays <= 89) return "for to måneder siden";
  if (diffDays <= 119) return "for tre måneder siden";
  if (diffDays <= 179) return "for mere end tre måneder siden";
  if (diffDays <= 364) return "for mere end seks måneder siden";
  return "for mere end et år siden";
}

/** Fuld sætning til profilpanelet — se lastActivePhrase() ovenfor. */
export function lastActiveLabel(lastActiveDate: string | null, today: string = todayIso()): string {
  const phrase = lastActivePhrase(lastActiveDate, today);
  return phrase ? `Sidst aktiv ${phrase}.` : "Har endnu ikke brugt appen.";
}

/**
 * Matcher prototypens venueLabel(): navn hvis sat, ellers adressen, ellers
 * en tydelig placeholder — aldrig en tom streng i UI'en.
 */
export function venueLabel(
  venue: { name: string | null; address: string | null; postalCode: string | null; city: string | null } | null
): string {
  if (!venue) return "";
  const addressLine = [venue.address, [venue.postalCode, venue.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return venue.name || addressLine || "Unavngivet arbejdssted";
}

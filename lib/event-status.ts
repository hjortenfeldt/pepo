import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventRequestByToken, type EventRequestDetail } from "@/lib/event-requests";
import {
  getMessagesForEvent,
  insertEventMessage,
  type EventMessageItem,
  type NewMessageAttachment,
} from "@/lib/event-messages";

/**
 * Generaliseret klient-status-side (app/tenant/status/[token]) — dækker
 * BÅDE den oprindelige eventforespørgsel-flow (token = event_requests.
 * access_token, fuld pris-oversigt + accept/afvis-status) OG events oprettet
 * helt manuelt uden nogen forespørgsel (fx en telefonopringning, token =
 * events.correspondence_token, ingen pris-oversigt — kun eventets egne
 * oplysninger + korrespondance-tråden). Se
 * [[project_event_correspondence_and_system_log]] for hele baggrunden —
 * events.correspondence_token har en DB-default (gen_random_uuid()), så
 * ALLE events, uanset oprindelse, altid har ét at vise denne side for.
 *
 * Ruten hed oprindeligt /request/status/[token] (kun forespørgsler) — flyttet
 * hertil, da manuelt oprettede events ikke har nogen "forespørgsel" at vise.
 * Det gamle /request/status/[token]-link redirecter til denne rute, så
 * allerede udsendte/bogmærkede links fortsætter med at virke.
 */

export type EventStatusJobLine = { id: string; categoryName: string; startTime: string; endTime: string };

export type EventOnlyStatus = {
  id: string;
  title: string;
  eventDate: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venuePostalCode: string | null;
  venueCity: string | null;
  jobLines: EventStatusJobLine[];
  messages: EventMessageItem[];
};

export type EventStatusResult = { kind: "request"; request: EventRequestDetail } | { kind: "event"; event: EventOnlyStatus };

type RawVenueRef = { name: string | null; address: string | null; postal_code: string | null; city: string | null };
type RawWorkCategoryRef = { name: string };
type RawShiftRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export async function getEventStatusByToken(companyId: string, token: string): Promise<EventStatusResult | null> {
  // Forespørgsler først — dækker både endnu-ubesvarede og allerede
  // accepterede forespørgsler (samme token virker i begge tilfælde, se
  // acceptEventRequest's overførsel af access_token til correspondence_token).
  const request = await getEventRequestByToken(companyId, token);
  if (request) return { kind: "request", request };

  const supabase = createAdminClient();
  const { data: eventRow, error } = await supabase
    .from("events")
    .select(
      `id, title, event_date, description,
       client_venues(name, address, postal_code, city),
       shifts(id, start_time, end_time, status, work_categories(name))`
    )
    .eq("correspondence_token", token)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("getEventStatusByToken fejlede", error);
    return null;
  }
  if (!eventRow) return null;

  const venue = one(eventRow.client_venues as RawVenueRef | RawVenueRef[] | null);
  const shifts = (eventRow.shifts ?? []) as RawShiftRow[];
  const jobLines: EventStatusJobLine[] = shifts
    .filter((s) => s.status !== "cancelled")
    .map((s) => {
      const cat = one(s.work_categories);
      return {
        id: s.id,
        categoryName: cat?.name ?? "",
        startTime: hhmm(s.start_time),
        endTime: hhmm(s.end_time),
      };
    });

  const messages = await getMessagesForEvent(companyId, eventRow.id as string);

  return {
    kind: "event",
    event: {
      id: eventRow.id as string,
      title: eventRow.title as string,
      eventDate: eventRow.event_date as string,
      description: eventRow.description as string | null,
      venueName: venue?.name ?? null,
      venueAddress: venue?.address ?? null,
      venuePostalCode: venue?.postal_code ?? null,
      venueCity: venue?.city ?? null,
      jobLines,
      messages,
    },
  };
}

/**
 * Klientens svar i dialogen for et event UDEN nogen forespørgsel (samme rolle
 * som addClientMessageByToken i lib/event-requests.ts, blot fundet via
 * events.correspondence_token i stedet for event_requests.access_token).
 */
export async function addClientMessageByEventToken(
  companyId: string,
  token: string,
  body: string,
  attachments?: NewMessageAttachment[]
) {
  const trimmed = body.trim();
  if (!trimmed && (!attachments || attachments.length === 0)) {
    return { success: false as const, error: "Skriv en besked først." };
  }

  const supabase = createAdminClient();
  const { data: eventRow, error } = await supabase
    .from("events")
    .select("id")
    .eq("correspondence_token", token)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !eventRow) {
    console.error("addClientMessageByEventToken: kunne ikke finde eventet", error);
    return { success: false as const, error: "Kunne ikke finde eventet." };
  }

  const insertResult = await insertEventMessage({
    companyId,
    eventId: eventRow.id as string,
    sender: "client",
    body: trimmed,
    attachments,
  });

  if (!insertResult.success) {
    return { success: false as const, error: insertResult.error };
  }

  return { success: true as const };
}


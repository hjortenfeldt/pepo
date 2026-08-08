"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain, buildTenantUrl } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { EventAttachment, ShiftStatus, VenueItem } from "@/lib/admin-types";
import { geocodeAddress, getDrivingDistanceKm } from "@/lib/maps";
import { formatDateDisplay, venueLabel } from "@/lib/format";
import {
  logEventSystemMessage,
  getCurrentAdminName,
  insertEventMessage,
  uploadMessageAttachment,
  type NewMessageAttachment,
} from "@/lib/event-messages";
import {
  pushShiftAssigned,
  pushShiftReleased,
  pushShiftCancelled,
  pushShiftChanged,
  queueOpenShiftNotifications,
} from "@/lib/shift-notifications";
import { sendEmail } from "@/lib/resend";
import { buildSimpleAuthEmailHtml, buildSimpleAuthEmailText, firstNameOf } from "@/lib/email-templates";

/**
 * Kronologisk ændringslog i eventets "Korrespondance"-tråd (sender "system",
 * centreret neutral pille i UI'en, ALDRIG vist for klienten) — indsat af
 * handlingerne nedenfor EFTER selve ændringen er gemt. Se
 * [[project_event_correspondence_and_system_log]] og Hjorths uddybning
 * 2026-08-06 ("who has created the shifts etc."). Fejler aldrig hårdt for
 * selve handlingen (samme filosofi som push-koden) — logEventSystemMessage
 * sluger selv sine fejl.
 */
async function logShiftChange(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  companyId: string,
  eventId: string,
  body: string
) {
  const adminName = await getCurrentAdminName(supabase);
  await logEventSystemMessage(companyId, eventId, adminName, body);
}

/** Jobfunktionens navn til brug i logbeskeder — én lille opslag, ikke hele CategoryOption-formen. */
async function getCategoryName(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  categoryId: string
): Promise<string> {
  const { data } = await supabase.from("work_categories").select("name").eq("id", categoryId).maybeSingle();
  return (data?.name as string | undefined) ?? "ukendt jobfunktion";
}

/** Samler jobfunktion + klokkeslæt til én læsevenlig streng, fx "Tjener, kl. 18:00–23:00". */
function shiftLabel(categoryName: string, startTime: string, endTime: string): string {
  return `${categoryName}, kl. ${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

/** Tildelt freelancers fulde navn (for DENNE virksomhed) til brug i logbeskeder. */
async function getFreelancerName(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  companyId: string,
  authUserId: string
): Promise<string> {
  const { data } = await supabase
    .from("freelancer_profiles")
    .select("full_name")
    .eq("company_id", companyId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return (data?.full_name as string | undefined) ?? "en freelancer";
}

/** Vagtens jobfunktion + klokkeslæt (+ event_id), til logbeskeder hvor kalderen ikke allerede har hentet dem. */
async function fetchShiftLogInfo(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  shiftId: string,
  companyId: string
): Promise<{ eventId: string; label: string } | null> {
  const { data } = await supabase
    .from("shifts")
    .select("event_id, start_time, end_time, work_categories(name)")
    .eq("id", shiftId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data || !data.event_id) return null;
  const cat = data.work_categories as { name: string } | { name: string }[] | null;
  const categoryName = (Array.isArray(cat) ? cat[0]?.name : cat?.name) ?? "ukendt jobfunktion";
  return {
    eventId: data.event_id as string,
    label: shiftLabel(categoryName, data.start_time as string, data.end_time as string),
  };
}

/**
 * Admins svar direkte i ET events "Korrespondance"-tråd (ikke via en
 * eventforespørgsel — dækker BÅDE accepterede forespørgsler, som allerede
 * har event_id sat, OG events oprettet helt manuelt uden nogen forespørgsel
 * overhovedet, se [[project_event_correspondence_and_system_log]]).
 */
export async function replyToEventAsAdmin(eventId: string, body: string, attachments?: NewMessageAttachment[]) {
  const trimmed = body.trim();
  if (!trimmed && (!attachments || attachments.length === 0)) {
    return { success: false as const, error: "Skriv en besked først." };
  }

  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const adminName = await getCurrentAdminName(supabase);

  const insertResult = await insertEventMessage({
    companyId: company.id,
    eventId,
    sender: "admin",
    senderName: adminName,
    body: trimmed,
    attachments,
  });

  if (!insertResult.success) {
    return { success: false as const, error: insertResult.error };
  }

  // Giver klienten besked om admins svar via email — samme begrundelse som
  // replyAsAdmin i event-requests/actions.ts (den forespørgsel-specifikke
  // udgave af nøjagtig samme "Korrespondance"-tråd). Fejler aldrig selve
  // svaret, hvis mailen af nogen grund ikke kan sendes.
  try {
    const { data: eventRow } = await supabase
      .from("events")
      .select("title, correspondence_token, clients(contact_email, name, contact_person)")
      .eq("id", eventId)
      .eq("company_id", company.id)
      .maybeSingle();

    const clientRaw = eventRow?.clients as
      | { contact_email: string | null; name: string | null; contact_person: string | null }
      | { contact_email: string | null; name: string | null; contact_person: string | null }[]
      | null;
    const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw;

    if (eventRow && client?.contact_email) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("contact_email")
        .eq("id", company.id)
        .maybeSingle();
      const statusUrl = buildTenantUrl(company.slug, `/status/${eventRow.correspondence_token}`);
      const subject = `Ny besked fra ${company.name}`;
      // Se samme begrundelse i event-requests/actions.ts's replyAsAdmin.
      const greeting = `${firstNameOf(adminName)} fra ${company.name}:`;
      const cta = { label: "Besvar / Se hele korrespondancen", url: statusUrl };
      await sendEmail({
        to: client.contact_email,
        subject,
        html: buildSimpleAuthEmailHtml({ greeting, message: trimmed, cta, companyName: company.name }),
        text: buildSimpleAuthEmailText({ greeting, message: trimmed, cta }),
        fromName: company.name,
        replyTo: companyRow?.contact_email || undefined,
      });
    }
  } catch (err) {
    console.error("replyToEventAsAdmin: besked-notifikation kunne ikke sendes", err);
  }

  revalidatePath(`/shifts/event/${eventId}`);
  return { success: true as const };
}

/** Uploader én vedhæftning til admins svar i eventets egen korrespondance-tråd — se uploadMessageAttachment. */
export async function uploadEventMessageAttachmentForEvent(eventId: string, file: File) {
  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  return uploadMessageAttachment(company.id, eventId, file);
}

/**
 * Geokoder en venue-adresse og beregner køreafstanden fra virksomhedens
 * koordinater, hvis begge dele kendes. Bruges af createVenue/updateVenue,
 * som — i modsætning til syncVenues() i clients/actions.ts — gemmer venues
 * enkeltvis. Fejler aldrig hårdt: manglende koordinater giver bare `null`,
 * så transporttillægget står tomt til adressen er komplet.
 */
async function geocodeVenueFields(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  companyId: string,
  address: string | null,
  postalCode: string | null,
  city: string | null
) {
  if (!address) {
    return { latitude: null, longitude: null, distance_from_company_km: null, distance_calculated_at: null };
  }

  const location = await geocodeAddress(address, postalCode, city);
  if (!location) {
    return { latitude: null, longitude: null, distance_from_company_km: null, distance_calculated_at: null };
  }

  const { data: companyRow } = await supabase
    .from("companies")
    .select("latitude, longitude")
    .eq("id", companyId)
    .maybeSingle();

  const distanceKm =
    companyRow?.latitude != null && companyRow?.longitude != null
      ? await getDrivingDistanceKm({ lat: companyRow.latitude, lng: companyRow.longitude }, location)
      : null;

  return {
    latitude: location.lat,
    longitude: location.lng,
    distance_from_company_km: distanceKm,
    distance_calculated_at: new Date().toISOString(),
  };
}

// VIGTIGT: RLS alene skelner ikke mellem "min egen virksomhed" og "den
// virksomhed en superadmin besøger i support-tilstand" (se
// dashboard-page.tsx for uddybning) — company.id fra subdomænet sættes
// derfor eksplicit på alle indsættelser/opdateringer herunder, i stedet
// for at stole på databasetriggerens fallback til admins egen virksomhed.
async function requireCompany() {
  const company = await getCompanyBySubdomain();
  if (!company) return null;
  return company;
}

export type EventFormInput = {
  title: string;
  eventDate: string; // ISO-dato
  description: string;
  // Forventet antal gæster — helt valgfrit "cirka"-tal, fri tekst (se
  // FormState.expectedGuests i EventRequestForm.tsx for samme mønster).
  // Bevidst IKKE denormaliseret ud på shifts (kun eventet selv) — kun
  // relevant for admins planlægning, ikke noget freelancere skal se.
  expectedGuests: string;
  clientId: string;
  venueId: string | null;
};

export type ShiftRowInput = {
  id: string | null; // eksisterende vagt-id ved redigering, ellers null
  categoryId: string;
  startTime: string;
  endTime: string;
};

// Bruges kun ved OPRETTELSE af nye vagter (ShiftWizardPanel.tsx's
// "Tildel vagt"-dropdown pr. række) — ikke af updateShift, som redigerer en
// allerede eksisterende vagt og håndterer tildeling separat (assignFreelancer/
// releaseShift, kaldt direkte fra ShiftDetailPanel.tsx). Sat til null hvis
// admin lod rækken stå på "Ledig vagt" — vagten oprettes da almindeligt åben,
// som hidtil.
export type ShiftCreateRowInput = ShiftRowInput & {
  freelancerId: string | null;
};

export type VenueFormInput = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
};

function validateEvent(input: EventFormInput) {
  if (!input.title.trim()) return "Titel/anledning mangler.";
  if (!input.eventDate) return "Dato mangler.";
  if (!input.clientId) return "Vælg en kunde.";
  return null;
}

function validateRows(rows: ShiftRowInput[]) {
  if (rows.length === 0) return "Tilføj mindst én vagt.";
  for (const r of rows) {
    if (!r.categoryId) return "Vælg jobfunktion for alle vagter.";
    if (!r.startTime || !r.endTime) return "Udfyld start- og sluttid for alle vagter.";
  }
  return null;
}

// Event-felterne (kunde, arbejdssted, titel, dato, beskrivelse) gemmes
// denormaliseret på hver vagt-række, så en enkelt vagt kan læses uden
// join — samme mønster som freelancer_profiles.email er en kopi af
// auth.users. Denne funktion holder duplikeringen samlet ét sted.
function eventFieldsForShift(input: EventFormInput) {
  return {
    title: input.title.trim(),
    description: input.description.trim() || null,
    shift_date: input.eventDate,
    client_id: input.clientId,
    venue_id: input.venueId,
  };
}

export async function createEventWithShifts(
  input: EventFormInput,
  rows: ShiftCreateRowInput[],
  // Sat af acceptEventRequest() (event-requests/actions.ts), som selv
  // indsætter sin egen, mere specifikke "accepterede forespørgslen og
  // oprettede eventet"-logbesked — undgår at TO system-beskeder ville
  // dukke op i tråden for præcis samme øjeblik.
  options?: { skipCreationLog?: boolean }
) {
  const validationError = validateEvent(input) || validateRows(rows);
  if (validationError) return { success: false as const, error: validationError };

  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      company_id: company.id,
      title: input.title.trim(),
      event_date: input.eventDate,
      description: input.description.trim() || null,
      expected_guests: input.expectedGuests.trim() || null,
      client_id: input.clientId,
      venue_id: input.venueId,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    console.error("createEventWithShifts: kunne ikke oprette event", eventError);
    return { success: false as const, error: "Kunne ikke oprette event. Prøv igen." };
  }

  const shiftFields = eventFieldsForShift(input);
  const { data: insertedShifts, error: shiftsError } = await supabase
    .from("shifts")
    .insert(
      rows.map((r) => ({
        company_id: company.id,
        event_id: event.id,
        category_id: r.categoryId,
        start_time: r.startTime,
        end_time: r.endTime,
        status: (r.freelancerId ? "assigned" : "open") as ShiftStatus,
        assigned_freelancer_id: r.freelancerId,
        ...shiftFields,
      }))
    )
    .select("id, category_id");

  if (shiftsError) {
    console.error("createEventWithShifts: kunne ikke oprette vagter", shiftsError);
    // Eventet er allerede oprettet — ryd op, så vi ikke efterlader et event uden vagter.
    await supabase.from("events").delete().eq("id", event.id);
    return { success: false as const, error: "Kunne ikke oprette vagterne. Prøv igen." };
  }

  // #5 Ny(e) ledig(e) vagt(er) for rækker uden en valgt freelancer — se
  // queueOpenShiftNotifications for hvorfor dette ikke sender en push
  // direkte (grupperes af cron-jobbet). Rækker, hvor admin allerede valgte
  // en freelancer i "Tildel vagt"-dropdownet, får i stedet en almindelig
  // #1 "Vagt tildelt"-push til netop DEN freelancer — de skal ikke ALSO
  // ind i køen af "ny ledig vagt"-notifikationer, da vagten aldrig var ledig.
  // Antager at insertedShifts kommer tilbage i samme rækkefølge som rows
  // blev indsat i (én multi-row INSERT...RETURNING, ingen ORDER BY) — samme
  // antagelse koden allerede gjorde her før dette.
  await Promise.all(
    (insertedShifts ?? []).map((s, i) => {
      const freelancerId = rows[i]?.freelancerId;
      return freelancerId
        ? pushShiftAssigned(s.id as string, freelancerId)
        : queueOpenShiftNotifications(company.id, s.category_id as string, s.id as string);
    })
  );

  if (!options?.skipCreationLog) {
    const categoryNames = await Promise.all(rows.map((r) => getCategoryName(supabase, r.categoryId)));
    await logShiftChange(
      supabase,
      company.id,
      event.id as string,
      `oprettede eventet med ${rows.length} ${rows.length === 1 ? "vagt" : "vagter"} (${categoryNames.join(", ")}).`
    );
  }

  revalidatePath("/shifts");
  return { success: true as const, eventId: event.id as string };
}

// Opretter et event uden vagter — matcher prototypens "Gem event uden
// vagter"-knap i trin 1 af guiden (fx til events der endnu ikke skal
// bemandes, eller hvor vagterne tilføjes senere via "Tilføj vagt til event").
export async function createEventOnly(input: EventFormInput) {
  const validationError = validateEvent(input);
  if (validationError) return { success: false as const, error: validationError };

  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      company_id: company.id,
      title: input.title.trim(),
      event_date: input.eventDate,
      description: input.description.trim() || null,
      expected_guests: input.expectedGuests.trim() || null,
      client_id: input.clientId,
      venue_id: input.venueId,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    console.error("createEventOnly: kunne ikke oprette event", eventError);
    return { success: false as const, error: "Kunne ikke oprette event. Prøv igen." };
  }

  await logShiftChange(supabase, company.id, event.id as string, "oprettede eventet (uden vagter).");

  revalidatePath("/shifts");
  return { success: true as const, eventId: event.id as string };
}

export async function updateEvent(eventId: string, input: EventFormInput) {
  const validationError = validateEvent(input);
  if (validationError) return { success: false, error: validationError };

  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  // Hentet FØR opdateringen — bruges til at afgøre om dato/kunde/venue reelt
  // ændrede sig, så allerede tildelte freelancere kun får en #4-push ved
  // faktiske ændringer, ikke ved enhver gemning af eventet (title/description
  // hentes med til den kronologiske ændringslog nedenfor, som IKKE skal
  // begrænses til kun de tre push-relevante felter).
  const { data: beforeEvent } = await supabase
    .from("events")
    .select("title, event_date, description, expected_guests, client_id, venue_id")
    .eq("id", eventId)
    .eq("company_id", company.id)
    .maybeSingle();

  const { error: eventError } = await supabase
    .from("events")
    .update({
      title: input.title.trim(),
      event_date: input.eventDate,
      description: input.description.trim() || null,
      expected_guests: input.expectedGuests.trim() || null,
      client_id: input.clientId,
      venue_id: input.venueId,
    })
    .eq("id", eventId)
    .eq("company_id", company.id);

  if (eventError) {
    console.error("updateEvent fejlede", eventError);
    return { success: false, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  // Propagér til alle vagter i gruppen, så de forbliver i sync med eventet.
  const { error: shiftsError } = await supabase
    .from("shifts")
    .update(eventFieldsForShift(input))
    .eq("event_id", eventId)
    .eq("company_id", company.id);

  if (shiftsError) {
    console.error("updateEvent: kunne ikke opdatere vagterne", shiftsError);
    return { success: false, error: "Event blev gemt, men vagterne kunne ikke opdateres." };
  }

  const reallyChanged =
    !!beforeEvent &&
    (beforeEvent.event_date !== input.eventDate ||
      beforeEvent.client_id !== input.clientId ||
      beforeEvent.venue_id !== input.venueId);

  if (reallyChanged) {
    const { data: assignedShifts } = await supabase
      .from("shifts")
      .select("id, assigned_freelancer_id")
      .eq("event_id", eventId)
      .eq("company_id", company.id)
      .not("assigned_freelancer_id", "is", null);

    await Promise.all(
      (assignedShifts ?? []).map((s) => pushShiftChanged(s.id as string, s.assigned_freelancer_id as string))
    );
  }

  // Kronologisk ændringslog — bygger én samlet sætning af de felter der
  // FAKTISK ændrede sig (title/description tælles med her, i modsætning til
  // reallyChanged ovenfor, som kun styrer push-varslingen til freelancere).
  if (beforeEvent) {
    const changes: string[] = [];
    if (beforeEvent.title !== input.title.trim()) {
      changes.push(`titlen til "${input.title.trim()}"`);
    }
    if (beforeEvent.event_date !== input.eventDate) {
      changes.push(`datoen til ${formatDateDisplay(input.eventDate)}`);
    }
    if (beforeEvent.client_id !== input.clientId) {
      const { data: newClient } = await supabase
        .from("clients")
        .select("name, contact_person")
        .eq("id", input.clientId)
        .maybeSingle();
      changes.push(`kunden til ${newClient?.name || newClient?.contact_person || "(uden navn)"}`);
    }
    if (beforeEvent.venue_id !== input.venueId) {
      if (input.venueId) {
        const { data: newVenue } = await supabase
          .from("client_venues")
          .select("name, address, postal_code, city")
          .eq("id", input.venueId)
          .maybeSingle();
        changes.push(
          `eventstedet til ${
            newVenue
              ? venueLabel({
                  name: newVenue.name,
                  address: newVenue.address,
                  postalCode: newVenue.postal_code,
                  city: newVenue.city,
                }).replace("\n", ", ")
              : "et andet sted"
          }`
        );
      } else {
        changes.push("eventstedet (fjernet)");
      }
    }
    if ((beforeEvent.description ?? "") !== input.description.trim()) {
      changes.push("briefingen");
    }
    if ((beforeEvent.expected_guests ?? "") !== input.expectedGuests.trim()) {
      changes.push("forventet antal gæster");
    }

    if (changes.length > 0) {
      await logShiftChange(supabase, company.id, eventId, `ændrede ${changes.join(", ")}.`);
    }
  }

  revalidatePath("/shifts");
  return { success: true };
}

export async function addShiftsToEvent(eventId: string, rows: ShiftCreateRowInput[]) {
  const validationError = validateRows(rows);
  if (validationError) return { success: false, error: validationError };

  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("title, event_date, description, client_id, venue_id")
    .eq("id", eventId)
    .eq("company_id", company.id)
    .single();

  if (eventError || !event) {
    console.error("addShiftsToEvent: kunne ikke finde eventet", eventError);
    return { success: false, error: "Kunne ikke finde eventet. Prøv igen." };
  }

  const { data: insertedShifts, error } = await supabase
    .from("shifts")
    .insert(
      rows.map((r) => ({
        company_id: company.id,
        event_id: eventId,
        category_id: r.categoryId,
        start_time: r.startTime,
        end_time: r.endTime,
        status: (r.freelancerId ? "assigned" : "open") as ShiftStatus,
        assigned_freelancer_id: r.freelancerId,
        title: event.title,
        description: event.description,
        shift_date: event.event_date,
        client_id: event.client_id,
        venue_id: event.venue_id,
      }))
    )
    .select("id, category_id");

  if (error) {
    console.error("addShiftsToEvent fejlede", error);
    return { success: false, error: "Kunne ikke tilføje vagterne. Prøv igen." };
  }

  // Se samme forklaring i createEventWithShifts ovenfor.
  await Promise.all(
    (insertedShifts ?? []).map((s, i) => {
      const freelancerId = rows[i]?.freelancerId;
      return freelancerId
        ? pushShiftAssigned(s.id as string, freelancerId)
        : queueOpenShiftNotifications(company.id, s.category_id as string, s.id as string);
    })
  );

  const addedCategoryNames = await Promise.all(rows.map((r) => getCategoryName(supabase, r.categoryId)));
  await logShiftChange(
    supabase,
    company.id,
    eventId,
    `tilføjede ${rows.length} ${rows.length === 1 ? "vagt" : "vagter"} (${addedCategoryNames.join(", ")}).`
  );

  revalidatePath("/shifts");
  return { success: true };
}

export async function updateShift(shiftId: string, row: ShiftRowInput) {
  const validationError = validateRows([row]);
  if (validationError) return { success: false, error: validationError };

  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  // Hentet FØR opdateringen, så vi kan afgøre om ændringen er "reel" nok til
  // at sende en #4-push (kun ved faktisk ændrede felter, ikke enhver gemning).
  const { data: before } = await supabase
    .from("shifts")
    .select("event_id, category_id, start_time, end_time, assigned_freelancer_id")
    .eq("id", shiftId)
    .eq("company_id", company.id)
    .maybeSingle();

  const { error } = await supabase
    .from("shifts")
    .update({ category_id: row.categoryId, start_time: row.startTime, end_time: row.endTime })
    .eq("id", shiftId)
    .eq("company_id", company.id);

  if (error) {
    console.error("updateShift fejlede", error);
    return { success: false, error: "Kunne ikke gemme vagten. Prøv igen." };
  }

  const reallyChanged =
    !!before &&
    (before.category_id !== row.categoryId ||
      (before.start_time as string).slice(0, 5) !== row.startTime ||
      (before.end_time as string).slice(0, 5) !== row.endTime);

  if (reallyChanged && before?.assigned_freelancer_id) {
    await pushShiftChanged(shiftId, before.assigned_freelancer_id);
  }

  if (reallyChanged && before?.event_id) {
    const categoryName = await getCategoryName(supabase, row.categoryId);
    await logShiftChange(
      supabase,
      company.id,
      before.event_id as string,
      `redigerede vagten til ${shiftLabel(categoryName, row.startTime, row.endTime)}.`
    );
  }

  revalidatePath("/shifts");
  return { success: true };
}

export type ShiftClockTimesInput = {
  // Eksisterende time_clock_entries-id, eller null hvis freelanceren aldrig
  // har stemplet ind/ud på vagten — så OPRETTES der en ny række i stedet
  // for at opdatere en eksisterende.
  clockEntryId: string | null;
  // Vagtens (eventuelt lige nu redigerede) dato — stempeltider har ingen
  // egen dato-vælger i UI'en (se ShiftDetailPanel.tsx), kun klokkeslæt, så
  // vi antager samme dato som selve vagten.
  shiftDate: string;
  clockInTime: string; // "HH:MM", eller "" for ingen værdi ("Mangler")
  clockOutTime: string; // "HH:MM", eller "" for ingen værdi
};

function combineDateAndTime(dateIso: string, hhmm: string): string | null {
  if (!hhmm) return null;
  return new Date(`${dateIso}T${hhmm}:00`).toISOString();
}

/**
 * Lader admin rette stemplet-ind/ud-tiderne manuelt i Vagtdetaljer — fx når
 * en freelancer har glemt at stemple ind/ud, eller stemplet forkert. Bruger
 * (ligesom resten af denne fil) sessions-klienten + eksplicit company_id-
 * scoping, ikke service role — se [[feedback_superadmin_scoping_required]]
 * og de nye admin-RLS-policies på time_clock_entries (tilføjet sammen med
 * denne funktion, tabellen havde før KUN en freelancer-selv-policy).
 */
export async function updateShiftClockTimes(shiftId: string, input: ShiftClockTimesInput) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const clockInAt = combineDateAndTime(input.shiftDate, input.clockInTime);
  const clockOutAt = combineDateAndTime(input.shiftDate, input.clockOutTime);

  if (input.clockEntryId) {
    const { error } = await supabase
      .from("time_clock_entries")
      .update({ clock_in_at: clockInAt, clock_out_at: clockOutAt })
      .eq("id", input.clockEntryId)
      .eq("company_id", company.id);

    if (error) {
      console.error("updateShiftClockTimes: opdatering fejlede", error);
      return { success: false, error: "Kunne ikke gemme stempeltiderne. Prøv igen." };
    }
  } else {
    // Ingen eksisterende stempling — freelanceren har aldrig stemplet ind på
    // denne vagt. Kræver en tildelt freelancer, da time_clock_entries.
    // freelancer_id er NOT NULL.
    const { data: shiftRow, error: shiftError } = await supabase
      .from("shifts")
      .select("assigned_freelancer_id")
      .eq("id", shiftId)
      .eq("company_id", company.id)
      .single();

    if (shiftError || !shiftRow) {
      console.error("updateShiftClockTimes: kunne ikke finde vagten", shiftError);
      return { success: false, error: "Kunne ikke finde vagten. Prøv igen." };
    }
    if (!shiftRow.assigned_freelancer_id) {
      return { success: false, error: "Vagten skal først tildeles en freelancer, før stempeltider kan udfyldes." };
    }

    const { error } = await supabase.from("time_clock_entries").insert({
      company_id: company.id,
      shift_id: shiftId,
      freelancer_id: shiftRow.assigned_freelancer_id,
      clock_in_at: clockInAt,
      clock_out_at: clockOutAt,
    });

    if (error) {
      console.error("updateShiftClockTimes: oprettelse fejlede", error);
      return { success: false, error: "Kunne ikke gemme stempeltiderne. Prøv igen." };
    }
  }

  revalidatePath("/shifts");
  return { success: true };
}

export async function assignFreelancer(shiftId: string, freelancerId: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const { error } = await supabase
    .from("shifts")
    .update({ assigned_freelancer_id: freelancerId, status: "assigned" as ShiftStatus })
    .eq("id", shiftId)
    .eq("company_id", company.id);

  if (error) {
    console.error("assignFreelancer fejlede", error);
    return { success: false, error: "Kunne ikke tildele vagten. Prøv igen." };
  }

  // Best-effort: markér en evt. tilkendegivelse fra denne freelancer som
  // accepteret. Fejler dette, blokerer det ikke selve tildelingen.
  await supabase
    .from("shift_interests")
    .update({ status: "accepted" })
    .eq("shift_id", shiftId)
    .eq("freelancer_id", freelancerId);

  // Genopretter en evt. ANDEN freelancers "accepted"-tilkendegivelse til
  // "pending" — dækker direkte OMTILDELING (vælge en ny freelancer i
  // dropdownet uden først at vælge "Ledig vagt"), hvor releaseShift()
  // aldrig kaldes. Uden dette blev den forrige tildeltes anmodning stående
  // som "accepted" for evigt, selvom de ikke længere er tildelt vagten —
  // det gav et forkert (for lavt) antal anmodninger og et manglende
  // "Anmodet"-mærkat for dem i FreelancerAssignDropdown, se
  // [[project_shift_detail_panel_deferred_save]].
  await supabase
    .from("shift_interests")
    .update({ status: "pending" })
    .eq("shift_id", shiftId)
    .neq("freelancer_id", freelancerId)
    .eq("status", "accepted");

  // #1 Vagt tildelt.
  await pushShiftAssigned(shiftId, freelancerId);

  const shiftInfo = await fetchShiftLogInfo(supabase, shiftId, company.id);
  if (shiftInfo) {
    const freelancerName = await getFreelancerName(supabase, company.id, freelancerId);
    await logShiftChange(supabase, company.id, shiftInfo.eventId, `tildelte vagten (${shiftInfo.label}) til ${freelancerName}.`);
  }

  revalidatePath("/shifts");
  return { success: true };
}

export async function releaseShift(shiftId: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  // Hentet FØR opdateringen rydder assigned_freelancer_id, så vi stadig ved
  // hvem der skal have #2-pushen bagefter.
  const { data: before } = await supabase
    .from("shifts")
    .select("assigned_freelancer_id, category_id")
    .eq("id", shiftId)
    .eq("company_id", company.id)
    .maybeSingle();

  const shiftInfoBeforeRelease = await fetchShiftLogInfo(supabase, shiftId, company.id);

  const { error } = await supabase
    .from("shifts")
    .update({ assigned_freelancer_id: null, status: "open" as ShiftStatus })
    .eq("id", shiftId)
    .eq("company_id", company.id);

  if (error) {
    console.error("releaseShift fejlede", error);
    return { success: false, error: "Kunne ikke frigive vagten. Prøv igen." };
  }

  // Genopretter en evt. "accepted" tilkendegivelse til "pending" igen.
  // assignFreelancer() ovenfor sætter denne freelancers shift_interests-
  // række til "accepted" ved tildeling — uden denne rettelse blev den
  // stående som "accepted" for evigt efter en frigivelse, hvilket fik
  // vagten til at forsvinde permanent fra "Vagtanmodninger"-fanen (se
  // hasPendingShiftRequest i lib/shift-request-utils.ts, som kun tæller
  // "pending"), selvom freelanceren jo stadig gerne vil have vagten.
  // Best-effort ligesom assignFreelancer's tilsvarende opdatering.
  if (before?.assigned_freelancer_id) {
    await supabase
      .from("shift_interests")
      .update({ status: "pending" })
      .eq("shift_id", shiftId)
      .eq("freelancer_id", before.assigned_freelancer_id)
      .eq("status", "accepted");
  }

  // #2 Vagt frigivet (til den tidligere tildelte), + #5 (kø til andre
  // matchende freelancere, da vagten nu igen er ledig).
  if (before?.assigned_freelancer_id) {
    await pushShiftReleased(shiftId, before.assigned_freelancer_id);
  }
  if (before?.category_id) {
    await queueOpenShiftNotifications(company.id, before.category_id, shiftId);
  }

  if (shiftInfoBeforeRelease && before?.assigned_freelancer_id) {
    const freelancerName = await getFreelancerName(supabase, company.id, before.assigned_freelancer_id);
    await logShiftChange(supabase, company.id, shiftInfoBeforeRelease.eventId, `frigav vagten (${shiftInfoBeforeRelease.label}) fra ${freelancerName}.`);
  }

  revalidatePath("/shifts");
  return { success: true };
}

export async function deleteShift(shiftId: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("shifts")
    .select("status, assigned_freelancer_id")
    .eq("id", shiftId)
    .eq("company_id", company.id)
    .single();

  if (fetchError || !current) {
    console.error("deleteShift: kunne ikke finde vagten", fetchError);
    return { success: false, error: "Kunne ikke slette vagten. Prøv igen." };
  }

  const shiftInfoBeforeDelete = await fetchShiftLogInfo(supabase, shiftId, company.id);

  const { error } = await supabase
    .from("shifts")
    .update({ status: "cancelled" as ShiftStatus, previous_status: current.status })
    .eq("id", shiftId)
    .eq("company_id", company.id);

  if (error) {
    console.error("deleteShift fejlede", error);
    return { success: false, error: "Kunne ikke slette vagten. Prøv igen." };
  }

  // #3 Vagt aflyst — kun hvis vagten rent faktisk var tildelt nogen.
  if (current.assigned_freelancer_id) {
    await pushShiftCancelled(shiftId, current.assigned_freelancer_id);
  }

  if (shiftInfoBeforeDelete) {
    await logShiftChange(supabase, company.id, shiftInfoBeforeDelete.eventId, `slettede vagten (${shiftInfoBeforeDelete.label}).`);
  }

  revalidatePath("/shifts");
  return { success: true };
}

export async function undeleteShift(shiftId: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("shifts")
    .select("previous_status, category_id")
    .eq("id", shiftId)
    .eq("company_id", company.id)
    .single();

  if (fetchError || !current) {
    console.error("undeleteShift: kunne ikke finde vagten", fetchError);
    return { success: false, error: "Kunne ikke fortryde sletningen. Prøv igen." };
  }

  const restoredStatus = (current.previous_status ?? "open") as ShiftStatus;

  const { error } = await supabase
    .from("shifts")
    .update({ status: restoredStatus, previous_status: null })
    .eq("id", shiftId)
    .eq("company_id", company.id);

  if (error) {
    console.error("undeleteShift fejlede", error);
    return { success: false, error: "Kunne ikke fortryde sletningen. Prøv igen." };
  }

  // #5 — hvis vagten igen bliver "open" (og ikke fx "assigned"), er den
  // relevant for den grupperede ny-ledig-vagt-notifikation igen.
  if (restoredStatus === "open") {
    await queueOpenShiftNotifications(company.id, current.category_id, shiftId);
  }

  const shiftInfoAfterUndelete = await fetchShiftLogInfo(supabase, shiftId, company.id);
  if (shiftInfoAfterUndelete) {
    await logShiftChange(supabase, company.id, shiftInfoAfterUndelete.eventId, `fortrød sletningen af vagten (${shiftInfoAfterUndelete.label}).`);
  }

  revalidatePath("/shifts");
  return { success: true };
}

export async function duplicateShift(shiftId: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const { data: original, error: fetchError } = await supabase
    .from("shifts")
    .select("event_id, category_id, shift_date, start_time, end_time, client_id, venue_id, title, description")
    .eq("id", shiftId)
    .eq("company_id", company.id)
    .single();

  if (fetchError || !original) {
    console.error("duplicateShift: kunne ikke finde vagten", fetchError);
    return { success: false, error: "Kunne ikke duplikere vagten. Prøv igen." };
  }

  const { data: inserted, error } = await supabase
    .from("shifts")
    .insert({
      ...original,
      company_id: company.id,
      status: "open" as ShiftStatus,
      assigned_freelancer_id: null,
      previous_status: null,
    })
    .select("id, category_id")
    .single();

  if (error || !inserted) {
    console.error("duplicateShift fejlede", error);
    return { success: false, error: "Kunne ikke duplikere vagten. Prøv igen." };
  }

  // #5 — den nye, duplikerede vagt er open og dermed relevant for den
  // grupperede ny-ledig-vagt-notifikation.
  await queueOpenShiftNotifications(company.id, inserted.category_id as string, inserted.id as string);

  if (original.event_id) {
    const categoryName = await getCategoryName(supabase, original.category_id as string);
    await logShiftChange(
      supabase,
      company.id,
      original.event_id as string,
      `duplikerede vagten (${shiftLabel(categoryName, original.start_time as string, original.end_time as string)}).`
    );
  }

  revalidatePath("/shifts");
  // `id` bruges af ShiftDetailPanel til at lilla-blinke den NYE vagt (ikke
  // den oprindelige, der ikke selv ændrede sig) og lukke panelet, samme
  // mønster som onSaved — se dens kald af duplicateShift.
  return { success: true, id: inserted.id as string };
}

export async function createVenue(clientId: string, input: VenueFormInput) {
  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const address = input.address.trim() || null;
  const postalCode = input.postalCode.trim() || null;
  const city = input.city.trim() || null;
  const geo = await geocodeVenueFields(supabase, company.id, address, postalCode, city);

  const { data, error } = await supabase
    .from("client_venues")
    .insert({
      company_id: company.id,
      client_id: clientId,
      name: input.name.trim() || null,
      address,
      postal_code: postalCode,
      city,
      ...geo,
    })
    .select("id, client_id, name, address, postal_code, city")
    .single();

  if (error || !data) {
    console.error("createVenue fejlede", error);
    return { success: false as const, error: "Kunne ikke oprette arbejdsstedet. Prøv igen." };
  }

  const venue: VenueItem = {
    id: data.id,
    clientId: data.client_id,
    name: data.name,
    address: data.address,
    postalCode: data.postal_code,
    city: data.city,
  };

  revalidatePath("/shifts");
  return { success: true as const, venue };
}

export async function updateVenue(venueId: string, input: VenueFormInput) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const address = input.address.trim() || null;
  const postalCode = input.postalCode.trim() || null;
  const city = input.city.trim() || null;

  const { data: existing } = await supabase
    .from("client_venues")
    .select("address, postal_code, city")
    .eq("id", venueId)
    .eq("company_id", company.id)
    .maybeSingle();

  const addressChanged =
    address !== (existing?.address ?? null) ||
    postalCode !== (existing?.postal_code ?? null) ||
    city !== (existing?.city ?? null);

  const geo = addressChanged ? await geocodeVenueFields(supabase, company.id, address, postalCode, city) : {};

  const { error } = await supabase
    .from("client_venues")
    .update({
      name: input.name.trim() || null,
      address,
      postal_code: postalCode,
      city,
      ...geo,
    })
    .eq("id", venueId)
    .eq("company_id", company.id);

  if (error) {
    console.error("updateVenue fejlede", error);
    return { success: false, error: "Kunne ikke gemme arbejdsstedet. Prøv igen." };
  }

  revalidatePath("/shifts");
  return { success: true };
}

export async function deleteVenue(venueId: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("client_venues")
    .delete()
    .eq("id", venueId)
    .eq("company_id", company.id);

  if (error) {
    console.error("deleteVenue fejlede", error);
    return { success: false, error: "Kunne ikke slette arbejdsstedet. Prøv igen." };
  }

  revalidatePath("/shifts");
  return { success: true };
}

// Supabase Storage-nøgler accepterer ikke alle tegn (bl.a. reagerer den
// dårligt på danske bogstaver som "æ") — macOS-skærmbilleder hedder typisk
// noget i stil med "Skærmbillede 2026-07-22 kl. 15.53.52.png", som derfor
// fejlede stille/højlydt afhængig af hvilket flow der uploadede (se
// [[feedback_attachment_filename_sanitization]]). Renser KUN selve
// storage-stien — det oprindelige filnavn gemmes stadig uændret i
// file_name-kolonnen, så visningen ("Vedhæftet fil: Skærmbillede...") ser
// helt normal ud for brugeren.
function sanitizeStorageFilename(name: string): string {
  const withoutDanishLetters = name
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // fjerner accenter fra andre bogstaver (é, ü, ñ osv.)

  const cleaned = withoutDanishLetters
    .replace(/[^a-zA-Z0-9._-]+/g, "_") // mellemrum, kolon, emoji osv. bliver til underscore
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");

  return cleaned || "fil";
}

export async function uploadAttachment(eventId: string, file: File) {
  if (!(file instanceof File) || file.size === 0) {
    return { success: false as const, error: "Ingen fil valgt." };
  }

  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const path = `${eventId}/${crypto.randomUUID()}-${sanitizeStorageFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("shift-attachments")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    console.error("uploadAttachment: upload fejlede", uploadError);
    return { success: false as const, error: "Kunne ikke uploade filen. Prøv igen." };
  }

  const { data: publicUrlData } = supabase.storage.from("shift-attachments").getPublicUrl(path);

  const { data, error } = await supabase
    .from("shift_attachments")
    .insert({
      company_id: company.id,
      event_id: eventId,
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      file_type: file.type || null,
    })
    .select("id, file_name, file_url, file_type")
    .single();

  if (error || !data) {
    console.error("uploadAttachment: kunne ikke gemme filreferencen", error);
    return { success: false as const, error: "Filen blev uploadet, men kunne ikke gemmes på eventet." };
  }

  const attachment: EventAttachment = {
    id: data.id,
    fileName: data.file_name,
    fileUrl: data.file_url,
    fileType: data.file_type,
  };

  revalidatePath("/shifts");
  return { success: true as const, attachment };
}

export async function removeAttachment(attachmentId: string, fileUrl: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();

  const path = fileUrl.split("/shift-attachments/")[1];
  if (path) {
    await supabase.storage.from("shift-attachments").remove([path]);
  }

  const { error } = await supabase
    .from("shift_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("company_id", company.id);

  if (error) {
    console.error("removeAttachment fejlede", error);
    return { success: false, error: "Kunne ikke fjerne vedhæftningen. Prøv igen." };
  }

  revalidatePath("/shifts");
  return { success: true };
}

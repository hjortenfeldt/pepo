"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain, buildTenantUrl } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { getEventRequestById, summarizeBookedStaff, type EventRequestDetail } from "@/lib/event-requests";
import { insertEventMessage, getCurrentAdminName, uploadMessageAttachment, type NewMessageAttachment } from "@/lib/event-messages";
import { createEventWithShifts, type EventFormInput, type ShiftCreateRowInput } from "@/app/tenant/(protected)/shifts/actions";
import { venueLabel, formatDateDisplay } from "@/lib/format";
import { sendEmail } from "@/lib/resend";
import {
  DEFAULT_BOOKING_APPROVED_SUBJECT,
  DEFAULT_BOOKING_APPROVED_BODY,
  renderEventEmailTokens,
  buildBookingApprovedEmailHtml,
  buildBookingApprovedEmailText,
  buildSimpleAuthEmailHtml,
  buildSimpleAuthEmailText,
  firstNameOf,
  type EventEmailTokenValues,
} from "@/lib/email-templates";

// Se shifts/actions.ts for hvorfor company.id skal sættes/filtreres
// eksplicit i stedet for at stole på RLS/databasetriggerens fallback.
async function requireCompany() {
  return getCompanyBySubdomain();
}

export type EventRequestListItem = {
  id: string;
  title: string;
  eventDate: string;
  status: EventRequestDetail["status"];
  customerType: "company" | "private";
  displayName: string;
  totalKr: number | null;
  unreadCount: number;
  createdAt: string;
};

/** "Eventforespørgsler"-sidens liste — nyeste først, med et uåbnet-tal pr. forespørgsel. */
export async function listEventRequests(): Promise<EventRequestListItem[]> {
  const company = await requireCompany();
  if (!company) return [];

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("event_requests")
    .select(
      `id, title, event_date, status, customer_type, client_name, client_contact_person, total_kr, created_at,
       event_messages(sender, read_by_admin)`
    )
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listEventRequests fejlede", error);
    return [];
  }

  return (data ?? []).map((r) => {
    const messages = (r.event_messages ?? []) as { sender: string; read_by_admin: boolean }[];
    const unreadCount = messages.filter((m) => m.sender === "client" && !m.read_by_admin).length;
    return {
      id: r.id as string,
      title: r.title as string,
      eventDate: r.event_date as string,
      status: r.status as EventRequestDetail["status"],
      customerType: r.customer_type as "company" | "private",
      displayName: (r.customer_type === "company" ? (r.client_name as string | null) : (r.client_contact_person as string | null)) || "(uden navn)",
      totalKr: r.total_kr != null ? Number(r.total_kr) : null,
      unreadCount,
      createdAt: r.created_at as string,
    };
  });
}

/** Detaljesiden — markerer samtidig alle klient-beskeder som læst af admin. */
export async function getEventRequestDetailForAdmin(id: string): Promise<EventRequestDetail | null> {
  const company = await requireCompany();
  if (!company) return null;

  const supabase = await createSupabaseClient();
  await supabase
    .from("event_messages")
    .update({ read_by_admin: true })
    .eq("event_request_id", id)
    .eq("company_id", company.id)
    .eq("sender", "client");

  return getEventRequestById(company.id, id);
}

export async function replyAsAdmin(requestId: string, body: string, attachments?: NewMessageAttachment[]) {
  const trimmed = body.trim();
  if (!trimmed && (!attachments || attachments.length === 0)) {
    return { success: false as const, error: "Skriv en besked først." };
  }

  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const adminName = await getCurrentAdminName(supabase);

  // Genbrug event_id, hvis forespørgslen allerede er accepteret — så svaret
  // også dukker op i eventets egen "Korrespondance"-tråd, ikke kun her. Også
  // henter vi klientens email/titel/access_token her i samme opslag, til
  // "ny besked"-mailen nedenfor — access_token virker som statuslink
  // UANSET om forespørgslen er accepteret endnu (se lib/event-status.ts's
  // fallback-kæde), så vi behøver ikke skelne på created_event_id for det.
  const { data: existing } = await supabase
    .from("event_requests")
    .select("created_event_id, access_token, title, client_name, client_contact_person, client_contact_email")
    .eq("id", requestId)
    .eq("company_id", company.id)
    .maybeSingle();

  const insertResult = await insertEventMessage({
    companyId: company.id,
    eventRequestId: requestId,
    eventId: (existing?.created_event_id as string | null) ?? null,
    sender: "admin",
    senderName: adminName,
    body: trimmed,
    attachments,
  });

  if (!insertResult.success) {
    return { success: false as const, error: insertResult.error };
  }

  await supabase
    .from("event_requests")
    .update({ status: "in_dialog" })
    .eq("id", requestId)
    .eq("company_id", company.id)
    .eq("status", "new");

  // Giver klienten besked om admins svar via email — uden dette skulle de
  // selv huske at genbesøge deres /status/[token]-link for at se det.
  // Fejler aldrig selve svaret, hvis mailen af nogen grund ikke kan sendes
  // (samme filosofi som push-koden andre steder i kodebasen).
  if (existing?.client_contact_email) {
    try {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("contact_email")
        .eq("id", company.id)
        .maybeSingle();
      const statusUrl = buildTenantUrl(company.slug, `/status/${existing.access_token}`);
      const subject = `Ny besked fra ${company.name}`;
      // Headline i selve mailen viser hvem der reelt skrev (admin), ikke
      // bare virksomhedsnavnet — og brødteksten er nu admins EGEN besked
      // (trimmed), ikke en fast, uspecifik sætning (Hjorth 2026-08-08).
      const greeting = `${firstNameOf(adminName)} fra ${company.name}:`;
      const cta = { label: "Besvar / Se hele korrespondancen", url: statusUrl };
      await sendEmail({
        to: existing.client_contact_email as string,
        subject,
        html: buildSimpleAuthEmailHtml({ greeting, message: trimmed, cta, companyName: company.name }),
        text: buildSimpleAuthEmailText({ greeting, message: trimmed, cta }),
        fromName: company.name,
        replyTo: companyRow?.contact_email || undefined,
      });
    } catch (err) {
      console.error("replyAsAdmin: besked-notifikation kunne ikke sendes", err);
    }
  }

  revalidatePath("/event-requests");
  return { success: true as const };
}

/** Uploader én vedhæftning til admins svar, FØR selve beskeden sendes — se uploadMessageAttachment. */
export async function uploadEventMessageAttachmentAsAdmin(requestId: string, file: File) {
  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  return uploadMessageAttachment(company.id, requestId, file);
}

export async function rejectEventRequest(requestId: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("event_requests")
    .update({ status: "rejected" })
    .eq("id", requestId)
    .eq("company_id", company.id);

  if (error) {
    console.error("rejectEventRequest fejlede", error);
    return { success: false, error: "Kunne ikke afvise forespørgslen. Prøv igen." };
  }

  revalidatePath("/event-requests");
  return { success: true };
}

export type ClientMatchOption = {
  id: string;
  name: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

/** Frit-tekst-søgning på tværs af navn/kontaktperson/email/telefon/CVR — til "match eksisterende kunde"-trinnet ved accept. */
export async function searchClientsForMatch(query: string): Promise<ClientMatchOption[]> {
  const company = await requireCompany();
  if (!company || !query.trim()) return [];

  const supabase = await createSupabaseClient();
  const term = `%${query.trim()}%`;
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, contact_person, contact_phone, contact_email")
    .eq("company_id", company.id)
    .or(`name.ilike.${term},contact_person.ilike.${term},contact_email.ilike.${term},contact_phone.ilike.${term},cvr_number.ilike.${term}`)
    .limit(10);

  if (error) {
    console.error("searchClientsForMatch fejlede", error);
    return [];
  }

  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string | null,
    contactPerson: c.contact_person as string | null,
    contactPhone: c.contact_phone as string | null,
    contactEmail: c.contact_email as string | null,
  }));
}

export type AcceptClientChoice = { mode: "existing"; clientId: string } | { mode: "new" };

/**
 * Accepterer en eventforespørgsel: kobler den på en (evt. ny) kunde, opretter
 * det rigtige event+vagter via den EKSISTERENDE createEventWithShifts()
 * (som allerede automatisk lægger "ny ledig vagt"-notifikationer i kø til
 * matchende freelancere pr. oprettet vagt — ingen ny notifikationskode
 * nødvendig her). Se [[project_event_request_feature]].
 */
export async function acceptEventRequest(requestId: string, clientChoice: AcceptClientChoice) {
  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const request = await getEventRequestById(company.id, requestId);
  if (!request) return { success: false as const, error: "Kunne ikke finde forespørgslen." };
  if (request.status === "accepted") {
    return { success: false as const, error: "Forespørgslen er allerede accepteret." };
  }

  const supabase = await createSupabaseClient();

  let clientId: string;
  if (clientChoice.mode === "existing") {
    clientId = clientChoice.clientId;
  } else {
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        company_id: company.id,
        name: request.customerType === "company" ? request.clientName : null,
        cvr_number: request.customerType === "company" ? request.cvrNumber : null,
        contact_person: request.contactPerson,
        contact_phone: request.contactPhone,
        contact_email: request.contactEmail,
      })
      .select("id")
      .single();

    if (clientError || !newClient) {
      console.error("acceptEventRequest: kunne ikke oprette kunden", clientError);
      return { success: false as const, error: "Kunne ikke oprette kunden. Prøv igen." };
    }
    clientId = newClient.id as string;
  }

  // Eventstedet oprettes altid som ét NYT venue på den valgte kunde (uanset
  // om kunden var eksisterende eller ny) — men BEVIDST uden at kalde
  // createVenue(), som ville geokode adressen igen fra bunden. Et helt nyt
  // Google-opslag kan returnere en (ganske lidt) anden koordinat/rute end
  // det allerede-gemte opslag fra selve /request-indsendelsen, hvilket gav
  // et forkert, uforklarligt afvigende transporttillæg mellem klientens
  // pris og admin-systemets (Hjorth 2026-08-06, "27 kr. vs 25 kr."). I
  // stedet genbruges request.venueLatitude/venueLongitude/venueDistanceKm
  // uændret — nøjagtig samme tal klienten allerede har set.
  const { data: venueRow, error: venueError } = await supabase
    .from("client_venues")
    .insert({
      company_id: company.id,
      client_id: clientId,
      name: request.venueName || null,
      address: request.venueAddress || null,
      postal_code: request.venuePostalCode || null,
      city: request.venueCity || null,
      latitude: request.venueLatitude,
      longitude: request.venueLongitude,
      distance_from_company_km: request.venueDistanceKm,
      distance_calculated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (venueError || !venueRow) {
    console.error("acceptEventRequest: kunne ikke oprette eventstedet", venueError);
    return { success: false as const, error: "Kunne ikke oprette eventstedet. Prøv igen." };
  }

  // Eventets "Briefing" til freelancerne er admins eget felt — forespørgslen
  // har ikke et rigtigt tilsvarende felt fra klienten, MEN vi forudfylder
  // alligevel med klientens Trin 2-besked (samme tekst som allerede ligger
  // som forespørgslens allerførste "Dialog"-besked), så freelancere i det
  // mindste ser klientens egne ord, hvis admin glemmer at skrive en rigtig
  // briefing (Hjorth 2026-08-08: "bedre end ingenting"). Admin forventes
  // typisk at overskrive den via "Redigér event". Tom streng hvis klienten
  // ikke skrev noget på Trin 2.
  const initialClientMessage = request.messages.find((m) => m.sender === "client")?.body ?? "";

  const eventInput: EventFormInput = {
    title: request.title,
    eventDate: request.eventDate,
    description: initialClientMessage,
    // Klientens eget "cirka"-tal fra Trin 2 — genbruges direkte i stedet for
    // at admin skal skrive det ind igen bagefter via "Redigér event" (se
    // [[project_event_request_feature]]).
    expectedGuests: request.expectedGuests ?? "",
    clientId,
    venueId: venueRow.id as string,
  };
  const rows: ShiftCreateRowInput[] = request.jobLines.map((line) => ({
    id: null,
    categoryId: line.categoryId,
    startTime: line.startTime,
    endTime: line.endTime,
    freelancerId: null,
  }));

  const createResult = await createEventWithShifts(eventInput, rows, { skipCreationLog: true });
  if (!createResult.success) {
    return { success: false as const, error: createResult.error };
  }

  const { error: updateError } = await supabase
    .from("event_requests")
    .update({ status: "accepted", created_event_id: createResult.eventId, created_client_id: clientId })
    .eq("id", requestId)
    .eq("company_id", company.id);

  if (updateError) {
    console.error("acceptEventRequest: kunne ikke opdatere forespørgslens status", updateError);
  }

  // Genbrug forespørgslens EGET access_token som eventets correspondence_token
  // — klientens allerede bogmærkede /status/[token]-link fortsætter dermed
  // med at virke uændret, den viser nu bare eventets (accepterede) status i
  // stedet for forespørgslens. Se [[project_event_correspondence_and_system_log]].
  const { error: tokenError } = await supabase
    .from("events")
    .update({ correspondence_token: request.accessToken })
    .eq("id", createResult.eventId)
    .eq("company_id", company.id);
  if (tokenError) {
    console.error("acceptEventRequest: kunne ikke overføre correspondence_token", tokenError);
  }

  // Al tidligere dialog (fra mens det stadig kun var en forespørgsel) får nu
  // også event_id sat, så den fremstår som ét sammenhængende forløb i
  // eventets egen "Korrespondance"-tråd, ikke kun i forespørgslens historik.
  const { error: backfillError } = await supabase
    .from("event_messages")
    .update({ event_id: createResult.eventId })
    .eq("event_request_id", requestId)
    .eq("company_id", company.id);
  if (backfillError) {
    console.error("acceptEventRequest: kunne ikke overføre beskeder til eventet", backfillError);
  }

  const adminName = await getCurrentAdminName(supabase);
  await insertEventMessage({
    companyId: company.id,
    eventRequestId: requestId,
    eventId: createResult.eventId,
    sender: "system",
    senderName: adminName,
    body: "accepterede forespørgslen og oprettede eventet.",
  });

  // Booking-godkendt-mailen til klienten — genbruger skabelonen/kort-koderne
  // bygget i [[project_texts_settings_next_steps]], som indtil nu kun var
  // redigerbare tekster uden nogen reel afsendelse (se
  // [[project_client_emails_send_wiring_audit]]). Fejler aldrig selve
  // accept-flowet, hvis mailen af nogen grund ikke kan sendes — eventet er
  // allerede oprettet på dette tidspunkt, det skal ikke rulles tilbage.
  try {
    const { data: companyRow } = await supabase
      .from("companies")
      .select(
        "contact_phone, contact_email, booking_approved_email_subject, booking_approved_email_body, google_review_url, website_url, rental_terms_url, faq_url"
      )
      .eq("id", company.id)
      .maybeSingle();

    const clientName = request.clientName || request.contactPerson || "kunde";
    const statusUrl = buildTenantUrl(company.slug, `/status/${request.accessToken}`);

    const tokenValues: EventEmailTokenValues = {
      companyName: company.name,
      companyPhone: companyRow?.contact_phone || "",
      companyEmail: companyRow?.contact_email || "",
      clientName,
      clientFirstName: firstNameOf(clientName),
      eventName: request.title,
      eventDate: formatDateDisplay(request.eventDate),
      eventVenue: venueLabel({
        name: request.venueName,
        address: request.venueAddress,
        postalCode: request.venuePostalCode,
        city: request.venueCity,
      }),
      bookedStaff: summarizeBookedStaff(request.jobLines),
      eventStatusUrl: statusUrl,
      approvedByName: adminName || company.name,
      googleReviewLink: companyRow?.google_review_url || "",
      companyWebsiteUrl: companyRow?.website_url || "",
      rentalTermsUrl: companyRow?.rental_terms_url || "",
      faqUrl: companyRow?.faq_url || "",
    };

    const subject = renderEventEmailTokens(
      companyRow?.booking_approved_email_subject || DEFAULT_BOOKING_APPROVED_SUBJECT,
      tokenValues
    );
    const bodyText = renderEventEmailTokens(
      companyRow?.booking_approved_email_body || DEFAULT_BOOKING_APPROVED_BODY,
      tokenValues
    );

    await sendEmail({
      to: request.contactEmail,
      subject,
      html: buildBookingApprovedEmailHtml({ bodyText, companyLogoUrl: company.logo_url, statusUrl, companyName: company.name }),
      text: buildBookingApprovedEmailText(bodyText, statusUrl),
      fromName: company.name,
      replyTo: companyRow?.contact_email || undefined,
    });
  } catch (err) {
    console.error("acceptEventRequest: booking-godkendt-mail kunne ikke sendes", err);
  }

  revalidatePath("/event-requests");
  revalidatePath("/shifts");
  return { success: true as const, eventId: createResult.eventId };
}

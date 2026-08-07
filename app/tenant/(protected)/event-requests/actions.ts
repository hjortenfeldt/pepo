"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { getEventRequestById, type EventRequestDetail } from "@/lib/event-requests";
import { insertEventMessage, getCurrentAdminName, uploadMessageAttachment, type NewMessageAttachment } from "@/lib/event-messages";
import { createEventWithShifts, type EventFormInput, type ShiftCreateRowInput } from "@/app/tenant/(protected)/shifts/actions";

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
  // også dukker op i eventets egen "Korrespondance"-tråd, ikke kun her.
  const { data: existing } = await supabase
    .from("event_requests")
    .select("created_event_id")
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

  const eventInput: EventFormInput = {
    title: request.title,
    eventDate: request.eventDate,
    // Eventets "Briefing" til freelancerne er admins eget felt — forespørgslen
    // har aldrig haft et tilsvarende felt fra klienten (se
    // EventRequestSubmission.initialMessage), så det starter bevidst tomt her
    // og udfyldes evt. af admin bagefter via "Redigér event".
    description: "",
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

  revalidatePath("/event-requests");
  revalidatePath("/shifts");
  return { success: true as const, eventId: createResult.eventId };
}

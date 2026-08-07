import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDrivingDistanceKm } from "@/lib/maps";
import { calculateLabourSubtotal, calculateTransportSurcharge, calculateVat, calculateTotal, type CategoryRateMap } from "@/lib/pricing";
import { sendPushToCompanyAdmins } from "@/lib/admin-push";
import { getMessagesForRequest, insertEventMessage, type EventMessageItem, type NewMessageAttachment } from "@/lib/event-messages";

/**
 * Delt kerne-logik for den offentlige "/request"-side (klienter/kommende
 * kunder beder om personale til et event, uden login) — se
 * app/tenant/request/actions.ts for de tynde "use server"-wrappere, der
 * afgør virksomheden ud fra subdomænet og kalder ind hertil. Samme
 * opdeling som lib/registration.ts <-> app/tenant/apply/actions.ts.
 *
 * ALT DB-arbejde her går via createAdminClient() (service role) — der findes
 * ingen indlogget bruger på /request, så RLS-policyerne på event_requests
 * (som kun tillader tenant-admins) ville ellers blokere hele flowet.
 */

export type CategoryOptionWithRate = { id: string; name: string; clientRatePerHour: number };

/** Jobfunktioner + deres priskategoris kunde-timepris, til Trin 1's dropdown + løbende prisoverslag. */
export async function getWorkCategoriesWithRatesForCompany(companyId: string): Promise<CategoryOptionWithRate[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("work_categories")
    .select("id, name, group_id, work_category_groups(client_rate_per_hour)")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    console.error("getWorkCategoriesWithRatesForCompany fejlede", error);
    return [];
  }

  return (data ?? []).map((c) => {
    const group = c.work_category_groups as { client_rate_per_hour: number | string } | { client_rate_per_hour: number | string }[] | null;
    const g = Array.isArray(group) ? group[0] ?? null : group;
    return {
      id: c.id as string,
      name: c.name as string,
      clientRatePerHour: g ? Number(g.client_rate_per_hour) : 0,
    };
  });
}

export function categoryRateMap(categories: CategoryOptionWithRate[]): CategoryRateMap {
  return new Map(categories.map((c) => [c.id, c.clientRatePerHour]));
}

/** Virksomhedens koordinater + kr./km-takst, til at estimere transporttillægget efter Trin 3's adressevalg. */
export async function getCompanyTransportInfo(
  companyId: string
): Promise<{ latitude: number | null; longitude: number | null; transportRatePerKm: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("latitude, longitude, transport_rate_per_km")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getCompanyTransportInfo fejlede", error);
    return { latitude: null, longitude: null, transportRatePerKm: 5 };
  }
  return {
    latitude: data.latitude as number | null,
    longitude: data.longitude as number | null,
    transportRatePerKm: Number(data.transport_rate_per_km ?? 5),
  };
}

/** Beregner køreafstanden fra virksomheden til en valgt venue-adresse — kaldes fra Trin 3/4 i formularen. */
export async function estimateTransportForCompany(
  companyId: string,
  destinationLat: number,
  destinationLng: number
): Promise<{ distanceKm: number | null; transportRatePerKm: number }> {
  const info = await getCompanyTransportInfo(companyId);
  if (info.latitude == null || info.longitude == null) {
    return { distanceKm: null, transportRatePerKm: info.transportRatePerKm };
  }
  const distanceKm = await getDrivingDistanceKm(
    { lat: info.latitude, lng: info.longitude },
    { lat: destinationLat, lng: destinationLng }
  );
  return { distanceKm, transportRatePerKm: info.transportRatePerKm };
}

export type EventRequestJobLineInput = {
  categoryId: string;
  startTime: string;
  endTime: string;
};

export type EventRequestSubmission = {
  // Trin 1 (inkl. Dato/Titel, flyttet hertil fra det tidligere Trin 2 —
  // Hjorth 2026-08-08)
  jobLines: EventRequestJobLineInput[];
  title: string;
  eventDate: string;
  // Trin 2 — helt valgfrit, fri tekst klienten selv angiver (Hjorth
  // 2026-08-08: "cirka"-tal, ikke en valideret optælling).
  expectedGuests: string;
  // Trin 2 — IKKE eventets "Briefing" (den er admins eget felt til
  // freelancerne, udfyldes aldrig af klienten). Indsættes i stedet som
  // forespørgslens allerførste klient-besked i "Dialog"-tråden, se
  // submitEventRequestForCompany nedenfor.
  initialMessage: string;
  // Trin 3 (matcher ClientFormInput + ét venue)
  customerType: "company" | "private";
  clientName: string;
  cvrNumber: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  venueName: string;
  venueAddress: string;
  venuePostalCode: string;
  venueCity: string;
  venueLat: number | null;
  venueLng: number | null;
};

function validateSubmission(input: EventRequestSubmission): string | null {
  if (input.jobLines.length === 0) return "Tilføj mindst én jobfunktion.";
  for (const row of input.jobLines) {
    if (!row.categoryId) return "Vælg jobfunktion for alle rækker.";
    if (!row.startTime || !row.endTime) return "Udfyld start- og sluttid for alle rækker.";
  }
  if (!input.title.trim()) return "Titel/anledning mangler.";
  if (!input.eventDate) return "Dato mangler.";
  if (!input.contactEmail.trim()) return "Emailadresse mangler.";
  if (input.customerType === "company" && !input.clientName.trim()) return "Firmanavn mangler.";
  if (input.customerType === "private" && !input.contactPerson.trim()) return "Navn mangler.";
  if (!input.venueAddress.trim() || input.venueLat == null || input.venueLng == null) {
    return "Vælg eventstedets adresse fra listen.";
  }
  return null;
}

export async function submitEventRequestForCompany(companyId: string, input: EventRequestSubmission) {
  const validationError = validateSubmission(input);
  if (validationError) return { success: false as const, error: validationError };

  const supabase = createAdminClient();

  const categories = await getWorkCategoriesWithRatesForCompany(companyId);
  const rates = categoryRateMap(categories);
  const labourSubtotalKr = calculateLabourSubtotal(input.jobLines, rates);

  const { distanceKm, transportRatePerKm } = await estimateTransportForCompany(
    companyId,
    input.venueLat as number,
    input.venueLng as number
  );
  const transportSurchargeKr = calculateTransportSurcharge(distanceKm, transportRatePerKm, input.jobLines.length);
  // Moms lægges KUN på for firmakunder — se calculateVat.
  const vatKr = calculateVat(labourSubtotalKr, transportSurchargeKr, input.customerType);
  const totalKr = calculateTotal(labourSubtotalKr, transportSurchargeKr, vatKr);

  const { data: request, error: requestError } = await supabase
    .from("event_requests")
    .insert({
      company_id: companyId,
      status: "new",
      title: input.title.trim(),
      event_date: input.eventDate,
      customer_type: input.customerType,
      client_name: input.customerType === "company" ? input.clientName.trim() : null,
      client_cvr_number: input.customerType === "company" ? input.cvrNumber.trim() || null : null,
      client_contact_person: input.contactPerson.trim() || null,
      client_contact_phone: input.contactPhone.trim() || null,
      client_contact_email: input.contactEmail.trim().toLowerCase(),
      venue_name: input.venueName.trim() || null,
      venue_address: input.venueAddress.trim() || null,
      venue_postal_code: input.venuePostalCode.trim() || null,
      venue_city: input.venueCity.trim() || null,
      venue_latitude: input.venueLat,
      venue_longitude: input.venueLng,
      venue_distance_from_company_km: distanceKm,
      expected_guests: input.expectedGuests.trim() || null,
      labour_subtotal_kr: labourSubtotalKr,
      transport_surcharge_kr: transportSurchargeKr,
      vat_kr: vatKr,
      total_kr: totalKr,
    })
    .select("id, access_token")
    .single();

  if (requestError || !request) {
    console.error("submitEventRequestForCompany: kunne ikke oprette forespørgslen", requestError);
    return { success: false as const, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
  }

  const { error: shiftsError } = await supabase.from("event_request_shifts").insert(
    input.jobLines.map((row) => ({
      event_request_id: request.id,
      company_id: companyId,
      category_id: row.categoryId,
      start_time: row.startTime,
      end_time: row.endTime,
    }))
  );

  if (shiftsError) {
    console.error("submitEventRequestForCompany: kunne ikke oprette jobrækkerne", shiftsError);
    await supabase.from("event_requests").delete().eq("id", request.id);
    return { success: false as const, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
  }

  // Trin 2's frie tekst bliver forespørgslens allerførste besked i
  // "Dialog"-tråden (ikke gemt som noget "briefing"-felt, se
  // EventRequestSubmission.initialMessage) — synlig med det samme for admin
  // OG på klientens egen status-side. Fejler aldrig hårdt for selve
  // indsendelsen (samme filosofi som push-koden nedenfor).
  const initialMessage = input.initialMessage.trim();
  if (initialMessage) {
    try {
      await insertEventMessage({
        companyId,
        eventRequestId: request.id as string,
        sender: "client",
        senderName: input.customerType === "company" ? input.clientName.trim() : input.contactPerson.trim(),
        body: initialMessage,
      });
    } catch (err) {
      console.error("submitEventRequestForCompany: kunne ikke gemme den indledende besked", err);
    }
  }

  // Ny eventforespørgsel — se Pepo – Notifikationstyper.xlsx-mønsteret for
  // "Ny jobansøgning"/"Ny vagtanmodning". Fejler aldrig hårdt for selve
  // indsendelsen, ligesom resten af push-koden.
  try {
    await sendPushToCompanyAdmins(companyId, {
      title: "Ny eventforespørgsel",
      body: `${input.customerType === "company" ? input.clientName : input.contactPerson} har sendt en forespørgsel om personale til "${input.title.trim()}".`,
      url: "/event-requests",
    });
  } catch (err) {
    console.error("submitEventRequestForCompany: push til admins fejlede", err);
  }

  return { success: true as const, accessToken: request.access_token as string };
}

export type EventRequestMessageItem = EventMessageItem;

export type EventRequestJobLineItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  startTime: string;
  endTime: string;
};

export type EventRequestDetail = {
  id: string;
  accessToken: string;
  status: "new" | "in_dialog" | "accepted" | "rejected";
  title: string;
  eventDate: string;
  customerType: "company" | "private";
  clientName: string | null;
  cvrNumber: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string;
  venueName: string | null;
  venueAddress: string | null;
  venuePostalCode: string | null;
  venueCity: string | null;
  venueLatitude: number | null;
  venueLongitude: number | null;
  venueDistanceKm: number | null;
  expectedGuests: string | null;
  labourSubtotalKr: number | null;
  transportSurchargeKr: number | null;
  // `null` for privatkunder (ingen moms lagt på, linjen vises slet ikke) —
  // se calculateVat i lib/pricing.ts.
  vatKr: number | null;
  totalKr: number | null;
  createdEventId: string | null;
  createdAt: string;
  jobLines: EventRequestJobLineItem[];
  messages: EventRequestMessageItem[];
};

function hhmm(time: string): string {
  return time.slice(0, 5);
}

/**
 * Henter én eventforespørgsel + dens jobrækker/beskedtråd — brugt af BÅDE
 * klientens egen status/dialog-side (/request/status/[token], adgang alene
 * via det unguessable token) OG admins "Eventforespørgsler"-side (adgang via
 * almindelig session + RLS). `companyId` tjekkes altid eksplicit sammen med
 * token'et her — token'et er i praksis unikt nok i sig selv, men vi følger
 * samme "stol aldrig kun på RLS/et enkelt nøglefelt"-vane som resten af
 * systemet (se [[feedback_superadmin_scoping_required]]).
 */
export async function getEventRequestByToken(companyId: string, token: string): Promise<EventRequestDetail | null> {
  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .from("event_requests")
    .select(
      `id, company_id, access_token, status, title, event_date,
       customer_type, client_name, client_cvr_number, client_contact_person,
       client_contact_phone, client_contact_email,
       venue_name, venue_address, venue_postal_code, venue_city,
       venue_latitude, venue_longitude, venue_distance_from_company_km, expected_guests,
       labour_subtotal_kr, transport_surcharge_kr, vat_kr, total_kr, created_event_id, created_at`
    )
    .eq("access_token", token)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("getEventRequestByToken fejlede", error);
    return null;
  }
  if (!request) return null;

  return buildEventRequestDetail(supabase, request);
}

/** Samme opslag som ovenfor, men via id — bruges af admins detaljeside, som navigerer via forespørgslens id, ikke dens token. */
export async function getEventRequestById(companyId: string, id: string): Promise<EventRequestDetail | null> {
  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .from("event_requests")
    .select(
      `id, company_id, access_token, status, title, event_date,
       customer_type, client_name, client_cvr_number, client_contact_person,
       client_contact_phone, client_contact_email,
       venue_name, venue_address, venue_postal_code, venue_city,
       venue_latitude, venue_longitude, venue_distance_from_company_km, expected_guests,
       labour_subtotal_kr, transport_surcharge_kr, vat_kr, total_kr, created_event_id, created_at`
    )
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("getEventRequestById fejlede", error);
    return null;
  }
  if (!request) return null;

  return buildEventRequestDetail(supabase, request);
}

async function buildEventRequestDetail(
  supabase: ReturnType<typeof createAdminClient>,
  request: Record<string, unknown>
): Promise<EventRequestDetail> {
  const [shiftsResult, messages] = await Promise.all([
    supabase
      .from("event_request_shifts")
      .select("id, category_id, start_time, end_time, work_categories(name)")
      .eq("event_request_id", request.id as string)
      .order("start_time"),
    getMessagesForRequest(request.company_id as string, request.id as string),
  ]);

  if (shiftsResult.error) console.error("buildEventRequestDetail: kunne ikke hente jobrækker", shiftsResult.error);

  const jobLines: EventRequestJobLineItem[] = (shiftsResult.data ?? []).map((s) => {
    const cat = s.work_categories as { name: string } | { name: string }[] | null;
    const categoryName = Array.isArray(cat) ? cat[0]?.name : cat?.name;
    return {
      id: s.id as string,
      categoryId: s.category_id as string,
      categoryName: categoryName ?? "",
      startTime: hhmm(s.start_time as string),
      endTime: hhmm(s.end_time as string),
    };
  });

  return {
    id: request.id as string,
    accessToken: request.access_token as string,
    status: request.status as EventRequestDetail["status"],
    title: request.title as string,
    eventDate: request.event_date as string,
    customerType: request.customer_type as EventRequestDetail["customerType"],
    clientName: request.client_name as string | null,
    cvrNumber: request.client_cvr_number as string | null,
    contactPerson: request.client_contact_person as string | null,
    contactPhone: request.client_contact_phone as string | null,
    contactEmail: request.client_contact_email as string,
    venueName: request.venue_name as string | null,
    venueAddress: request.venue_address as string | null,
    venuePostalCode: request.venue_postal_code as string | null,
    venueCity: request.venue_city as string | null,
    venueLatitude: request.venue_latitude != null ? Number(request.venue_latitude) : null,
    venueLongitude: request.venue_longitude != null ? Number(request.venue_longitude) : null,
    venueDistanceKm: request.venue_distance_from_company_km != null ? Number(request.venue_distance_from_company_km) : null,
    expectedGuests: request.expected_guests as string | null,
    labourSubtotalKr: request.labour_subtotal_kr != null ? Number(request.labour_subtotal_kr) : null,
    transportSurchargeKr: request.transport_surcharge_kr != null ? Number(request.transport_surcharge_kr) : null,
    vatKr: request.vat_kr != null ? Number(request.vat_kr) : null,
    totalKr: request.total_kr != null ? Number(request.total_kr) : null,
    createdEventId: request.created_event_id as string | null,
    createdAt: request.created_at as string,
    jobLines,
    messages,
  };
}

/**
 * Klientens svar i dialogen (fra /request/status/[token], ingen login) —
 * sætter status til "in_dialog" hvis den stadig var "new" (admin har jo nu
 * noget at reagere på), og lægger en "Ny besked"-push i kø til admins,
 * ligesom pushNewShiftRequestToAdmins-mønsteret.
 */
export async function addClientMessageByToken(
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
  const { data: request, error: findError } = await supabase
    .from("event_requests")
    .select("id, status, client_name, client_contact_person, title, created_event_id")
    .eq("access_token", token)
    .eq("company_id", companyId)
    .maybeSingle();

  if (findError || !request) {
    console.error("addClientMessageByToken: kunne ikke finde forespørgslen", findError);
    return { success: false as const, error: "Kunne ikke finde forespørgslen." };
  }

  const senderName = (request.client_name as string | null) || (request.client_contact_person as string | null);

  const insertResult = await insertEventMessage({
    companyId,
    eventRequestId: request.id as string,
    eventId: (request.created_event_id as string | null) ?? null,
    sender: "client",
    senderName,
    body: trimmed,
    attachments,
  });

  if (!insertResult.success) {
    return { success: false as const, error: insertResult.error };
  }

  if (request.status === "new") {
    await supabase.from("event_requests").update({ status: "in_dialog" }).eq("id", request.id);
  }

  try {
    await sendPushToCompanyAdmins(companyId, {
      title: "Ny besked i eventforespørgsel",
      body: `${senderName ?? "Klienten"} har svaret i dialogen om "${request.title}".`,
      url: "/event-requests",
    });
  } catch (err) {
    console.error("addClientMessageByToken: push til admins fejlede", err);
  }

  return { success: true as const };
}

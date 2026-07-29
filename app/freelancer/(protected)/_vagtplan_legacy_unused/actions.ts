"use server";

import { createClient } from "@/lib/supabase/server";

type RawVenueRef = { name: string | null; address: string | null; postal_code: string | null; city: string | null };
type RawClientRef = { name: string | null; contact_person: string | null; contact_phone: string | null };
type RawEventRef = { id: string; title: string; description: string | null };
type RawAttachmentRow = { id: string; file_name: string; file_url: string };

type RawShiftDetailRow = {
  id: string;
  description: string | null;
  events: RawEventRef | RawEventRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
  clients: RawClientRef | RawClientRef[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export type ShiftDetail = {
  venueName: string | null;
  venueAddress: string | null;
  clientName: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  description: string | null;
  attachments: { id: string; name: string; url: string }[];
  colleagues: { freelancerId: string; fullName: string; profileImageUrl: string | null; categoryName: string }[];
};

/**
 * Hentes on-demand når en freelancer folder en vagt ud på Vagtplan-siden
 * — undgår at hente kollega-/kontaktdata for alle kommende vagter på
 * forhånd. Kolleger hentes via get_event_colleagues(), en security-
 * definer-funktion der selv tjekker at den kaldende freelancer har en
 * tildelt vagt på samme event, se migrationen freelancer_app_read_access.
 */
export async function getShiftDetail(shiftId: string): Promise<ShiftDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shifts")
    .select(
      "id, description, events(id, title, description), client_venues(name, address, postal_code, city), clients(name, contact_person, contact_phone)"
    )
    .eq("id", shiftId)
    .maybeSingle();

  if (error || !data) {
    console.error("getShiftDetail fejlede", error);
    return null;
  }

  const row = data as unknown as RawShiftDetailRow;
  const venue = one(row.client_venues);
  const client = one(row.clients);
  const event = one(row.events);

  let attachments: ShiftDetail["attachments"] = [];
  let colleagues: ShiftDetail["colleagues"] = [];

  if (event) {
    const [attachmentsResult, colleaguesResult] = await Promise.all([
      supabase.from("shift_attachments").select("id, file_name, file_url").eq("event_id", event.id),
      supabase.rpc("get_event_colleagues", { p_event_id: event.id }),
    ]);

    attachments = (attachmentsResult.data ?? []).map((a: RawAttachmentRow) => ({
      id: a.id,
      name: a.file_name,
      url: a.file_url,
    }));

    const {
      data: { user },
    } = await supabase.auth.getUser();

    colleagues = ((colleaguesResult.data ?? []) as {
      freelancer_id: string;
      full_name: string;
      profile_image_url: string | null;
      category_name: string;
    }[])
      .filter((c) => c.freelancer_id !== user?.id)
      .map((c) => ({
        freelancerId: c.freelancer_id,
        fullName: c.full_name,
        profileImageUrl: c.profile_image_url,
        categoryName: c.category_name,
      }));
  }

  const addressLine = venue
    ? [venue.address, [venue.postal_code, venue.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : null;

  return {
    venueName: venue?.name ?? null,
    venueAddress: addressLine || null,
    clientName: client?.name ?? null,
    contactPerson: client?.contact_person ?? null,
    contactPhone: client?.contact_phone ?? null,
    description: event?.description ?? row.description ?? null,
    attachments,
    colleagues,
  };
}

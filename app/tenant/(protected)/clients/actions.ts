"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { normalizePhone } from "@/lib/format";
import { geocodeAddress, getDrivingDistanceKm } from "@/lib/maps";

// Se shifts/actions.ts for hvorfor company.id skal sættes/filtreres
// eksplicit i stedet for at stole på RLS/databasetriggerens fallback.
async function requireCompany() {
  return getCompanyBySubdomain();
}

// Et arbejdssted (venue) på en kunde. "id" er null for et nyt arbejdssted,
// der endnu ikke findes i databasen — sat, når man redigerer et eksisterende.
export type VenueFormEntry = {
  id: string | null;
  name: string;
  address: string;
  postalCode: string;
  city: string;
};

export type ClientFormInput = {
  name: string;
  cvrNumber: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
  // Valgfri: udelades af ClientQuickAddPanel, som selv styrer sine venues via
  // createVenue/updateVenue/deleteVenue (shifts/actions.ts). Når den er sat
  // (fx fra ClientBoard), overtager syncVenues() nedenfor hele synkroniseringen.
  venues?: VenueFormEntry[];
};

function toRow(input: ClientFormInput) {
  return {
    name: input.name.trim() || null,
    cvr_number: input.cvrNumber.trim() || null,
    contact_person: input.contactPerson.trim() || null,
    // Ingen mellemrum i telefonnumre, så søgning altid virker uanset
    // hvordan admin har tastet nummeret ind.
    contact_phone: input.contactPhone.trim()
      ? normalizePhone(input.contactPhone.trim())
      : null,
    contact_email: input.contactEmail.trim() || null,
    notes: input.notes.trim() || null,
  };
}

function validate(input: ClientFormInput) {
  if (!input.name.trim() && !input.contactPerson.trim()) {
    return "Udfyld enten firmanavn eller kontaktperson.";
  }
  return null;
}

// Gemmer kundens arbejdssteder i én omgang: opdaterer eksisterende (har id),
// indsætter nye (id === null), og sletter dem der ikke længere er i listen.
// Sikrer altid mindst ét arbejdssted, ligesom prototypen — resten af systemet
// (fx vagt-oprettelse) forudsætter at en kunde har mindst ét venue at vælge.
async function syncVenues(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  companyId: string,
  clientId: string,
  venues: VenueFormEntry[]
) {
  const cleaned = venues.filter(
    (v) => v.name.trim() || v.address.trim() || v.postalCode.trim() || v.city.trim()
  );
  const toKeep = cleaned.length > 0 ? cleaned : [{ id: null, name: "", address: "", postalCode: "", city: "" }];

  const { data: existing } = await supabase
    .from("client_venues")
    .select("id, address, postal_code, city")
    .eq("client_id", clientId)
    .eq("company_id", companyId);
  const existingById = new Map((existing ?? []).map((v) => [v.id as string, v]));
  const existingIds = new Set(existingById.keys());
  const keptIds = new Set(toKeep.filter((v) => v.id).map((v) => v.id as string));

  const idsToDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (idsToDelete.length > 0) {
    await supabase.from("client_venues").delete().in("id", idsToDelete).eq("company_id", companyId);
  }

  // Virksomhedens koordinater slås kun op én gang for hele synkroniseringen,
  // ikke pr. venue — sparer API-kald når en kunde har flere arbejdssteder.
  const { data: companyRow } = await supabase
    .from("companies")
    .select("latitude, longitude")
    .eq("id", companyId)
    .maybeSingle();
  const companyLocation =
    companyRow?.latitude != null && companyRow?.longitude != null
      ? { lat: companyRow.latitude, lng: companyRow.longitude }
      : null;

  for (const v of toKeep) {
    const address = v.address.trim() || null;
    const postalCode = v.postalCode.trim() || null;
    const city = v.city.trim() || null;

    const prev = v.id ? existingById.get(v.id) : undefined;
    const addressChanged =
      address !== (prev?.address ?? null) || postalCode !== (prev?.postal_code ?? null) || city !== (prev?.city ?? null);

    const row: Record<string, unknown> = {
      client_id: clientId,
      name: v.name.trim() || null,
      address,
      postal_code: postalCode,
      city,
    };

    if (addressChanged) {
      if (address) {
        const location = await geocodeAddress(address, postalCode, city);
        row.latitude = location?.lat ?? null;
        row.longitude = location?.lng ?? null;
        row.distance_from_company_km =
          location && companyLocation ? await getDrivingDistanceKm(companyLocation, location) : null;
        row.distance_calculated_at = new Date().toISOString();
      } else {
        row.latitude = null;
        row.longitude = null;
        row.distance_from_company_km = null;
        row.distance_calculated_at = null;
      }
    }

    if (v.id) {
      await supabase.from("client_venues").update(row).eq("id", v.id).eq("company_id", companyId);
    } else {
      await supabase.from("client_venues").insert({ ...row, company_id: companyId });
    }
  }
}

export async function createClientRecord(input: ClientFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false as const, error: validationError };

  const company = await requireCompany();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...toRow(input), company_id: company.id })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createClientRecord fejlede", error);
    return { success: false as const, error: "Kunne ikke oprette kunden. Prøv igen." };
  }

  if (input.venues !== undefined) {
    await syncVenues(supabase, company.id, data.id as string, input.venues);
  }

  revalidatePath("/clients");
  return { success: true as const, id: data.id as string };
}

export async function updateClientRecord(id: string, input: ClientFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false, error: validationError };

  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("clients")
    .update(toRow(input))
    .eq("id", id)
    .eq("company_id", company.id);

  if (error) {
    console.error("updateClientRecord fejlede", error);
    return { success: false, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  if (input.venues !== undefined) {
    await syncVenues(supabase, company.id, id, input.venues);
  }

  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClientRecord(id: string) {
  const company = await requireCompany();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("company_id", company.id);

  if (error) {
    console.error("deleteClientRecord fejlede", error);
    return { success: false, error: "Kunne ikke slette kunden. Prøv igen." };
  }

  revalidatePath("/clients");
  return { success: true };
}

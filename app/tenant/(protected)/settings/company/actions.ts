"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { normalizePhone } from "@/lib/format";
import { revalidatePath } from "next/cache";

/**
 * companies kan kun opdateres af super-admins ifølge RLS ("Super admins
 * can manage companies") — almindelige tenant-admins må kun læse deres
 * egen række. Bruger derfor service role-klienten her, ligesom
 * settings/calendar/actions.ts.
 */

export type CompanyProfileInput = {
  name: string;
  cvrNumber: string;
  address: string;
  postalCode: string;
  city: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
};

export async function updateCompanyProfile(input: CompanyProfileInput) {
  if (!input.name.trim()) {
    return { success: false as const, error: "Firmanavn må ikke være tomt." };
  }

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      name: input.name.trim(),
      cvr_number: input.cvrNumber.trim() || null,
      address: input.address.trim() || null,
      postal_code: input.postalCode.trim() || null,
      city: input.city.trim() || null,
      contact_person: input.contactPerson.trim() || null,
      contact_phone: input.contactPhone.trim() ? normalizePhone(input.contactPhone.trim()) : null,
      contact_email: input.contactEmail.trim() || null,
    })
    .eq("id", company.id);

  if (error) {
    console.error("updateCompanyProfile fejlede", error);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/settings/company");
  return { success: true as const };
}

/**
 * Ændrer virksomhedens slug (den del af URL'en før .pepo.team).
 * Databasen håndhæver selv format (kun a-z/0-9/bindestreg), unikhed, og
 * blokerer reserverede ord (fx "www", "admin") via companies_slug_format,
 * companies_slug_key og companies_reject_reserved_slug — vi oversætter
 * bare fejlene til pæne danske beskeder.
 */
export async function updateCompanySlug(newSlug: string) {
  const cleaned = newSlug.trim().toLowerCase();
  if (!cleaned) {
    return { success: false as const, error: "Webadressen må ikke være tom." };
  }

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("companies").update({ slug: cleaned }).eq("id", company.id);

  if (error) {
    console.error("updateCompanySlug fejlede", error);
    if (error.message.includes("reserveret")) {
      return { success: false as const, error: `Webadressen "${cleaned}" er reserveret og kan ikke bruges.` };
    }
    if (error.code === "23505") {
      return { success: false as const, error: `Webadressen "${cleaned}" er allerede i brug af en anden virksomhed.` };
    }
    if (error.code === "23514") {
      return {
        success: false as const,
        error: "Webadressen må kun indeholde små bogstaver, tal og bindestreger, og skal starte/slutte med et bogstav eller tal.",
      };
    }
    return { success: false as const, error: "Kunne ikke ændre webadressen. Prøv igen." };
  }

  revalidatePath("/settings/company");
  return { success: true as const, slug: cleaned };
}

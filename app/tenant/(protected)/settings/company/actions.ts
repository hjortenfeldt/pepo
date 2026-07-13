"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { normalizePhone } from "@/lib/format";
import { revalidatePath, updateTag } from "next/cache";
import { COMPANY_INFO_TAG, FREELANCER_MEMBERSHIPS_TAG } from "@/lib/freelancer";

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
  // Freelancer-appens Kontakter-side (getCompanyContactInfo) og dens
  // cachede medlemskabsliste (som indlejrer firmanavnet) cacher denne
  // information — uden disse to ville en ændring her først slå igennem
  // for freelancerne op til 60 sek. senere.
  updateTag(COMPANY_INFO_TAG);
  updateTag(FREELANCER_MEMBERSHIPS_TAG);
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
  // Slug er indlejret i den cachede medlemskabsliste (companies.slug) —
  // se samme begrundelse i updateCompanyProfile ovenfor.
  updateTag(FREELANCER_MEMBERSHIPS_TAG);
  return { success: true as const, slug: cleaned };
}

/**
 * Uploader/erstatter virksomhedens logo (vist i freelancer-appens
 * Overblik-header). Samme data-URL-mønster som profilbillede-uploads
 * (se lib/supabase-uafhængige uploadPhotoIfNeeded i profile/actions.ts) —
 * her indlejret direkte, da det kun er ét sted der uploader firmalogoer.
 */
export async function updateCompanyLogo(logoDataUrl: string) {
  const match = logoDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return { success: false as const, error: "Ugyldigt billedformat." };
  }

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const contentType = match[1];
  const base64 = match[2];
  const ext = contentType.split("/")[1]?.split("+")[0] || "png";
  const buffer = Buffer.from(base64, "base64");
  const path = `${company.id}/logo.${ext}`;

  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage
    .from("company-logos")
    .upload(path, buffer, { upsert: true, contentType });

  if (uploadError) {
    console.error("updateCompanyLogo: upload fejlede", uploadError);
    return { success: false as const, error: "Kunne ikke uploade logoet. Prøv igen." };
  }

  const { data: publicUrlData } = supabase.storage.from("company-logos").getPublicUrl(path);
  // Cache-bust, så det nye logo vises med det samme og ikke rammer en
  // gammel, browser-cachet udgave på samme filsti.
  const logoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { error: dbError } = await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", company.id);

  if (dbError) {
    console.error("updateCompanyLogo: companies-update fejlede", dbError);
    return { success: false as const, error: "Kunne ikke gemme logoet. Prøv igen." };
  }

  revalidatePath("/settings/company");
  // Logoet er indlejret i den cachede medlemskabsliste ligesom firmanavn
  // og slug (se getFreelancerMemberships i lib/freelancer.ts).
  updateTag(FREELANCER_MEMBERSHIPS_TAG);
  return { success: true as const, logoUrl };
}

/** Fjerner virksomhedens logo igen — freelancer-appen falder tilbage til at vise firmanavnet som overskrift. */
export async function removeCompanyLogo() {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("companies").update({ logo_url: null }).eq("id", company.id);

  if (error) {
    console.error("removeCompanyLogo fejlede", error);
    return { success: false as const, error: "Kunne ikke fjerne logoet. Prøv igen." };
  }

  revalidatePath("/settings/company");
  updateTag(FREELANCER_MEMBERSHIPS_TAG);
  return { success: true as const };
}

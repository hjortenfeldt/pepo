"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

/**
 * companies kan kun opdateres af super-admins ifølge RLS — se samme
 * begrundelse i settings/company/actions.ts. Bruger derfor service role-
 * klienten her.
 *
 * Disse to URL'er bruges ikke andre steder i UI'et — de findes udelukkende
 * for at kunne indsættes i klient-mailene via kort-koderne [google-review-
 * link] og [company-website-url] (se lib/email-templates.ts,
 * [[project_texts_settings_next_steps]]).
 */
export type ImportantUrlsInput = {
  googleReviewUrl: string;
  websiteUrl: string;
};

export async function updateImportantUrls(input: ImportantUrlsInput) {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      google_review_url: input.googleReviewUrl.trim() || null,
      website_url: input.websiteUrl.trim() || null,
    })
    .eq("id", company.id);

  if (error) {
    console.error("updateImportantUrls fejlede", error);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/settings/urls");
  return { success: true as const };
}

"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { RegistrationResult } from "@/lib/types";
import { submitRegistrationForCompany, getWorkCategoriesForCompany } from "@/lib/registration";

/**
 * Historisk: dette var Pepos EGEN ansøgningsside på roden af pepo.team,
 * hardkodet til virksomheden med slug "pepo". app/page.tsx viser nu i
 * stedet en simpel markedsførings-placeholder (den offentlige
 * registreringsside flyttede til hver virksomheds eget subdomæne, fx
 * kulturbyen.pepo.team/apply — se app/tenant/apply/), så disse funktioner
 * er lige nu ubrugte. Ligger stadig her, hvis Pepo selv (pepo.pepo.team)
 * senere skal have en tilsvarende genvej — ellers kan filen fjernes.
 * Se lib/registration.ts for den delte kernelogik.
 */
async function getPepoCompanyId(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("companies").select("id").eq("slug", "pepo").maybeSingle();
  if (error || !data) {
    console.error("getPepoCompanyId fejlede", error);
    return null;
  }
  return data.id;
}

export async function submitRegistration(formData: FormData): Promise<RegistrationResult> {
  const companyId = await getPepoCompanyId();
  if (!companyId) {
    return { success: false, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
  }
  return submitRegistrationForCompany(companyId, formData);
}

/**
 * Henter de aktive arbejdskategorier til trin 2 i formularen.
 * Bruges af en Server Component, så listen altid matcher det admin
 * har sat op i work_categories.
 */
export async function getWorkCategories() {
  const companyId = await getPepoCompanyId();
  if (!companyId) return [];
  return getWorkCategoriesForCompany(companyId);
}

"use server";

import { getCompanyBySubdomain } from "@/lib/tenant";
import type { RegistrationResult } from "@/lib/types";
import { submitRegistrationForCompany, getWorkCategoriesForCompany } from "@/lib/registration";

/**
 * Ansøgningsside for én bestemt virksomhed, tilgået via deres eget
 * subdomæne (fx kulturbyen.pepo.team/apply) — virksomheden afgøres derfor
 * altid af subdomænet, aldrig af noget freelanceren selv skal indtaste.
 * Se app/actions.ts for Pepos tilsvarende (hardkodede) egen ansøgningsside,
 * og lib/registration.ts for den delte kernelogik.
 */
export async function submitTenantApplication(formData: FormData): Promise<RegistrationResult> {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return {
      success: false,
      error: "Kunne ikke afgøre hvilken virksomhed ansøgningen gælder for. Prøv igen om lidt.",
    };
  }
  return submitRegistrationForCompany(company.id, formData);
}

export async function getTenantWorkCategories() {
  const company = await getCompanyBySubdomain();
  if (!company) return [];
  return getWorkCategoriesForCompany(company.id);
}

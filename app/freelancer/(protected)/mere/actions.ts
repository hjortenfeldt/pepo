"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/server";
import { ACTIVE_COMPANY_COOKIE, getApprovedCompanies } from "@/lib/freelancer";

/**
 * Skifter hvilken virksomhed freelancer-appen viser data for (se
 * getActiveCompany i lib/freelancer.ts). Verificerer at freelanceren
 * rent faktisk er godkendt hos den valgte virksomhed, før cookien sættes —
 * så man ikke kan snyde sig til at "vælge" en virksomhed man ikke er
 * tilknyttet ved at sende et vilkårligt id.
 */
export async function setActiveCompany(companyId: string) {
  const user = await getAuthUser();
  if (!user) return { success: false as const, error: "Ikke logget ind." };

  const approved = await getApprovedCompanies(user.id);
  if (!approved.some((c) => c.id === companyId)) {
    return { success: false as const, error: "Du er ikke tilknyttet denne virksomhed." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Alle sider i appen læser den aktive virksomhed server-side (Overblik,
  // Vagtplan, Beskeder, Kontakter, Mere selv) — revalider hele appen frem
  // for én bestemt sti, så det nye valg slår igennem uanset hvor
  // brugeren navigerer hen bagefter.
  revalidatePath("/", "layout");
  return { success: true as const };
}

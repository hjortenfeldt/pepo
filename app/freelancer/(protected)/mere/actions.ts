"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/server";
import { ACTIVE_PROFILE_COOKIE, getApprovedProfiles } from "@/lib/freelancer";

/**
 * Skifter hvilken PROFIL (og dermed hvilken virksomhed) freelancer-appen
 * viser data for (se getActiveProfile i lib/freelancer.ts). Verificerer at
 * profilen rent faktisk tilhører freelanceren og er godkendt, før cookien
 * sættes — så man ikke kan snyde sig til at "vælge" en profil man ikke selv
 * ejer ved at sende et vilkårligt id.
 */
export async function setActiveProfile(profileId: string) {
  const user = await getAuthUser();
  if (!user) return { success: false as const, error: "Ikke logget ind." };

  const approved = await getApprovedProfiles(user.id);
  if (!approved.some((p) => p.id === profileId)) {
    return { success: false as const, error: "Du er ikke tilknyttet denne profil." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROFILE_COOKIE, profileId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Alle sider i appen læser den aktive profil server-side (Overblik,
  // Vagtplan, Beskeder, Kontakter, Mere selv) — revalider hele appen frem
  // for én bestemt sti, så det nye valg slår igennem uanset hvor
  // brugeren navigerer hen bagefter.
  revalidatePath("/", "layout");
  return { success: true as const };
}

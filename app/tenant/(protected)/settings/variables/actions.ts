"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

/**
 * companies kan kun opdateres af super-admins ifølge RLS ("Super admins
 * can manage companies") — se samme begrundelse i settings/company/actions.ts.
 * Bruger derfor service role-klienten her.
 */

export type CompanyVariablesInput = {
  transportRatePerKm: string;
  checkinGeofenceEnabled: boolean;
  /** Radius i kilometer (som decimaltal, fx "1" eller "0,5") — konverteres til meter før gem. */
  checkinRadiusKm: string;
};

export async function updateCompanyVariables(input: CompanyVariablesInput) {
  const parsedRate = input.transportRatePerKm.trim() === "" ? 5 : Number(input.transportRatePerKm.replace(",", "."));
  if (!Number.isFinite(parsedRate) || parsedRate < 0) {
    return { success: false as const, error: "Transporttillæg pr. km skal være et positivt tal." };
  }

  const parsedRadiusKm = input.checkinRadiusKm.trim() === "" ? 1 : Number(input.checkinRadiusKm.replace(",", "."));
  if (!Number.isFinite(parsedRadiusKm) || parsedRadiusKm <= 0) {
    return { success: false as const, error: "Radius skal være et positivt tal." };
  }
  const radiusMeters = Math.round(parsedRadiusKm * 1000);

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      transport_rate_per_km: parsedRate,
      checkin_geofence_enabled: input.checkinGeofenceEnabled,
      checkin_radius_meters: radiusMeters,
    })
    .eq("id", company.id);

  if (error) {
    console.error("updateCompanyVariables fejlede", error);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/settings/variables");
  return { success: true as const };
}

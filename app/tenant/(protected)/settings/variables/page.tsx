import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import CompanyVariablesSettings from "@/components/admin/CompanyVariablesSettings";

export const metadata: Metadata = { title: "Variabler" };
export const dynamic = "force-dynamic";

export default async function CompanyVariablesPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  // Service role-klient, samme begrundelse som settings/company/page.tsx:
  // siden er allerede beskyttet af layout.tsx.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("transport_rate_per_km, checkin_geofence_enabled, checkin_radius_meters")
    .eq("id", company.id)
    .single();

  if (error || !data) {
    console.error("CompanyVariablesPage: kunne ikke hente variabler", error);
    redirect("/");
  }

  return (
    <CompanyVariablesSettings
      initial={{
        transportRatePerKm: String(data.transport_rate_per_km ?? 5),
        checkinGeofenceEnabled: data.checkin_geofence_enabled ?? true,
        // Gemmes i meter i DB, men vises/redigeres i km (1000m default -> "1").
        checkinRadiusKm: String((data.checkin_radius_meters ?? 1000) / 1000),
      }}
    />
  );
}

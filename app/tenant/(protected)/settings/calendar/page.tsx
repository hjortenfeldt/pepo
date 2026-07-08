import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import CalendarSyncSettings from "@/components/admin/CalendarSyncSettings";

export const dynamic = "force-dynamic";

export default async function CalendarSyncPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  // Bruger service role-klienten til at hente token'et, i stedet for den
  // almindelige RLS-bundne klient — companies-tabellens SELECT-policy
  // gælder alle autentificerede brugere på tværs af virksomheder, så vi
  // vil ikke risikere at et hemmeligt kalender-token bliver hentbart via
  // den brede policy. Siden er allerede beskyttet af layout.tsx, som har
  // verificeret at brugeren er admin for netop denne virksomhed.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("slug, calendar_feed_token")
    .eq("id", company.id)
    .single();

  if (error || !data) {
    console.error("CalendarSyncPage: kunne ikke hente kalender-token", error);
    redirect("/");
  }

  return (
    <CalendarSyncSettings tenantSlug={data.slug} initialToken={data.calendar_feed_token} />
  );
}

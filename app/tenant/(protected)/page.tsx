import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import DashboardBoard from "@/components/admin/DashboardBoard";
import { todayIso } from "@/lib/format";
import {
  monthlyFinancials,
  eventCounts,
  freelancerHourStats,
  upcomingEvents,
  recentEvents,
  type DashboardEvent,
} from "@/lib/dashboard";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// Rå formen af rækkerne Supabase returnerer. Skrevet i hånden, fordi
// projektet endnu ikke bruger genererede Supabase-databasetyper.
type RawGroupRef = {
  client_rate_per_hour: number | string;
  freelancer_rate_per_hour: number | string;
} | null;
type RawWorkCategoryRef = {
  name: string;
  work_category_groups: RawGroupRef | RawGroupRef[] | null;
};
type RawShiftRow = {
  status: "open" | "for_resale" | "assigned" | "cancelled";
  start_time: string;
  end_time: string;
  work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null;
};
type RawEventRow = {
  id: string;
  title: string;
  event_date: string;
  shifts: RawShiftRow[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // VIGTIGT: RLS alene er IKKE nok til at afgrænse til den rigtige
  // virksomhed her. RLS'ens "is_super_admin() OR company_id =
  // current_company_id()"-mønster betyder at en superadmin (som selv har
  // en admin_users-række, fx til Pepo) ser data på tværs af ALLE
  // virksomheder — ikke kun den virksomhed, hvis subdomæne der aktuelt
  // besøges i support-tilstand. company.id (fra subdomænet) filtreres
  // derfor eksplicit på hver forespørgsel, samme mønster som
  // settings/company og settings/calendar allerede bruger.
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const [eventsResult, freelancerCountResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        `id, title, event_date,
         shifts(status, start_time, end_time,
           work_categories(name, work_category_groups(client_rate_per_hour, freelancer_rate_per_hour)))`
      )
      .eq("company_id", company.id)
      .order("event_date", { ascending: true }),
    // Godkendte freelancer-profiler for DENNE virksomhed. En freelancer kan
    // arbejde for flere virksomheder, men hver har sin egen uafhængige
    // freelancer_profiles-række, så optælling sker direkte her.
    supabase
      .from("freelancer_profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("application_status", "approved"),
  ]);

  if (eventsResult.error) {
    console.error("AdminDashboardPage: kunne ikke hente events", eventsResult.error);
  }
  if (freelancerCountResult.error) {
    console.error("AdminDashboardPage: kunne ikke tælle freelancere", freelancerCountResult.error);
  }

  const events: DashboardEvent[] = ((eventsResult.data ?? []) as RawEventRow[]).map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    shifts: (e.shifts ?? []).map((s) => {
      const category = one(s.work_categories);
      const group = category ? one(category.work_category_groups) : null;
      return {
        category: category?.name ?? "",
        status: s.status,
        startTime: s.start_time.slice(0, 5),
        endTime: s.end_time.slice(0, 5),
        clientRatePerHour: Number(group?.client_rate_per_hour ?? 0),
        freelancerRatePerHour: Number(group?.freelancer_rate_per_hour ?? 0),
      };
    }),
  }));

  const today = todayIso();
  const year = new Date().getFullYear();

  return (
    <DashboardBoard
      monthly={monthlyFinancials(events, year)}
      eventCounts={eventCounts(events, today)}
      freelancerStats={freelancerHourStats(events, freelancerCountResult.count ?? 0, today)}
      upcoming={upcomingEvents(events, today)}
      recent={recentEvents(events, today)}
    />
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import DashboardBoardStream, { type DashboardMetrics } from "@/components/admin/DashboardBoardStream";
import DashboardMetricsSkeleton from "@/components/admin/DashboardMetricsSkeleton";
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

  // Hentes hurtigt og AWAITES her (en simpel head-count, ikke en tung join)
  // — bruges af getDashboardMetrics nedenfor, men skal under alle
  // omstændigheder kendes før metrics-bundtet kan beregnes, så der er ingen
  // gevinst ved at udskyde netop denne.
  const { count: freelancerCount, error: freelancerCountError } = await supabase
    .from("freelancer_profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .eq("application_status", "approved");

  if (freelancerCountError) {
    console.error("AdminDashboardPage: kunne ikke tælle freelancere", freelancerCountError);
  }

  const today = todayIso();
  const year = new Date().getFullYear();

  // Bevidst IKKE awaitet her, men sendt videre som et promise til
  // DashboardBoardStream (som læser det med Reacts use()-hook inde i sin
  // egen <Suspense>, se DashboardBoardStream.tsx). events-forespørgslen
  // herunder er en dyb join (shifts + work_categories + work_category_groups
  // på tværs af ALLE virksomhedens events nogensinde) og dermed typisk den
  // tungeste forespørgsel på siden — ved ikke at vente på den her kan
  // titlen/undertitlen nedenfor vises med det samme, mens resten af
  // Dashboard strømmer ind separat lige efter. Samme mønster som
  // app/freelancer/(protected)/page.tsx's openShiftsPromise.
  const metricsPromise = getDashboardMetrics(supabase, company.id, freelancerCount ?? 0, today, year);

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Dashboard</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Overblik over omsætning, udbetaling og kommende events
        </div>
      </div>

      <Suspense fallback={<DashboardMetricsSkeleton />}>
        <DashboardBoardStream promise={metricsPromise} />
      </Suspense>
    </div>
  );
}

async function getDashboardMetrics(
  supabase: SupabaseClient,
  companyId: string,
  freelancerCount: number,
  today: string,
  year: number
): Promise<DashboardMetrics> {
  const { data: eventsData, error } = await supabase
    .from("events")
    .select(
      `id, title, event_date,
       shifts(status, start_time, end_time,
         work_categories(name, work_category_groups(client_rate_per_hour, freelancer_rate_per_hour)))`
    )
    .eq("company_id", companyId)
    .order("event_date", { ascending: true });

  if (error) {
    console.error("getDashboardMetrics: kunne ikke hente events", error);
  }

  const events: DashboardEvent[] = ((eventsData ?? []) as RawEventRow[]).map((e) => ({
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

  return {
    monthly: monthlyFinancials(events, year),
    eventCounts: eventCounts(events, today),
    freelancerStats: freelancerHourStats(events, freelancerCount, today),
    upcoming: upcomingEvents(events, today),
    recent: recentEvents(events, today),
  };
}

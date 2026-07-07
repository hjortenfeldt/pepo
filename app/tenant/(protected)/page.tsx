import { createClient } from "@/lib/supabase/server";
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

export const dynamic = "force-dynamic";

// Rå formen af rækkerne Supabase returnerer. Skrevet i hånden, fordi
// projektet endnu ikke bruger genererede Supabase-databasetyper.
type RawWorkCategoryRef = {
  name: string;
  client_rate_per_hour: number | string;
  freelancer_rate_per_hour: number | string;
};
type RawShiftRow = {
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
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

  const [eventsResult, freelancerCountResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        `id, title, event_date,
         shifts(status, start_time, end_time,
           work_categories(name, client_rate_per_hour, freelancer_rate_per_hour))`
      )
      .order("event_date", { ascending: true }),
    // Godkendte freelancere for DENNE virksomhed — status hører til
    // freelancer_companies, da en freelancer kan arbejde for flere
    // virksomheder. RLS begrænser automatisk til admins egen virksomhed.
    supabase
      .from("freelancer_companies")
      .select("freelancer_id", { count: "exact", head: true })
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
      return {
        category: category?.name ?? "",
        status: s.status,
        startTime: s.start_time.slice(0, 5),
        endTime: s.end_time.slice(0, 5),
        clientRatePerHour: Number(category?.client_rate_per_hour ?? 0),
        freelancerRatePerHour: Number(category?.freelancer_rate_per_hour ?? 0),
      };
    }),
  }));

  const today = todayIso();
  const year = new Date().getFullYear();

  return (
    <DashboardBoard
      year={year}
      monthly={monthlyFinancials(events, year)}
      eventCounts={eventCounts(events, today)}
      freelancerStats={freelancerHourStats(events, freelancerCountResult.count ?? 0, today)}
      upcoming={upcomingEvents(events, today)}
      recent={recentEvents(events, today)}
    />
  );
}

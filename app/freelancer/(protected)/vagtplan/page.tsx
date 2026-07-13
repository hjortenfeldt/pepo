import { createClient, getAuthUser } from "@/lib/supabase/server";
import { todayIso } from "@/lib/format";
import { getActiveCompany } from "@/lib/freelancer";
import VagtplanClient, { type ScheduledShift } from "@/components/freelancer/VagtplanClient";

export const dynamic = "force-dynamic";

type RawEventRef = { title: string };
type RawVenueRef = { name: string | null };
type RawShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
  events: RawEventRef | RawEventRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export default async function FreelancerVagtplanPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  // Kun vagter hos den arbejdsplads freelanceren har valgt i "Mere" — se
  // Overblik-siden (page.tsx i overliggende mappe) for samme begrundelse.
  const activeCompany = await getActiveCompany(user.id);
  if (!activeCompany) return <VagtplanClient shifts={[]} />;

  const { data } = await supabase
    .from("shifts")
    .select("id, shift_date, start_time, end_time, status, events(title), client_venues(name)")
    .eq("assigned_freelancer_id", user.id)
    .eq("company_id", activeCompany.id)
    .gte("shift_date", todayIso())
    .order("shift_date")
    .order("start_time");

  const rows = (data ?? []) as unknown as RawShiftRow[];

  const shifts: ScheduledShift[] = rows.map((s) => ({
    id: s.id,
    date: s.shift_date,
    startTime: hhmm(s.start_time),
    endTime: hhmm(s.end_time),
    title: one(s.events)?.title ?? "Vagt",
    venue: one(s.client_venues)?.name ?? null,
    status: s.status,
  }));

  return <VagtplanClient shifts={shifts} />;
}

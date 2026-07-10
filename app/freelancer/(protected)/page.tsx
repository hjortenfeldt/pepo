import { createClient, getAuthUser } from "@/lib/supabase/server";
import { todayIso } from "@/lib/format";
import { getPrimaryCompany } from "@/lib/freelancer";
import OverviewClient, { type ActiveShift, type OpenShift, type UpcomingShift } from "@/components/freelancer/OverviewClient";

export const dynamic = "force-dynamic";

type RawVenueRef = { name: string | null; address: string | null; postal_code: string | null; city: string | null };
type RawEventRef = { title: string };
type RawCategoryRef = { name: string };

type RawShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
  events: RawEventRef | RawEventRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
  work_categories: RawCategoryRef | RawCategoryRef[] | null;
};

type RawTimeClockRow = { id: string; shift_id: string; clock_in_at: string };

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

function greetingDate(): string {
  const d = new Date();
  const weekday = WEEKDAYS[d.getDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export default async function FreelancerOverviewPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const today = todayIso();

  const [profileResult, myShiftsResult, openShiftsResult, activeClockResult, company] = await Promise.all([
    supabase.from("freelancer_profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("shifts")
      .select("id, shift_date, start_time, end_time, status, events(title), client_venues(name, address, postal_code, city)")
      .eq("assigned_freelancer_id", user.id)
      .eq("status", "assigned")
      .gte("shift_date", today)
      .order("shift_date")
      .order("start_time")
      .limit(6),
    supabase
      .from("shifts")
      .select("id, shift_date, start_time, end_time, status, work_categories(name)")
      .in("status", ["open", "for_resale"])
      .gte("shift_date", today)
      .order("shift_date")
      .order("start_time")
      .limit(6),
    supabase
      .from("time_clock_entries")
      .select("id, shift_id, clock_in_at")
      .eq("freelancer_id", user.id)
      .is("clock_out_at", null)
      .maybeSingle(),
    getPrimaryCompany(user.id),
  ]);

  const myShifts = (myShiftsResult.data ?? []) as unknown as RawShiftRow[];
  const openShiftsRaw = (openShiftsResult.data ?? []) as unknown as RawShiftRow[];
  const activeClock = activeClockResult.data as RawTimeClockRow | null;

  let existingInterestShiftIds: string[] = [];
  if (openShiftsRaw.length > 0) {
    const { data: interests } = await supabase
      .from("shift_interests")
      .select("shift_id")
      .eq("freelancer_id", user.id)
      .in(
        "shift_id",
        openShiftsRaw.map((s) => s.id)
      );
    existingInterestShiftIds = (interests ?? []).map((i) => i.shift_id as string);
  }

  // Den vagt, der evt. er stemplet ind på, vises i stempel-ur-kortet og
  // udelades derfor fra "Kommende vagter"-listen for ikke at optræde to
  // gange på samme skærm.
  const activeShiftRow = activeClock ? myShifts.find((s) => s.id === activeClock.shift_id) ?? null : null;

  const activeShift: ActiveShift | null =
    activeClock && activeShiftRow
      ? {
          entryId: activeClock.id,
          clockInAt: activeClock.clock_in_at,
          title: one(activeShiftRow.events)?.title ?? "Vagt",
          venue: one(activeShiftRow.client_venues)?.name ?? null,
          startTime: hhmm(activeShiftRow.start_time),
        }
      : null;

  const upcomingShifts: UpcomingShift[] = myShifts
    .filter((s) => s.id !== activeShiftRow?.id)
    .map((s) => ({
      id: s.id,
      date: s.shift_date,
      startTime: hhmm(s.start_time),
      endTime: hhmm(s.end_time),
      title: one(s.events)?.title ?? "Vagt",
      venue: one(s.client_venues)?.name ?? null,
      // Kan stemples ind på fra i dag og frem — knappen i UI'en styrer
      // selv om det giver mening (kun vist for i dag).
      isToday: s.shift_date === today,
    }));

  const openShifts: OpenShift[] = openShiftsRaw.map((s) => ({
    id: s.id,
    date: s.shift_date,
    startTime: hhmm(s.start_time),
    endTime: hhmm(s.end_time),
    categoryName: one(s.work_categories)?.name ?? "Ukendt kategori",
    alreadyApplied: existingInterestShiftIds.includes(s.id),
  }));

  const firstName = (profileResult.data?.full_name ?? "").split(" ")[0] || "der";

  return (
    <OverviewClient
      greetingName={firstName}
      greetingDate={greetingDate()}
      companyName={company?.name ?? null}
      activeShift={activeShift}
      upcomingShifts={upcomingShifts}
      openShifts={openShifts}
    />
  );
}

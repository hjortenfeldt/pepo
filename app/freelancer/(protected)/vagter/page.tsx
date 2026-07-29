import { createClient, getAuthUser } from "@/lib/supabase/server";
import { todayIso } from "@/lib/format";
import { getActiveProfile } from "@/lib/freelancer";
import VagterClient, { type MyShift, type OpenShift } from "@/components/freelancer/VagterClient";

export const dynamic = "force-dynamic";

type RawVenueRef = { name: string | null };
type RawEventRef = { title: string };
type RawCategoryRef = { name: string };

type RawMyShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
  events: RawEventRef | RawEventRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
  work_categories: RawCategoryRef | RawCategoryRef[] | null;
};

type RawOpenShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
  assigned_freelancer_id: string | null;
  events: RawEventRef | RawEventRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
  work_categories: RawCategoryRef | RawCategoryRef[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

/**
 * "Se alle"-destinationen for Overblik-sidens to sektioner (OverviewClient.tsx)
 * — samme forespørgsler som der (assigned/for_resale hhv. open/for_resale,
 * fra i dag og frem), blot UDEN dens `.limit(6)`, så freelanceren kan se
 * (og anmode om) alle sine kommende vagter, ikke kun de første 6. Begge
 * lister hentes samlet her (i stedet for kun den fane brugeren lander på),
 * så selve fane-skiftet i VagterClient er et rent klient-side toggle uden
 * gensidige sideindlæsninger — samme mønster som adminsystemets
 * ShiftBoard.tsx (initialTab + al data hentet på forhånd).
 */
export default async function FreelancerVagterPage({
  searchParams,
}: {
  // ?tab=mine|ledige — sat af "Se alle"-knapperne på Overblik.
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) return null;

  const { tab } = await searchParams;
  const initialTab: "mine" | "ledige" = tab === "ledige" ? "ledige" : "mine";

  const supabase = await createClient();
  const today = todayIso();

  const activeProfile = await getActiveProfile(user.id);
  const companyId = activeProfile?.company.id ?? "";

  const [myShiftsResult, openShiftsResult] = await Promise.all([
    supabase
      .from("shifts")
      .select(
        "id, shift_date, start_time, end_time, status, events(title), client_venues(name), work_categories(name)"
      )
      .eq("assigned_freelancer_id", user.id)
      .in("status", ["assigned", "for_resale"])
      .eq("company_id", companyId)
      .gte("shift_date", today)
      .order("shift_date")
      .order("start_time"),
    supabase
      .from("shifts")
      .select(
        "id, shift_date, start_time, end_time, status, assigned_freelancer_id, events(title), client_venues(name), work_categories(name)"
      )
      .eq("company_id", companyId)
      .in("status", ["open", "for_resale"])
      .gte("shift_date", today)
      .order("shift_date")
      .order("start_time"),
  ]);

  const myShiftRows = (myShiftsResult.data ?? []) as unknown as RawMyShiftRow[];
  const myShifts: MyShift[] = myShiftRows.map((s) => {
    const venue = one(s.client_venues);
    return {
      id: s.id,
      date: s.shift_date,
      startTime: hhmm(s.start_time),
      endTime: hhmm(s.end_time),
      title: one(s.events)?.title ?? "Vagt",
      categoryName: one(s.work_categories)?.name ?? "Ukendt kategori",
      venue: venue?.name ?? null,
      isForResale: s.status === "for_resale",
    };
  });

  // Samme "sælgeren ser ikke sin egen til-salg-vagt under Ledige vagter"-
  // filtrering som getOpenShifts i Overblik-sidens page.tsx.
  const openShiftRows = ((openShiftsResult.data ?? []) as unknown as RawOpenShiftRow[]).filter(
    (s) => s.assigned_freelancer_id !== user.id
  );

  let existingInterestShiftIds: string[] = [];
  if (openShiftRows.length > 0) {
    const { data: interests } = await supabase
      .from("shift_interests")
      .select("shift_id")
      .eq("freelancer_id", user.id)
      .in(
        "shift_id",
        openShiftRows.map((s) => s.id)
      );
    existingInterestShiftIds = (interests ?? []).map((i) => i.shift_id as string);
  }

  const openShifts: OpenShift[] = openShiftRows.map((s) => {
    const venue = one(s.client_venues);
    return {
      id: s.id,
      date: s.shift_date,
      startTime: hhmm(s.start_time),
      endTime: hhmm(s.end_time),
      title: one(s.events)?.title ?? "Vagt",
      categoryName: one(s.work_categories)?.name ?? "Ukendt kategori",
      venue: venue?.name ?? null,
      alreadyApplied: existingInterestShiftIds.includes(s.id),
    };
  });

  return <VagterClient myShifts={myShifts} openShifts={openShifts} initialTab={initialTab} />;
}

import { createClient, getAuthUser } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/format";
import { getActiveProfile } from "@/lib/freelancer";
import OverviewClient, { type ActiveShift, type OpenShift, type UpcomingShift } from "@/components/freelancer/OverviewClient";

export const dynamic = "force-dynamic";

type RawVenueRef = {
  name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};
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

export default async function FreelancerOverviewPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const today = todayIso();

  // Skal kendes FØR de øvrige forespørgsler, da både "Mine vagter" og
  // "Ledige vagter" nu filtreres til freelancerens aktive profil/virksomhed
  // (se getActiveProfile i lib/freelancer.ts) — uden dette ville en
  // freelancer med flere godkendte virksomheder se vagter fra ALLE sine
  // virksomheder blandet sammen på ét Overblik, uanset hvilken arbejdsplads
  // de har valgt i "Mere". Navn/billede vist herunder er DENNE profils
  // egne, ikke et fælles "brugernavn" — hentes derfor direkte fra
  // activeProfile, ikke fra et separat opslag på user.id.
  const activeProfile = await getActiveProfile(user.id);
  const companyId = activeProfile?.company.id ?? "";

  // Bevidst IKKE awaitet her, men sendt videre som et promise til
  // OverviewClient (som læser det med Reacts use()-hook inde i sin egen
  // <Suspense>). Denne forespørgsel scanner alle åbne/videresalgs-vagter på
  // tværs af kategorier og er derfor typisk den tungeste af de fem
  // forespørgsler på denne side — ved ikke at vente på den her, kan resten
  // af Overblik (hilsen, stempelur, Mine vagter) vises så snart DE er
  // klar, mens "Ledige vagter" strømmer ind separat lige efter.
  const openShiftsPromise = getOpenShifts(supabase, user.id, today, companyId);

  const [myShiftsResult, activeClockResult, companyGeofenceResult] = await Promise.all([
    supabase
      .from("shifts")
      .select(
        "id, shift_date, start_time, end_time, status, events(title), client_venues(name, address, postal_code, city, latitude, longitude)"
      )
      .eq("assigned_freelancer_id", user.id)
      .eq("status", "assigned")
      .eq("company_id", companyId)
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
    // Hentes direkte her i stedet for via getActiveProfile/lib/freelancer.ts's
    // cachede company-select, for ikke at skulle udvide den cachede
    // ActiveProfile-type (og dens FREELANCER_MEMBERSHIPS_TAG-cache-semantik)
    // for et felt der kun bruges på denne ene side.
    companyId
      ? supabase
          .from("companies")
          .select("checkin_geofence_enabled, checkin_radius_meters")
          .eq("id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const myShifts = (myShiftsResult.data ?? []) as unknown as RawShiftRow[];
  const activeClock = activeClockResult.data as RawTimeClockRow | null;
  const geofenceEnabled = companyGeofenceResult.data?.checkin_geofence_enabled ?? true;
  const geofenceRadiusMeters = companyGeofenceResult.data?.checkin_radius_meters ?? 1000;

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
    .map((s) => {
      const venue = one(s.client_venues);
      return {
        id: s.id,
        date: s.shift_date,
        startTime: hhmm(s.start_time),
        endTime: hhmm(s.end_time),
        title: one(s.events)?.title ?? "Vagt",
        venue: venue?.name ?? null,
        venueLat: venue?.latitude ?? null,
        venueLng: venue?.longitude ?? null,
        // Kan stemples ind på fra i dag og frem — knappen i UI'en styrer
        // selv om det giver mening (kun vist for i dag).
        isToday: s.shift_date === today,
      };
    });

  const fullName = activeProfile?.full_name ?? "";
  const firstName = fullName.split(" ")[0] || "der";

  return (
    <OverviewClient
      firstName={firstName}
      userFullName={fullName}
      userPhotoUrl={activeProfile?.profile_image_url ?? null}
      companyName={activeProfile?.company.name ?? null}
      companyLogoUrl={activeProfile?.company.logo_url ?? null}
      activeShift={activeShift}
      upcomingShifts={upcomingShifts}
      openShiftsPromise={openShiftsPromise}
      checkinGeofenceEnabled={geofenceEnabled}
      checkinRadiusMeters={geofenceRadiusMeters}
    />
  );
}

async function getOpenShifts(
  supabase: SupabaseClient,
  freelancerId: string,
  today: string,
  companyId: string
): Promise<OpenShift[]> {
  const { data: openShiftsData } = await supabase
    .from("shifts")
    .select("id, shift_date, start_time, end_time, status, work_categories(name)")
    .eq("company_id", companyId)
    .in("status", ["open", "for_resale"])
    .gte("shift_date", today)
    .order("shift_date")
    .order("start_time")
    .limit(6);

  const openShiftsRaw = (openShiftsData ?? []) as unknown as RawShiftRow[];

  let existingInterestShiftIds: string[] = [];
  if (openShiftsRaw.length > 0) {
    const { data: interests } = await supabase
      .from("shift_interests")
      .select("shift_id")
      .eq("freelancer_id", freelancerId)
      .in(
        "shift_id",
        openShiftsRaw.map((s) => s.id)
      );
    existingInterestShiftIds = (interests ?? []).map((i) => i.shift_id as string);
  }

  return openShiftsRaw.map((s) => ({
    id: s.id,
    date: s.shift_date,
    startTime: hhmm(s.start_time),
    endTime: hhmm(s.end_time),
    categoryName: one(s.work_categories)?.name ?? "Ukendt kategori",
    alreadyApplied: existingInterestShiftIds.includes(s.id),
  }));
}

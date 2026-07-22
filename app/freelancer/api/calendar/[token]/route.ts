import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFreelancerCalendarFeed, type FreelancerIcsEventInput, type FreelancerIcsShiftRow } from "@/lib/freelancer-ics";

export const dynamic = "force-dynamic";

/**
 * Offentligt, token-beskyttet kalender-feed til freelancerens egen "Sync med
 * din kalender" (se "Mere"-siden i freelancer-appen). Adskilt fra
 * app/tenant/api/calendar/[token]/route.ts, som er tenant-adminens feed over
 * ALLE virksomhedens events — denne feed viser kun events hvor DENNE
 * freelancer selv har en (ikke-annulleret) vagt, hos ÉN virksomhed ad gangen
 * (den virksomhed freelancer_profiles-rækken bag token'et hører til).
 *
 * Token'et er globalt unikt på tværs af alle freelancer_profiles-rækker (se
 * migrationen freelancer_profiles_calendar_feed_token), så — i modsætning til
 * tenant-feedet — er der intet behov for at krydstjekke mod et subdomæne
 * her; token'et alene er hele autorisationen. proxy.ts undtager denne route
 * fra login-redirectet på app.pepo.team, ligesom kalenderfeedet gør på
 * tenant-subdomænerne.
 */

type RawVenueRef = { address: string | null; postal_code: string | null; city: string | null };
type RawClientRef = { name: string | null; contact_person: string | null; contact_email: string | null; contact_phone: string | null };
type RawWorkCategoryRef = { name: string };
type RawAttachmentRow = { file_url: string; file_name: string | null };
type RawShiftRow = {
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "cancelled";
  assigned_freelancer_id: string | null;
  work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null;
};
type RawEventRow = {
  id: string;
  title: string;
  event_date: string;
  description: string | null;
  updated_at: string;
  clients: RawClientRef | RawClientRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
  shift_attachments: RawAttachmentRow[] | null;
  shifts: RawShiftRow[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

function fullAddress(venue: { address: string | null; postal_code: string | null; city: string | null } | null): string | null {
  if (!venue) return null;
  const line = [venue.address, [venue.postal_code, venue.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.replace(/\.ics$/i, "");

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("freelancer_profiles")
    .select("auth_user_id, company_id, companies(name)")
    .eq("calendar_feed_token", token)
    .maybeSingle();

  if (profileError || !profile) {
    return new NextResponse("Not found", { status: 404 });
  }

  const authUserId = profile.auth_user_id as string;
  const companyId = profile.company_id as string;
  const companyName = (one(profile.companies as { name: string } | { name: string }[] | null)?.name) ?? "Pepo";

  // Alle events hvor DENNE freelancer selv har en aktiv (ikke-annulleret)
  // vagt hos DENNE virksomhed — "for_resale" tæller stadig med, da
  // freelanceren nominelt stadig er tilknyttet vagten indtil en anden
  // faktisk overtager den.
  const { data: myShiftRows, error: myShiftsError } = await supabase
    .from("shifts")
    .select("event_id")
    .eq("company_id", companyId)
    .eq("assigned_freelancer_id", authUserId)
    .in("status", ["assigned", "for_resale"]);

  if (myShiftsError) {
    console.error("Freelancer-kalenderfeed: kunne ikke hente egne vagter", myShiftsError);
    return new NextResponse("Internal error", { status: 500 });
  }

  const eventIds = Array.from(new Set((myShiftRows ?? []).map((r) => r.event_id as string)));

  if (eventIds.length === 0) {
    const feed = buildFreelancerCalendarFeed(companyName, []);
    return new NextResponse(feed, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="pepo-mine-vagter.ics"',
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select(
      `id, title, event_date, description, updated_at,
       clients(name, contact_person, contact_email, contact_phone),
       client_venues(address, postal_code, city),
       shift_attachments(file_url, file_name),
       shifts(start_time, end_time, status, assigned_freelancer_id,
         work_categories(name))`
    )
    .in("id", eventIds)
    .order("event_date", { ascending: true });

  if (eventsError) {
    console.error("Freelancer-kalenderfeed: kunne ikke hente events", eventsError);
    return new NextResponse("Internal error", { status: 500 });
  }

  const rawEvents = (eventsData ?? []) as RawEventRow[];

  // Navnekort til KOLLEGAER-listen — DENNE virksomheds egen profil-navn pr.
  // login-id, da navnet kan variere pr. virksomhed (se
  // freelancer_profiles_per_company-migrationen). Inkluderer bevidst også
  // freelancerens EGET navn i kortet (bruges ikke til MIN VAGT-linjen, som
  // ikke viser navn, men koster ikke noget ekstra at have med).
  const assignedIds = Array.from(
    new Set(
      rawEvents.flatMap((e) => (e.shifts ?? []).map((s) => s.assigned_freelancer_id).filter((id): id is string => Boolean(id)))
    )
  );
  const freelancerNameMap = new Map<string, string>();
  if (assignedIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("freelancer_profiles")
      .select("auth_user_id, full_name")
      .eq("company_id", companyId)
      .in("auth_user_id", assignedIds);
    for (const p of profileRows ?? []) {
      freelancerNameMap.set(p.auth_user_id as string, p.full_name as string);
    }
  }

  function toShiftRow(s: RawShiftRow): FreelancerIcsShiftRow {
    return {
      category: one(s.work_categories)?.name ?? "",
      startTime: hhmm(s.start_time),
      endTime: hhmm(s.end_time),
      freelancerName: s.assigned_freelancer_id ? freelancerNameMap.get(s.assigned_freelancer_id) ?? null : null,
    };
  }

  const events: FreelancerIcsEventInput[] = rawEvents
    .map((e) => {
      const client = one(e.clients);
      const venue = one(e.client_venues);
      const activeShifts = (e.shifts ?? []).filter((s) => s.status !== "cancelled");

      const myShifts = activeShifts
        .filter((s) => s.assigned_freelancer_id === authUserId)
        .map(toShiftRow);
      const colleagueShifts = activeShifts
        .filter((s) => s.assigned_freelancer_id !== authUserId)
        .map(toShiftRow);

      return {
        id: e.id,
        title: e.title,
        eventDateIso: e.event_date,
        companyName,
        venueAddress: fullAddress(venue),
        clientName: client?.name || client?.contact_person || "",
        clientEmail: client?.contact_email ?? null,
        clientPhone: client?.contact_phone ?? null,
        briefing: e.description,
        attachments: (e.shift_attachments ?? []).map((a) => ({ url: a.file_url, name: a.file_name })),
        myShifts,
        colleagueShifts,
        updatedAtIso: e.updated_at,
      };
    })
    // Et event kan i teorien have mistet freelancerens eneste aktive vagt
    // mellem forespørgslerne ovenfor (fx hvis den lige er blevet annulleret)
    // — spring det i så fald over frem for at bygge en VEVENT uden nogen
    // myShifts at udregne DTSTART/DTEND fra.
    .filter((e) => e.myShifts.length > 0);

  const feed = buildFreelancerCalendarFeed(companyName, events);

  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pepo-mine-vagter.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSubdomain } from "@/lib/tenant";
import { buildCalendarFeed, type IcsEventInput, type IcsShiftInput } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * Offentligt, token-beskyttet kalender-feed til "Sync med kalender".
 * Kaldes af kalenderapps (Google/Apple/Outlook) uden login — proxy.ts
 * undtager denne route fra login-redirectet, men rewriter stadig
 * hostnavnet (fx kulturbyen.pepo.team) til /tenant-præfikset, så vi kan
 * bruge subdomænet til at finde virksomheden. Selve token'et er den
 * hemmelighed der beskytter feedet.
 *
 * URL'en vises til brugeren med et ".ics"-endelse (fx
 * /api/calendar/<token>.ics), som visse kalenderklienter forventer — det
 * er ikke et separat routesegment, men strippes af her.
 */

type RawVenueRef = {
  address: string | null;
  postal_code: string | null;
  city: string | null;
};
type RawClientRef = { name: string | null; contact_person: string | null; contact_email: string | null; contact_phone: string | null };
type RawWorkCategoryRef = { name: string };
type RawFreelancerRef = { full_name: string };
type RawAttachmentRow = { file_url: string };
type RawShiftRow = {
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "cancelled";
  work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null;
  freelancer_profiles: RawFreelancerRef | RawFreelancerRef[] | null;
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

// Fuld adressestreng til LOCATION/EVENT-STED — i modsætning til
// lib/format.ts' venueLabel() vil vi her IKKE falde tilbage til et
// "Unavngivet arbejdssted"-label, kun den faktiske adresse eller null.
function fullAddress(venue: { address: string | null; postal_code: string | null; city: string | null } | null): string | null {
  if (!venue) return null;
  const line = [venue.address, [venue.postal_code, venue.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

function shiftStatusText(shift: RawShiftRow): string {
  const assignee = one(shift.freelancer_profiles)?.full_name ?? null;
  if (shift.status === "assigned") return assignee ?? "Tildelt";
  if (shift.status === "for_resale") return assignee ? `${assignee} (til salg)` : "Til salg";
  return "Mangler";
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.replace(/\.ics$/i, "");

  const slug = await getCurrentSubdomain();
  if (!slug) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = createAdminClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, slug, calendar_feed_token")
    .eq("slug", slug)
    .maybeSingle();

  if (companyError || !company || company.calendar_feed_token !== token) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select(
      `id, title, event_date, description, updated_at,
       clients(name, contact_person, contact_email, contact_phone),
       client_venues(address, postal_code, city),
       shift_attachments(file_url),
       shifts(start_time, end_time, status,
         work_categories(name),
         freelancer_profiles(full_name))`
    )
    .eq("company_id", company.id)
    .order("event_date", { ascending: true });

  if (eventsError) {
    console.error("Kalenderfeed: kunne ikke hente events", eventsError);
    return new NextResponse("Internal error", { status: 500 });
  }

  const events: IcsEventInput[] = ((eventsData ?? []) as RawEventRow[]).map((e) => {
    const client = one(e.clients);
    const venue = one(e.client_venues);
    const activeShifts = (e.shifts ?? []).filter((s) => s.status !== "cancelled");

    const shifts: IcsShiftInput[] = activeShifts.map((s) => ({
      category: one(s.work_categories)?.name ?? "",
      startTime: hhmm(s.start_time),
      endTime: hhmm(s.end_time),
      statusText: shiftStatusText(s),
    }));

    return {
      id: e.id,
      title: e.title,
      eventDateIso: e.event_date,
      tenantSlug: company.slug,
      venueAddress: fullAddress(venue),
      clientName: client?.name || client?.contact_person || "",
      clientEmail: client?.contact_email ?? null,
      clientPhone: client?.contact_phone ?? null,
      briefing: e.description,
      attachmentUrls: (e.shift_attachments ?? []).map((a) => a.file_url),
      shifts,
      updatedAtIso: e.updated_at,
    };
  });

  const feed = buildCalendarFeed(events);

  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pepo.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

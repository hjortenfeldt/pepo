import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSubdomain } from "@/lib/tenant";
import { buildCalendarFeed, type IcsEventInput, type IcsShiftInput } from "@/lib/ics";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

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
type RawAttachmentRow = { file_url: string; file_name: string | null };
// assigned_freelancer_id er login-id'et (auth.users.id), IKKE
// freelancer_profiles.id — den fremmednøgle peger nu på auth.users, så
// PostgREST kan ikke længere indlejre freelancer_profiles direkte her.
// Navnet slås op bagefter via freelancerNameMap (se nedenfor).
type RawInterestRow = { status: "pending" | "accepted" | "declined" };
type RawShiftRow = {
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "cancelled";
  assigned_freelancer_id: string | null;
  work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null;
  shift_interests: RawInterestRow[] | null;
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

function shiftStatusText(shift: RawShiftRow, freelancerNameMap: Map<string, string>): string {
  const assignee = shift.assigned_freelancer_id ? freelancerNameMap.get(shift.assigned_freelancer_id) ?? null : null;
  if (shift.status === "assigned") return assignee ?? "Tildelt";
  if (shift.status === "for_resale") return assignee ? `${assignee} (til salg)` : "Til salg";

  // "open" (ubesat): admin kan ellers ikke se i sin kalender-app om der
  // ligger en vagtanmodning, de endnu ikke har reageret på — "pending" er
  // netop dén tilstand (til forskel fra "declined", som admin allerede har
  // afvist, og som derfor stadig bare skal vise "Mangler").
  const hasPendingInterest = (shift.shift_interests ?? []).some((i) => i.status === "pending");
  return hasPendingInterest ? "Anmodet" : "Mangler";
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
    .select("id, name, slug, calendar_feed_token")
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
       shift_attachments(file_url, file_name),
       shifts(start_time, end_time, status, assigned_freelancer_id,
         work_categories(name),
         shift_interests(status))`
    )
    .eq("company_id", company.id)
    .order("event_date", { ascending: true });

  if (eventsError) {
    console.error("Kalenderfeed: kunne ikke hente events", eventsError);
    return new NextResponse("Internal error", { status: 500 });
  }

  const rawEvents = (eventsData ?? []) as RawEventRow[];

  // Navnekort til vagtstatus-teksten — DENNE virksomheds egen profil-navn
  // for hvert login-id, da navnet nu kan variere pr. virksomhed (se
  // freelancer_profiles_per_company-migrationen).
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
      .eq("company_id", company.id)
      .in("auth_user_id", assignedIds);
    for (const p of profileRows ?? []) {
      freelancerNameMap.set(p.auth_user_id as string, p.full_name as string);
    }
  }

  const events: IcsEventInput[] = rawEvents.map((e) => {
    const client = one(e.clients);
    const venue = one(e.client_venues);
    const activeShifts = (e.shifts ?? []).filter((s) => s.status !== "cancelled");

    const shifts: IcsShiftInput[] = activeShifts.map((s) => ({
      category: one(s.work_categories)?.name ?? "",
      startTime: hhmm(s.start_time),
      endTime: hhmm(s.end_time),
      statusText: shiftStatusText(s, freelancerNameMap),
    }));

    return {
      id: e.id,
      title: e.title,
      eventDateIso: e.event_date,
      tenantName: company.name || company.slug,
      editUrl: `https://${company.slug}.${ROOT_DOMAIN}/shifts/event/${e.id}`,
      venueAddress: fullAddress(venue),
      clientName: client?.name || client?.contact_person || "",
      clientEmail: client?.contact_email ?? null,
      clientPhone: client?.contact_phone ?? null,
      briefing: e.description,
      attachments: (e.shift_attachments ?? []).map((a) => ({ url: a.file_url, name: a.file_name })),
      shifts,
      updatedAtIso: e.updated_at,
    };
  });

  const feed = buildCalendarFeed(company.name, events);

  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pepo.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

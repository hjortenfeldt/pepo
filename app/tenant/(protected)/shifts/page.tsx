import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import ShiftBoard from "@/components/admin/ShiftBoard";
import { venueLabel } from "@/lib/format";
import type {
  EventListItem,
  ClientOption,
  CategoryOption,
  FreelancerOption,
  ShiftStatus,
  InterestStatus,
} from "@/lib/admin-types";

export const metadata: Metadata = { title: "Vagter" };
export const dynamic = "force-dynamic";

// Rå formen af rækkerne Supabase returnerer. Skrevet i hånden, fordi
// projektet endnu ikke bruger genererede Supabase-databasetyper.
type RawVenueRef = {
  id: string;
  name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
};
type RawClientRef = { name: string | null; contact_person: string | null };
type RawWorkCategoryRef = { name: string; icon: string | null };
type RawAttachmentRow = { id: string; file_name: string; file_url: string; file_type: string | null };
// assigned_freelancer_id og shift_interests.freelancer_id er auth-login-id'er
// (auth.users.id), IKKE freelancer_profiles.id — PostgREST kan derfor ikke
// længere indlejre freelancer_profiles direkte her (den fremmednøgle peger
// nu på auth.users, ikke på freelancer_profiles), navnet slås i stedet op
// bagefter via freelancerNameMap (se nedenfor).
type RawInterestRow = { freelancer_id: string; status: InterestStatus };
type RawShiftRow = {
  id: string;
  category_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  previous_status: ShiftStatus | null;
  assigned_freelancer_id: string | null;
  work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null;
  shift_interests: RawInterestRow[] | null;
};
type RawEventRow = {
  id: string;
  title: string;
  event_date: string;
  description: string | null;
  client_id: string;
  venue_id: string | null;
  clients: RawClientRef | RawClientRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
  shift_attachments: RawAttachmentRow[] | null;
  shifts: RawShiftRow[] | null;
};
type RawClientWithVenuesRow = {
  id: string;
  name: string | null;
  cvr_number: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  client_venues: RawVenueRef[] | null;
};
type RawCategoryRow = { id: string; name: string; icon: string | null };
// Godkendte freelancer-profiler for DENNE virksomhed. id er profilens eget
// id, men shifts/shift_interests bruger auth_user_id (login-id'et) til
// tildeling — se FreelancerOption-mapningen nedenfor.
type RawFreelancerProfileRow = { auth_user_id: string; full_name: string };
type RawFreelancerCategoryRow = { freelancer_id: string; work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null };

// PostgREST returnerer en til-én-relation som enten ét objekt eller et
// array med ét objekt, afhængigt af relationstype — håndteres defensivt
// samme sted som i freelancers/page.tsx og categories/page.tsx.
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export default async function AdminShiftsPage() {
  const supabase = await createClient();

  // Se page.tsx (dashboard) for hvorfor company.id skal filtreres
  // eksplicit — RLS alene skelner ikke mellem "min egen virksomhed" og
  // "virksomheden hvis subdomæne jeg besøger som superadmin i support-tilstand".
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const [eventsResult, clientsResult, categoriesResult, freelancerProfilesResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        `id, title, event_date, description, client_id, venue_id,
         clients(name, contact_person),
         client_venues(id, name, address, postal_code, city),
         shift_attachments(id, file_name, file_url, file_type),
         shifts(id, category_id, shift_date, start_time, end_time, status, previous_status,
           assigned_freelancer_id,
           work_categories(name, icon),
           shift_interests(freelancer_id, status))`
      )
      .eq("company_id", company.id)
      .order("event_date", { ascending: true }),
    supabase
      .from("clients")
      .select(
        "id, name, cvr_number, contact_person, contact_phone, contact_email, notes, client_venues(id, client_id, name, address, postal_code, city)"
      )
      .eq("company_id", company.id)
      .order("name"),
    supabase
      .from("work_categories")
      .select("id, name, icon")
      .eq("company_id", company.id)
      .order("name"),
    // Godkendte profiler for DENNE virksomhed — id her er profilens eget id
    // (bruges ikke til tildeling), auth_user_id er login-id'et shifts
    // rent faktisk gemmer i assigned_freelancer_id.
    supabase
      .from("freelancer_profiles")
      .select("auth_user_id, full_name")
      .eq("company_id", company.id)
      .eq("application_status", "approved"),
  ]);

  if (eventsResult.error) {
    console.error("AdminShiftsPage: kunne ikke hente events", eventsResult.error);
  }
  if (clientsResult.error) {
    console.error("AdminShiftsPage: kunne ikke hente kunder", clientsResult.error);
  }
  if (categoriesResult.error) {
    console.error("AdminShiftsPage: kunne ikke hente jobfunktioner", categoriesResult.error);
  }
  if (freelancerProfilesResult.error) {
    console.error("AdminShiftsPage: kunne ikke hente freelancere", freelancerProfilesResult.error);
  }

  const approvedProfiles = (freelancerProfilesResult.data ?? []) as RawFreelancerProfileRow[];
  const authIds = approvedProfiles.map((p) => p.auth_user_id);

  // freelancer_categories.freelancer_id peger på auth.users(id) (login-
  // id'et) — jobfunktioner er bevidst fælles på tværs af en persons
  // virksomheder, ikke splittet pr. profil (se lib/freelancer.ts).
  const { data: categoryRowsData, error: categoryRowsError } =
    authIds.length > 0
      ? await supabase
          .from("freelancer_categories")
          .select("freelancer_id, work_categories(name)")
          .in("freelancer_id", authIds)
      : { data: [] as RawFreelancerCategoryRow[], error: null };
  if (categoryRowsError) {
    console.error("AdminShiftsPage: kunne ikke hente freelancer-kategorier", categoryRowsError);
  }

  const categoriesByAuthId = new Map<string, string[]>();
  for (const row of (categoryRowsData ?? []) as RawFreelancerCategoryRow[]) {
    const wc = one(row.work_categories);
    if (!wc) continue;
    const list = categoriesByAuthId.get(row.freelancer_id) ?? [];
    list.push(wc.name);
    categoriesByAuthId.set(row.freelancer_id, list);
  }

  // Navnekort til visning af tildelt/interesseret freelancer på en vagt —
  // DENNE virksomheds egen profil-navn for hvert login-id, da navnet nu kan
  // variere pr. virksomhed.
  const freelancerNameMap = new Map<string, string>();
  for (const p of approvedProfiles) {
    freelancerNameMap.set(p.auth_user_id, p.full_name);
  }

  const events: EventListItem[] = ((eventsResult.data ?? []) as RawEventRow[]).map((e) => {
    const client = one(e.clients);
    const venue = one(e.client_venues);
    return {
      id: e.id,
      title: e.title,
      eventDate: e.event_date,
      description: e.description,
      clientId: e.client_id,
      clientName: client?.name || client?.contact_person || "(uden navn)",
      venueId: e.venue_id,
      venueLabel: venue
        ? venueLabel({
            name: venue.name,
            address: venue.address,
            postalCode: venue.postal_code,
            city: venue.city,
          })
        : null,
      attachments: (e.shift_attachments ?? []).map((a) => ({
        id: a.id,
        fileName: a.file_name,
        fileUrl: a.file_url,
        fileType: a.file_type,
      })),
      shifts: (e.shifts ?? []).map((s) => {
        const category = one(s.work_categories);
        return {
          id: s.id,
          eventId: e.id,
          categoryId: s.category_id,
          category: category?.name ?? "",
          categoryIcon: category?.icon ?? null,
          shiftDate: s.shift_date,
          startTime: hhmm(s.start_time),
          endTime: hhmm(s.end_time),
          status: s.status,
          previousStatus: s.previous_status,
          assignedFreelancerId: s.assigned_freelancer_id,
          assignedFreelancerName: s.assigned_freelancer_id
            ? freelancerNameMap.get(s.assigned_freelancer_id) ?? null
            : null,
          interests: (s.shift_interests ?? []).map((i) => ({
            freelancerId: i.freelancer_id,
            freelancerName: freelancerNameMap.get(i.freelancer_id) ?? "",
            status: i.status,
          })),
        };
      }),
    };
  });

  const clients: ClientOption[] = ((clientsResult.data ?? []) as RawClientWithVenuesRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    cvrNumber: c.cvr_number,
    contactPerson: c.contact_person,
    contactPhone: c.contact_phone,
    contactEmail: c.contact_email,
    notes: c.notes,
    venues: (c.client_venues ?? []).map((v) => ({
      id: v.id,
      clientId: c.id,
      name: v.name,
      address: v.address,
      postalCode: v.postal_code,
      city: v.city,
    })),
  }));

  const categories: CategoryOption[] = ((categoriesResult.data ?? []) as RawCategoryRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
  }));

  const freelancers: FreelancerOption[] = approvedProfiles.map((p) => ({
    id: p.auth_user_id,
    fullName: p.full_name,
    categories: categoriesByAuthId.get(p.auth_user_id) ?? [],
  }));

  return (
    <ShiftBoard events={events} clients={clients} categories={categories} freelancers={freelancers} />
  );
}

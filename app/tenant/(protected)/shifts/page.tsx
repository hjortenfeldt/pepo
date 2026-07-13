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
type RawFreelancerRef = { full_name: string };
type RawAttachmentRow = { id: string; file_name: string; file_url: string; file_type: string | null };
type RawInterestRow = {
  freelancer_id: string;
  status: InterestStatus;
  freelancer_profiles: RawFreelancerRef | RawFreelancerRef[] | null;
};
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
  freelancer_profiles: RawFreelancerRef | RawFreelancerRef[] | null;
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
type RawFreelancerProfileOption = {
  id: string;
  full_name: string;
  freelancer_categories: { work_categories: RawWorkCategoryRef | RawWorkCategoryRef[] | null }[] | null;
};
// Godkendelsesstatus hører til freelancer_companies (en freelancer kan
// arbejde for flere virksomheder), så listen tager udgangspunkt der.
type RawFreelancerMembershipRow = {
  freelancer_profiles: RawFreelancerProfileOption | RawFreelancerProfileOption[] | null;
};

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

  const [eventsResult, clientsResult, categoriesResult, freelancersResult] = await Promise.all([
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
           freelancer_profiles(full_name),
           shift_interests(freelancer_id, status, freelancer_profiles(full_name)))`
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
    supabase
      .from("freelancer_companies")
      .select("freelancer_profiles(id, full_name, freelancer_categories(work_categories(name)))")
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
  if (freelancersResult.error) {
    console.error("AdminShiftsPage: kunne ikke hente freelancere", freelancersResult.error);
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
        const assignee = one(s.freelancer_profiles);
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
          assignedFreelancerName: assignee?.full_name ?? null,
          interests: (s.shift_interests ?? []).map((i) => ({
            freelancerId: i.freelancer_id,
            freelancerName: one(i.freelancer_profiles)?.full_name ?? "",
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

  const freelancers: FreelancerOption[] = ((freelancersResult.data ?? []) as RawFreelancerMembershipRow[])
    .map((m) => one(m.freelancer_profiles))
    .filter((f): f is RawFreelancerProfileOption => f !== null)
    .map((f) => {
      const cats = (f.freelancer_categories ?? [])
        .map((fc) => {
          const wc = fc.work_categories;
          if (!wc) return undefined;
          return Array.isArray(wc) ? wc[0]?.name : wc.name;
        })
        .filter((name: string | undefined): name is string => Boolean(name));
      return { id: f.id, fullName: f.full_name, categories: cats };
    });

  return (
    <ShiftBoard events={events} clients={clients} categories={categories} freelancers={freelancers} />
  );
}

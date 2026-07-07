import { createClient } from "@/lib/supabase/server";
import FreelancerBoard from "@/components/admin/FreelancerBoard";
import type { FreelancerListItem } from "@/lib/admin-types";

export const dynamic = "force-dynamic";

// Rå formen af en række, som Supabase returnerer for select-kaldet nedenfor.
// Skrevet i hånden, fordi projektet endnu ikke bruger genererede
// Supabase-databasetyper (`supabase gen types typescript`).
//
// En freelancer kan arbejde for flere virksomheder, så godkendelsesstatus
// hører til freelancer_companies (koblingen til DENNE virksomhed), ikke
// til freelancer_profiles selv — derfor tager listen udgangspunkt i
// freelancer_companies og henter profilen som en relation. RLS på
// freelancer_companies sørger for at kun rækker for admins egen
// virksomhed kommer med.
type WorkCategoryRef = { name: string };
type RawProfile = {
  id: string;
  full_name: string;
  email: string | null;
  gender: string | null;
  birth_date: string;
  location: string | null;
  phone: string;
  bio: string | null;
  profile_image_url: string | null;
  social_media_url: string | null;
  freelancer_categories: { work_categories: WorkCategoryRef | WorkCategoryRef[] | null }[] | null;
};
type RawMembershipRow = {
  application_status: "pending" | "approved" | "rejected";
  applied_at: string;
  freelancer_profiles: RawProfile | RawProfile[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function AdminFreelancersPage() {
  const supabase = await createClient();

  const { data: memberships, error } = await supabase
    .from("freelancer_companies")
    .select(
      `application_status, applied_at,
       freelancer_profiles(id, full_name, email, gender, birth_date, location, phone, bio,
         profile_image_url, social_media_url, freelancer_categories(work_categories(name)))`
    )
    .order("applied_at", { ascending: false });

  if (error) {
    console.error("AdminFreelancersPage: kunne ikke hente profiler", error);
  }

  // NB: Uden genererede Supabase-databasetyper (Database-typen) er de
  // indlejrede relationer typet løst her. PostgREST kan returnere en
  // til-én-relation som enten ét objekt eller et array med ét objekt,
  // afhængigt af relationstype — håndteres defensivt via one().
  const items: FreelancerListItem[] = ((memberships ?? []) as RawMembershipRow[])
    .map((m) => {
      const p = one(m.freelancer_profiles);
      if (!p) return null;

      const categories: string[] = (p.freelancer_categories ?? [])
        .map((fc) => {
          const wc = fc.work_categories;
          if (!wc) return undefined;
          return Array.isArray(wc) ? wc[0]?.name : wc.name;
        })
        .filter((name: string | undefined): name is string => Boolean(name));

      const item: FreelancerListItem = {
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        gender: p.gender,
        birthDate: p.birth_date,
        location: p.location,
        phone: p.phone,
        bio: p.bio,
        profileImageUrl: p.profile_image_url,
        socialMediaUrl: p.social_media_url,
        applicationStatus: m.application_status,
        appliedAt: m.applied_at,
        categories,
      };
      return item;
    })
    .filter((item): item is FreelancerListItem => item !== null);

  return <FreelancerBoard freelancers={items} />;
}

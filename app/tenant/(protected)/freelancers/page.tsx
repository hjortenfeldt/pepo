import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import FreelancerBoard from "@/components/admin/FreelancerBoard";
import type { FreelancerListItem, CategoryOption } from "@/lib/admin-types";

export const metadata: Metadata = { title: "Freelancere" };
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
type WorkCategoryRef = { id: string; name: string; icon: string | null };
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
  has_license: boolean;
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
         profile_image_url, social_media_url, has_license, freelancer_categories(work_categories(id, name, icon)))`
    )
    .order("applied_at", { ascending: false });

  if (error) {
    console.error("AdminFreelancersPage: kunne ikke hente profiler", error);
  }

  type RawCategoryRow = { id: string; name: string; icon: string | null };
  const { data: categoriesData, error: categoriesError } = await supabase
    .from("work_categories")
    .select("id, name, icon")
    .order("name", { ascending: true });

  if (categoriesError) {
    console.error("AdminFreelancersPage: kunne ikke hente jobfunktioner", categoriesError);
  }

  const allCategories: CategoryOption[] = ((categoriesData ?? []) as RawCategoryRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
  }));

  // NB: Uden genererede Supabase-databasetyper (Database-typen) er de
  // indlejrede relationer typet løst her. PostgREST kan returnere en
  // til-én-relation som enten ét objekt eller et array med ét objekt,
  // afhængigt af relationstype — håndteres defensivt via one().
  const items: FreelancerListItem[] = ((memberships ?? []) as RawMembershipRow[])
    .map((m) => {
      const p = one(m.freelancer_profiles);
      if (!p) return null;

      const categories: { id: string; name: string; icon: string | null }[] = (p.freelancer_categories ?? [])
        .map((fc) => {
          const wc = fc.work_categories;
          if (!wc) return undefined;
          return Array.isArray(wc) ? wc[0] : wc;
        })
        .filter((wc): wc is WorkCategoryRef => Boolean(wc))
        .map((wc) => ({ id: wc.id, name: wc.name, icon: wc.icon }));

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
        hasLicense: p.has_license,
      };
      return item;
    })
    .filter((item): item is FreelancerListItem => item !== null);

  return <FreelancerBoard freelancers={items} allCategories={allCategories} />;
}

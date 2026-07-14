import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import FreelancerBoard from "@/components/admin/FreelancerBoard";
import type { FreelancerListItem, CategoryOption } from "@/lib/admin-types";

export const metadata: Metadata = { title: "Freelancere" };
export const dynamic = "force-dynamic";

// Rå formen af en række, som Supabase returnerer for select-kaldet nedenfor.
// Skrevet i hånden, fordi projektet endnu ikke bruger genererede
// Supabase-databasetyper (`supabase gen types typescript`).
//
// En freelancer kan arbejde for flere virksomheder, men hver virksomhed har
// sin egen, fuldstændigt uafhængige freelancer_profiles-række (navn,
// billede, ansøgningsstatus osv.) — se migrationen
// freelancer_profiles_per_company. Listen tager derfor udgangspunkt
// direkte i freelancer_profiles, filtreret på company_id.
type RawProfile = {
  id: string;
  auth_user_id: string;
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
  application_status: "pending" | "approved" | "rejected";
  applied_at: string;
};
type WorkCategoryRef = { id: string; name: string; icon: string | null };
type RawFreelancerCategoryRow = {
  freelancer_id: string;
  work_categories: WorkCategoryRef | WorkCategoryRef[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function AdminFreelancersPage() {
  const supabase = await createClient();

  // Se dashboard-page.tsx for hvorfor company.id skal filtreres eksplicit
  // — RLS alene skelner ikke mellem admins egen virksomhed og den
  // virksomhed en superadmin besøger i support-tilstand.
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const { data: profiles, error } = await supabase
    .from("freelancer_profiles")
    .select(
      `id, auth_user_id, full_name, email, gender, birth_date, location, phone, bio,
       profile_image_url, social_media_url, has_license, application_status, applied_at`
    )
    .eq("company_id", company.id)
    .order("applied_at", { ascending: false });

  if (error) {
    console.error("AdminFreelancersPage: kunne ikke hente profiler", error);
  }

  type RawCategoryRow = { id: string; name: string; icon: string | null };
  const { data: categoriesData, error: categoriesError } = await supabase
    .from("work_categories")
    .select("id, name, icon")
    .eq("company_id", company.id)
    .order("name", { ascending: true });

  if (categoriesError) {
    console.error("AdminFreelancersPage: kunne ikke hente jobfunktioner", categoriesError);
  }

  const allCategories: CategoryOption[] = ((categoriesData ?? []) as RawCategoryRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
  }));

  const rawProfiles = (profiles ?? []) as RawProfile[];
  const authIds = rawProfiles.map((p) => p.auth_user_id);

  // freelancer_categories.freelancer_id peger på login-id'et (auth_user_id),
  // ikke på denne profils eget id — jobfunktioner er bevidst fælles på
  // tværs af en persons virksomheder (se lib/freelancer.ts). Da
  // freelancer_categories ikke længere har en fremmednøgle direkte til
  // freelancer_profiles, kan PostgREST ikke indlejre den — hentes derfor
  // separat og kobles i JS.
  const { data: categoryRowsData, error: categoryRowsError } =
    authIds.length > 0
      ? await supabase
          .from("freelancer_categories")
          .select("freelancer_id, work_categories(id, name, icon)")
          .in("freelancer_id", authIds)
      : { data: [] as RawFreelancerCategoryRow[], error: null };
  if (categoryRowsError) {
    console.error("AdminFreelancersPage: kunne ikke hente freelancer-kategorier", categoryRowsError);
  }

  const categoriesByAuthId = new Map<string, WorkCategoryRef[]>();
  for (const row of (categoryRowsData ?? []) as RawFreelancerCategoryRow[]) {
    const wc = one(row.work_categories);
    if (!wc) continue;
    const list = categoriesByAuthId.get(row.freelancer_id) ?? [];
    list.push(wc);
    categoriesByAuthId.set(row.freelancer_id, list);
  }

  const items: FreelancerListItem[] = rawProfiles.map((p) => ({
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
    applicationStatus: p.application_status,
    appliedAt: p.applied_at,
    categories: (categoriesByAuthId.get(p.auth_user_id) ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
    })),
    hasLicense: p.has_license,
  }));

  return <FreelancerBoard freelancers={items} allCategories={allCategories} />;
}

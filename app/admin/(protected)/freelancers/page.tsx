import { createClient } from "@/lib/supabase/server";
import FreelancerBoard from "@/components/admin/FreelancerBoard";
import type { FreelancerListItem } from "@/lib/admin-types";

export const dynamic = "force-dynamic";

// Rå formen af en række, som Supabase returnerer for select-kaldet nedenfor.
// Skrevet i hånden, fordi projektet endnu ikke bruger genererede
// Supabase-databasetyper (`supabase gen types typescript`).
type WorkCategoryRef = { name: string };
type RawFreelancerRow = {
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
  application_status: "pending" | "approved" | "rejected";
  created_at: string;
  freelancer_categories: { work_categories: WorkCategoryRef | WorkCategoryRef[] | null }[] | null;
};

export default async function AdminFreelancersPage() {
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("freelancer_profiles")
    .select(
      "id, full_name, email, gender, birth_date, location, phone, bio, profile_image_url, social_media_url, application_status, created_at, freelancer_categories(work_categories(name))"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("AdminFreelancersPage: kunne ikke hente profiler", error);
  }

  // NB: Uden genererede Supabase-databasetyper (Database-typen) er den
  // indlejrede "work_categories"-relation typet løst her. PostgREST
  // returnerer den som ét objekt (many-to-one via category_id), men vi
  // håndterer defensivt begge former for at være robuste over for det.
  const items: FreelancerListItem[] = ((profiles ?? []) as RawFreelancerRow[]).map((p) => {
    const categories: string[] = (p.freelancer_categories ?? [])
      .map((fc) => {
        const wc = fc.work_categories;
        if (!wc) return undefined;
        return Array.isArray(wc) ? wc[0]?.name : wc.name;
      })
      .filter((name: string | undefined): name is string => Boolean(name));

    return {
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
      appliedAt: p.created_at,
      categories,
    };
  });

  return <FreelancerBoard freelancers={items} />;
}

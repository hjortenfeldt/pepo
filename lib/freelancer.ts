import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type FreelancerMembership = {
  application_status: "pending" | "approved" | "rejected";
  companies: { id: string; name: string; slug: string } | null;
};

/**
 * Firmaer freelanceren har ansøgt til/arbejder for, med status. Bruges af
 * (protected)/layout.tsx til at afgøre om appen skal vise fuldt indhold,
 * en "afventer godkendelse"-skærm, eller sende brugeren tilbage til
 * ansøgningssiden. Service role, da vi her slår op i to tabeller på én
 * gang uden at gå gennem RLS-scoping to gange.
 *
 * MVP-bemærkning: en freelancer kan i teorien være godkendt hos flere
 * virksomheder samtidig (se pepo-migration-multi-tenant.sql), men appen
 * viser lige nu kun data for den første godkendte virksomhed. Et
 * firma-skift i appen er en fremtidig udbygning, når det bliver relevant.
 */
export const getFreelancerMemberships = cache(async function getFreelancerMemberships(
  freelancerId: string
): Promise<FreelancerMembership[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("freelancer_companies")
    .select("application_status, companies(id, name, slug)")
    .eq("freelancer_id", freelancerId);

  if (error) {
    console.error("getFreelancerMemberships fejlede", error);
    return [];
  }
  return data as unknown as FreelancerMembership[];
});

/**
 * Den virksomhed, appen viser data for lige nu. Se MVP-bemærkningen ovenfor
 * — vælger den første godkendte virksomhed. `cache()` sikrer at både
 * layout.tsx og den enkelte side kan kalde denne uden at ramme databasen
 * to gange i samme request.
 */
export async function getPrimaryCompany(freelancerId: string) {
  const memberships = await getFreelancerMemberships(freelancerId);
  const approved = memberships.find((m) => m.application_status === "approved" && m.companies);
  return approved?.companies ?? null;
}

/**
 * Giver en nyoprettet admin-bruger automatisk status som godkendt
 * freelancer i deres egen virksomhed, med alle nuværende jobfunktioner
 * slået til — så admins/teammedlemmer kan bruge freelancer-appen (fx til
 * at teste den, eller fordi de også tager vagter selv) uden at skulle
 * ansøge separat. Kaldes fra inviteAdmin() (settings/admins/actions.ts).
 *
 * birth_date/phone er ikke en del af admin-invitationsflowet, og sættes
 * derfor tomme, ligesom når en admin selv opretter en freelancer manuelt
 * (se createFreelancer i freelancers/actions.ts) — has_license default
 * false, kan rettes af freelanceren selv senere hvis relevant.
 *
 * Fejler aldrig hårdt for den kaldende handling — kan admin-brugeren
 * ikke også blive freelancer, er admin-oprettelsen stadig lykkedes.
 */
export async function provisionAdminAsFreelancer(
  userId: string,
  fullName: string,
  email: string,
  companyId: string
) {
  const supabase = createAdminClient();

  const { error: profileError } = await supabase.from("freelancer_profiles").insert({
    id: userId,
    full_name: fullName,
    email,
    gender: null,
    birth_date: null,
    location: null,
    phone: "",
    bio: null,
    profile_image_url: null,
    social_media_url: null,
    has_license: false,
  });
  if (profileError) {
    console.error("provisionAdminAsFreelancer: freelancer_profiles-insert fejlede", profileError);
    return;
  }

  const { error: membershipError } = await supabase.from("freelancer_companies").insert({
    freelancer_id: userId,
    company_id: companyId,
    application_status: "approved",
  });
  if (membershipError) {
    console.error("provisionAdminAsFreelancer: freelancer_companies-insert fejlede", membershipError);
    return;
  }

  const { data: categories, error: categoriesError } = await supabase
    .from("work_categories")
    .select("id")
    .eq("company_id", companyId);
  if (categoriesError) {
    console.error("provisionAdminAsFreelancer: kunne ikke hente jobfunktioner", categoriesError);
    return;
  }

  if (categories && categories.length > 0) {
    const { error: insertError } = await supabase
      .from("freelancer_categories")
      .insert(categories.map((c) => ({ freelancer_id: userId, category_id: c.id })));
    if (insertError) {
      console.error("provisionAdminAsFreelancer: freelancer_categories-insert fejlede", insertError);
    }
  }
}

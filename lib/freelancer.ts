import "server-only";
import { cache } from "react";
import { unstable_cache, updateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FreelancerMembership = {
  application_status: "pending" | "approved" | "rejected";
  companies: { id: string; name: string; slug: string } | null;
};

// Genbruges af enhver mutation der ændrer freelancer_companies (godkend/
// afvis en ansøgning, admin-selv-provisionering, en ny ansøgning) — se
// updateTag(FREELANCER_MEMBERSHIPS_TAG) i provisionAdminAsFreelancer
// nedenfor, i app/tenant/(protected)/freelancers/actions.ts og i
// lib/registration.ts. Én fælles tag frem for ét pr. freelancer-ID, da det
// er langt simplere at holde alle invalideringssteder korrekte, og disse
// mutationer er sjældne nok til at en bred invalidering ikke koster noget.
export const FREELANCER_MEMBERSHIPS_TAG = "freelancer-memberships";

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
 *
 * Kaldes på HVER ENESTE sidenavigation i freelancer-appen (layoutets
 * godkendelsestjek), men ændrer sig kun når en admin godkender/afviser en
 * ansøgning — en sjælden begivenhed. unstable_cache undgår derfor et
 * databasekald ved hver sidenavigation; revalidate: 30 er et sikkerhedsnet
 * (data er aldrig mere end 30 sek. forældet, selv hvis et
 * invalideringssted skulle mangle), mens updateTag() ved de faktiske
 * mutationer (kun kaldbar fra Server Actions) gør det øjeblikkeligt uden at
 * vente på sikkerhedsnettet — se next/cache's updateTag vs. revalidateTag.
 * Den ydre React cache() sikrer stadig at selve opslaget kun sker én gang
 * pr. request/render.
 */
export const getFreelancerMemberships = cache(
  unstable_cache(
    async function getFreelancerMemberships(freelancerId: string): Promise<FreelancerMembership[]> {
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
    },
    ["freelancer-memberships"],
    { tags: [FREELANCER_MEMBERSHIPS_TAG], revalidate: 30 }
  )
);

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

export type CompanyContactInfo = {
  name: string;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

// Delt med de to mutationer i settings/company/actions.ts, som skal
// invalidere begge tags (firmanavn/slug er også indlejret i den cachede
// medlemskabsliste ovenfor).
export const COMPANY_INFO_TAG = "company-info";

/**
 * Kontaktoplysninger på virksomheden, vist på freelancer-appens
 * Kontakter-side. Ændrer sig kun når en admin gemmer virksomhedens
 * profil (settings/company) — sjældnere end selv medlemskabsstatus —
 * derfor et lidt længere sikkerhedsnet (60 sek.) end
 * FREELANCER_MEMBERSHIPS_TAG ovenfor.
 */
export const getCompanyContactInfo = cache(
  unstable_cache(
    async function getCompanyContactInfo(companyId: string): Promise<CompanyContactInfo | null> {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("companies")
        .select("name, contact_person, contact_phone, contact_email")
        .eq("id", companyId)
        .maybeSingle();

      if (error) {
        console.error("getCompanyContactInfo fejlede", error);
        return null;
      }
      return data;
    },
    ["company-contact-info"],
    { tags: [COMPANY_INFO_TAG], revalidate: 60 }
  )
);

export type CompanyColleague = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  profile_image_url: string | null;
  birth_date: string;
  created_at: string;
  category_names: string[];
};

/**
 * Alle godkendte kolleger i freelancerens egen virksomhed (til Kontakter-
 * sidens liste og profilvisning). Kalder RPC'en get_company_colleague_
 * directory() via brugerens EGEN session-bundne klient (ikke admin-
 * klienten som resten af denne fil bruger) — funktionen er SECURITY
 * DEFINER og afgør selv adgangen ud fra auth.uid() indeni sig selv, så den
 * skal kaldes som den faktiske bruger for at vide hvem "auth.uid()" er.
 *
 * Bevidst ikke bygget som en bred RLS-policy på freelancer_profiles: den
 * tabel indeholder bl.a. bank_reg_number/bank_account_number, og RLS styrer
 * kun hvilke RÆKKER man må se, ikke hvilke KOLONNER — en policy der lod
 * kolleger se hinandens rækker ville derfor også (utilsigtet) gøre
 * bankoplysninger læsbare for enhver der selv forespørger tabellen direkte.
 * Funktionen returnerer derfor eksplicit kun de felter en kollega må se.
 */
export async function getCompanyColleagueDirectory(): Promise<CompanyColleague[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_company_colleague_directory");

  if (error) {
    console.error("getCompanyColleagueDirectory fejlede", error);
    return [];
  }
  return (data ?? []) as CompanyColleague[];
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
  updateTag(FREELANCER_MEMBERSHIPS_TAG);

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

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_cache, updateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/format";

export type FreelancerMembership = {
  id: string; // freelancer_profiles.id — denne virksomheds egen profil, ikke login-id'et
  full_name: string;
  email: string | null;
  profile_image_url: string | null;
  application_status: "pending" | "approved" | "rejected";
  companies: { id: string; name: string; slug: string; logo_url: string | null } | null;
};

// Genbruges af enhver mutation der ændrer freelancer_profiles' virksomheds-
// tilknytning (godkend/afvis en ansøgning, admin-selv-provisionering, en ny
// ansøgning) — se updateTag(FREELANCER_MEMBERSHIPS_TAG) i
// provisionAdminAsFreelancer nedenfor, i
// app/tenant/(protected)/freelancers/actions.ts og i lib/registration.ts. Én
// fælles tag frem for ét pr. freelancer-ID, da det er langt simplere at
// holde alle invalideringssteder korrekte, og disse mutationer er sjældne
// nok til at en bred invalidering ikke koster noget.
export const FREELANCER_MEMBERSHIPS_TAG = "freelancer-memberships";

/**
 * Alle profiler (én pr. virksomhed) knyttet til dette login. En freelancer
 * kan have HELT ADSKILTE profiler (navn, billede, bio osv.) hos hver
 * virksomhed de arbejder for — kun login-emailen/auth-kontoen er fælles
 * (auth_user_id). Bruges af (protected)/layout.tsx til at afgøre om appen
 * skal vise fuldt indhold, en "afventer godkendelse"-skærm, eller sende
 * brugeren tilbage til ansøgningssiden.
 *
 * Kaldes på HVER ENESTE sidenavigation i freelancer-appen (layoutets
 * godkendelsestjek), men ændrer sig kun når en admin godkender/afviser en
 * ansøgning, eller en ny ansøgning/profil oprettes — en sjælden begivenhed.
 * unstable_cache undgår derfor et databasekald ved hver sidenavigation;
 * revalidate: 30 er et sikkerhedsnet (data er aldrig mere end 30 sek.
 * forældet, selv hvis et invalideringssted skulle mangle), mens updateTag()
 * ved de faktiske mutationer (kun kaldbar fra Server Actions) gør det
 * øjeblikkeligt uden at vente på sikkerhedsnettet. Den ydre React cache()
 * sikrer stadig at selve opslaget kun sker én gang pr. request/render.
 */
export const getFreelancerMemberships = cache(
  unstable_cache(
    async function getFreelancerMemberships(authUserId: string): Promise<FreelancerMembership[]> {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("freelancer_profiles")
        .select("id, full_name, email, profile_image_url, application_status, companies(id, name, slug, logo_url)")
        .eq("auth_user_id", authUserId);

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

export type ActiveProfile = {
  id: string; // freelancer_profiles.id for DENNE virksomhed
  full_name: string;
  email: string | null;
  profile_image_url: string | null;
  company: { id: string; name: string; slug: string; logo_url: string | null };
};

// Navnet på cookien der husker hvilken PROFIL (ikke bare virksomhed)
// freelanceren sidst skiftede til (se setActiveProfile i mere/actions.ts).
// Sat på selve app.pepo.team (freelancer-appens eget subdomæne, ikke
// roddomænet som login-sessionen i lib/supabase/server.ts) — den behøver
// ikke virke på tværs af subdomæner, kun i freelancer-appen.
export const ACTIVE_PROFILE_COOKIE = "pepo_active_profile";

/** Alle profiler freelanceren er godkendt med — bruges af firma-skifteren i "Mere". */
export async function getApprovedProfiles(authUserId: string): Promise<ActiveProfile[]> {
  const memberships = await getFreelancerMemberships(authUserId);
  return memberships
    .filter((m) => m.application_status === "approved" && m.companies)
    .map((m) => ({
      id: m.id,
      full_name: m.full_name,
      email: m.email,
      profile_image_url: m.profile_image_url,
      company: m.companies as ActiveProfile["company"],
    }));
}

/**
 * Hvilken af freelancerens godkendte profiler appen viser data for lige nu.
 * En freelancer kan arbejde for flere virksomheder samtidig, med en helt
 * separat profil (navn/billede/bio) pr. virksomhed, og skifter mellem dem
 * via "Mere" (se setActiveProfile) — valget gemmes i en cookie som den
 * valgte PROFILS id (ikke virksomhedens id), da det er profilen der
 * bestemmer både hvilken virksomheds data der vises OG hvilket navn/billede
 * der vises som "mig". Findes cookien ikke, eller peger den på en profil
 * freelanceren ikke (længere) er godkendt med, falder vi tilbage til den
 * første godkendte.
 */
export async function getActiveProfile(authUserId: string): Promise<ActiveProfile | null> {
  const approved = await getApprovedProfiles(authUserId);
  if (approved.length === 0) return null;

  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
  const selected = selectedId ? approved.find((p) => p.id === selectedId) : undefined;

  return selected ?? approved[0];
}

/**
 * Registrerer at freelanceren har åbnet appen i dag, til tenant-admins
 * "Sidst aktiv [...]"-visning (se lastActiveLabel i lib/format.ts). Kaldes
 * fra freelancer-appens layout via Next.js' after(), så selve sidevisningen
 * ikke venter på dette skriv.
 *
 * Bevidst IKKE opdateret ved hver sidevisning — kun kalenderdagen er
 * interessant her (ikke klokkeslæt), så .or()-betingelsen nedenfor gør at
 * UPDATE'en kun rammer rækken (og dermed kun skriver noget) hvis dagens
 * dato rent faktisk er anderledes end sidst registreret. Almindelige
 * sidevisninger senere samme dag koster derfor kun et billigt opslag uden
 * skrivning, ikke et skriv pr. request.
 */
export async function touchProfileActivity(profileId: string) {
  const supabase = createAdminClient();
  const today = todayIso();
  const { error } = await supabase
    .from("freelancer_profiles")
    .update({ last_active_at: today })
    .eq("id", profileId)
    .or(`last_active_at.is.null,last_active_at.neq.${today}`);

  if (error) {
    console.error("touchProfileActivity fejlede", error);
  }
}

/**
 * Token til DENNE profils (dvs. denne virksomheds) personlige "Sync med din
 * kalender"-feed — se app/freelancer/api/calendar/[token]/route.ts og
 * lib/freelancer-ics.ts. Bevidst IKKE en del af det cachede ActiveProfile-
 * objekt ovenfor (bruges alle mulige steder i freelancer-appen) — kun
 * "Mere"-siden har brug for token'et, så et separat, uncachet opslag holder
 * ActiveProfile's brede genbrug uændret og undgår at hive endnu et felt med
 * i den delte cache for alle de andre sider der ikke bruger det.
 */
export async function getFreelancerCalendarToken(profileId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("freelancer_profiles")
    .select("calendar_feed_token")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data) {
    console.error("getFreelancerCalendarToken fejlede", error);
    return null;
  }
  return data.calendar_feed_token as string;
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
 * Returnerede id'er er freelancer_profiles.id (denne virksomheds profil),
 * IKKE auth-login-id'et — se isSelf-tjekket i kontakter/[id]/page.tsx, som
 * derfor sammenligner mod den aktive profils id, ikke mod brugerens auth-id.
 *
 * Bevidst ikke bygget som en bred RLS-policy på freelancer_profiles: den
 * tabel indeholder bl.a. bank_reg_number/bank_account_number, og RLS styrer
 * kun hvilke RÆKKER man må se, ikke hvilke KOLONNER — en policy der lod
 * kolleger se hinandens rækker ville derfor også (utilsigtet) gøre
 * bankoplysninger læsbare for enhver der selv forespørger tabellen direkte.
 * Funktionen returnerer derfor eksplicit kun de felter en kollega må se.
 */
export async function getCompanyColleagueDirectory(companyId: string): Promise<CompanyColleague[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_company_colleague_directory", {
    p_company_id: companyId,
  });

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

  const { data: profile, error: profileError } = await supabase
    .from("freelancer_profiles")
    .insert({
      auth_user_id: userId,
      company_id: companyId,
      application_status: "approved",
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
    })
    .select("id")
    .single();
  if (profileError || !profile) {
    console.error("provisionAdminAsFreelancer: freelancer_profiles-insert fejlede", profileError);
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

  // freelancer_categories.freelancer_id peger på auth.users(id) (login-
  // id'et), ikke på freelancer_profiles.id — se forklaringen i
  // migrationen freelancer_profiles_per_company: jobfunktioner er bevidst
  // IKKE splittet pr. virksomhedsprofil.
  if (categories && categories.length > 0) {
    const { error: insertError } = await supabase
      .from("freelancer_categories")
      .insert(categories.map((c) => ({ freelancer_id: userId, category_id: c.id })));
    if (insertError) {
      console.error("provisionAdminAsFreelancer: freelancer_categories-insert fejlede", insertError);
    }
  }
}

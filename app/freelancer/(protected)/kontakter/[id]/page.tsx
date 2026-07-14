import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { getActiveProfile, getCompanyColleagueDirectory } from "@/lib/freelancer";
import ColleagueDetail from "@/components/freelancer/ColleagueDetail";

export const dynamic = "force-dynamic";

export default async function ColleagueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return null;

  const activeProfile = await getActiveProfile(user.id);
  if (!activeProfile) redirect("/kontakter");

  // Genbruger samme adgangskontrollerede opslag som listen (se
  // lib/freelancer.ts) i stedet for et separat forespørgsel — det er kun
  // et par dusin rækker, og på den måde er der garanteret ingen forskel
  // på hvem der kan ses her vs. i selve listen.
  const colleagues = await getCompanyColleagueDirectory(activeProfile.company.id);
  const colleague = colleagues.find((c) => c.id === id);

  // Findes ikke, eller er ikke (længere) en godkendt kollega i samme
  // virksomhed — tilbage til listen frem for en forvirrende tom side.
  if (!colleague) {
    redirect("/kontakter");
  }

  // colleague.id er freelancer_profiles.id (denne virksomheds profil), ikke
  // login-id'et — sammenlign derfor mod den aktive profils id, ikke mod
  // user.id (som nu kan være fælles med profiler hos andre virksomheder).
  return <ColleagueDetail colleague={colleague} isSelf={colleague.id === activeProfile.id} />;
}

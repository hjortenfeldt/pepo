import { getAuthUser } from "@/lib/supabase/server";
import { getActiveProfile, getCompanyColleagueDirectory } from "@/lib/freelancer";
import KontakterClient from "@/components/freelancer/KontakterClient";

export const dynamic = "force-dynamic";

/**
 * Medarbejder-/kollegaliste for freelancerens AKTIVE virksomhed (den
 * arbejdsplads freelanceren har valgt i "Mere", se getActiveProfile) —
 * søgbar og grupperet A-Å, ligesom en almindelig telefonbogs-kontaktliste.
 * Selve adgangskontrollen (kun godkendte kolleger i samme virksomhed, kun
 * de felter der må vises) håndteres af get_company_colleague_directory()
 * (se lib/freelancer.ts), ikke her på siden.
 */
export default async function FreelancerKontakterPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const activeProfile = await getActiveProfile(user.id);
  if (!activeProfile) return <KontakterClient colleagues={[]} currentUserId={user.id} />;

  const colleagues = await getCompanyColleagueDirectory(activeProfile.company.id);

  return <KontakterClient colleagues={colleagues} currentUserId={activeProfile.id} />;
}

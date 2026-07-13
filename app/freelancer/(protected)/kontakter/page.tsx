import { getAuthUser } from "@/lib/supabase/server";
import { getCompanyColleagueDirectory } from "@/lib/freelancer";
import KontakterClient from "@/components/freelancer/KontakterClient";

export const dynamic = "force-dynamic";

/**
 * Medarbejder-/kollegaliste for freelancerens egen virksomhed — søgbar og
 * grupperet A-Å, ligesom en almindelig telefonbogs-kontaktliste. Selve
 * adgangskontrollen (kun godkendte kolleger i samme virksomhed, kun de
 * felter der må vises) håndteres af get_company_colleague_directory()
 * (se lib/freelancer.ts), ikke her på siden.
 */
export default async function FreelancerKontakterPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const colleagues = await getCompanyColleagueDirectory();

  return <KontakterClient colleagues={colleagues} currentUserId={user.id} />;
}

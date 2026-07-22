import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { getActiveProfile, getEditableProfile, getCompanyWorkCategories } from "@/lib/freelancer";
import ProfileEditForm from "@/components/freelancer/ProfileEditForm";

export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const activeProfile = await getActiveProfile(user.id);
  if (!activeProfile) redirect("/mere");

  const [profile, allCategories] = await Promise.all([
    getEditableProfile(activeProfile.id),
    getCompanyWorkCategories(activeProfile.company.id),
  ]);

  // Burde ikke kunne ske (activeProfile findes jo netop), men vis brugeren
  // tilbage til "Mere" frem for en tom/forvirrende side ved en kant-fejl.
  if (!profile) redirect("/mere");

  return <ProfileEditForm profileId={activeProfile.id} profile={profile} allCategories={allCategories} />;
}

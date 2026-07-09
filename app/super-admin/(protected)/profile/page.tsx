import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileSettings from "@/components/admin/ProfileSettings";
import { updateOwnSuperAdminProfile } from "./actions";

export const dynamic = "force-dynamic";

export default async function SuperAdminProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: superAdmin, error } = await supabase
    .from("super_admins")
    .select("full_name, email, profile_image_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !superAdmin) {
    redirect("/");
  }

  return (
    <ProfileSettings
      initial={{
        fullName: superAdmin.full_name,
        email: superAdmin.email,
        profileImageUrl: superAdmin.profile_image_url,
      }}
      onSave={updateOwnSuperAdminProfile}
    />
  );
}

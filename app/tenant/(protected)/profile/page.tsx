import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileSettings from "@/components/admin/ProfileSettings";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("full_name, email, profile_image_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !admin) {
    // Fx en Pepo-superadmin uden egen admin_users-række (support-besøg) —
    // de har ikke en tenant-profil at redigere her.
    redirect("/");
  }

  return (
    <ProfileSettings
      initial={{
        fullName: admin.full_name,
        email: admin.email,
        profileImageUrl: admin.profile_image_url,
      }}
    />
  );
}

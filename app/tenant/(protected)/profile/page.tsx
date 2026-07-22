import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileSettings from "@/components/admin/ProfileSettings";
import AdminAppSection from "@/components/admin/AdminAppSection";
import { updateOwnProfile } from "./actions";

export const metadata: Metadata = { title: "Profil" };
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
    <>
      <ProfileSettings
        initial={{
          fullName: admin.full_name,
          email: admin.email,
          profileImageUrl: admin.profile_image_url,
        }}
        onSave={updateOwnProfile}
      />

      {/*
        Admin Appen-sektion — kun relevant for tenant-adminnen selv, ikke for
        Pepo-superadmins (denne page.tsx bruges ikke af super-admins profil-
        side, se app/super-admin/(protected)/profile/page.tsx), så det er
        trygt at lægge den her frem for i den delte ProfileSettings.tsx.
        AdminAppSection skjuler sig selv helt (inkl. overskrift) på desktop.
      */}
      <AdminAppSection />
    </>
  );
}

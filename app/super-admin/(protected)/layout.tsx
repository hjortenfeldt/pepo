import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminTopBar from "@/components/admin/AdminTopBar";
import { logout } from "./actions";

// Statisk titel for hele superadmin-området — der er ingen undermenupunkter
// at variere titlen efter, i modsætning til tenant-admin (se
// app/tenant/(protected)/layout.tsx, som i stedet bruger en title-template).
export const metadata: Metadata = {
  title: "Pepo - Superadmin",
};

export default async function ProtectedSuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("full_name, profile_image_url")
    .eq("id", user.id)
    .maybeSingle();

  if (!superAdmin) {
    await supabase.auth.signOut();
    redirect("/login?error=not_super_admin");
  }

  // Samme top-bar som tenant-adminsystemet (logo, versionsnummer, bløde
  // skygge, bruger-dropdown) — kun rollebetegnelsen ("superadmin" i stedet
  // for "admin") og fraværet af et virksomhedsnavn adskiller dem, da denne
  // side ikke hører til én bestemt virksomhed.
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-pepo-su">
      <AdminTopBar
        name={superAdmin.full_name}
        onLogout={logout}
        roleLabel="superadmin"
        profileImageUrl={superAdmin.profile_image_url}
        profileHref="/profile"
      />
      <main className="flex-1 min-h-0 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}

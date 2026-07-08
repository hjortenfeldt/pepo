import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import AdminUsersSettings from "@/components/admin/AdminUsersSettings";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const regularClient = await createClient();
  const {
    data: { user: currentUser },
  } = await regularClient.auth.getUser();

  // Service role-klient, samme begrundelse som de øvrige indstillingssider
  // — allerede beskyttet af layout.tsx, og vi vil ikke være afhængige af
  // at den brede admin_users-SELECT-policy forbliver korrekt konfigureret.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name, email, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("AdminUsersPage: kunne ikke hente admin-brugere", error);
  }

  const admins = (data ?? []).map((a) => ({
    id: a.id,
    fullName: a.full_name,
    email: a.email,
    createdAt: a.created_at,
  }));

  return <AdminUsersSettings admins={admins} currentUserId={currentUser?.id ?? null} />;
}

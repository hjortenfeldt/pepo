import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { logout } from "./actions";
import { getCompanyBySubdomain } from "@/lib/tenant";

export default async function ProtectedTenantLayout({
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

  const company = await getCompanyBySubdomain();
  if (!company) {
    // Subdomænet matcher ingen virksomhed i companies-tabellen.
    redirect("/login?error=unknown_company");
  }

  const [{ data: admin }, { data: superAdmin }] = await Promise.all([
    supabase
      .from("admin_users")
      .select("full_name, email, company_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("super_admins").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const isOwnCompanyAdmin = Boolean(admin) && admin!.company_id === company.id;

  if (!isOwnCompanyAdmin && !superAdmin) {
    if (admin) {
      // Gyldig admin — bare ikke for denne virksomhed. Log ikke ud, da
      // sessionen stadig er gyldig på admins egen virksomheds subdomæne.
      redirect("/login?error=wrong_company");
    }
    await supabase.auth.signOut();
    redirect("/login?error=not_admin");
  }

  // En Pepo-superadmin, der besøger en virksomhed de ikke selv er admin
  // for, er her i support-øjemed — vis det tydeligt i UI'en.
  const isSupportVisit = Boolean(superAdmin) && !isOwnCompanyAdmin;
  const displayName = isOwnCompanyAdmin
    ? admin!.full_name
    : `${superAdmin!.full_name} (Pepo support)`;

  return (
    <div className="flex min-h-screen bg-pepo-su">
      <AdminSidebar name={displayName} onLogout={logout} companyName={company.name} />
      <div className="flex-1 min-w-0 flex flex-col">
        {isSupportVisit && (
          <div className="bg-amber-400 text-amber-950 text-sm font-medium px-4 py-2 text-center">
            Support-tilstand — du er logget ind som Pepo-superadmin i {company.name}s system.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

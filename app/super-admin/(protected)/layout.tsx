import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

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
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!superAdmin) {
    await supabase.auth.signOut();
    redirect("/login?error=not_super_admin");
  }

  return (
    <div className="min-h-screen bg-pepo-su">
      <header className="flex items-center justify-between px-8 py-5 border-b border-pepo-bds bg-pepo-wh">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[10px] bg-pepo-t1 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <circle cx="8.5" cy="11" r="5.5" fill="white" />
              <circle cx="17" cy="11" r="3.5" fill="white" opacity="0.6" />
            </svg>
          </div>
          <span className="text-lg font-medium text-pepo-t1">
            pepo <span className="text-pepo-t3 font-normal">super-admin</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-pepo-t2">{superAdmin.full_name}</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-pepo-t2 hover:text-pepo-t1 underline">
              Log ud
            </button>
          </form>
        </div>
      </header>
      <main className="px-8 py-8">{children}</main>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar, { AdminNavLinks } from "@/components/admin/AdminSidebar";
import AdminTopBar from "@/components/admin/AdminTopBar";
import AdminUpdateChecker from "@/components/admin/AdminUpdateChecker";
import AdminPullToRefresh from "@/components/admin/AdminPullToRefresh";
import AdminPushGate from "@/components/admin/AdminPushGate";
import { logout } from "./actions";
import { getCompanyBySubdomain } from "@/lib/tenant";

// Title-template: hver side under tenant-admin sætter sin egen `title`
// (matcher menupunktet i AdminSidebar), som automatisk bliver flettet ind
// her, fx "Pepo - Vagter". Sider uden egen title (bør ikke forekomme, men
// virker som sikkerhedsnet) falder tilbage til "Pepo".
export const metadata: Metadata = {
  title: {
    template: "Pepo - %s",
    default: "Pepo",
  },
};

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
      .select("full_name, email, company_id, profile_image_url")
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

  // Top-baren spænder 100% af bredden hen over både venstremenu og
  // indhold, og er altid synlig (den scroller aldrig væk) — derfor ligger
  // den som sin egen flex-shrink-0 række OVER sidebar+indhold-rækken,
  // frem for inde i én af dem. Sidebar+indhold-rækken er ÉT samlet
  // scroll-panel for indholdet (se AdminSidebar.tsx for sidebarens eget
  // uafhængige scroll-panel) — AdminPullToRefresh.tsx ER nu dette
  // scroll-panel (mobil: med træk-for-at-genindlæse-gestus, desktop: en
  // almindelig overflow-y-auto). Sideindholdet (children) må derfor IKKE
  // selv sætte h-screen eller sit eget overflow-y-auto, ellers opstår der to
  // indlejrede scroll-rammer, og noget indhold kan blive skåret af midt på
  // siden.
  return (
    // AdminPushGate yderst (mobil-only fuldskærms-takeover, skjuler topbar
    // OG sidebar mens den viser sin prompt — se AdminPushGate.tsx for
    // begrundelsen) — samme placeringsprincip som freelancer-appens
    // PushGate.tsx, blot flyttet uden for hele topbar+sidebar-strukturen i
    // stedet for kun uden om {children}, jf. Hjorths eksplicitte valg om
    // "fuldskærm, skjuler sidebar" for disse gates.
    <AdminPushGate>
      {/* h-dvh (dynamic viewport height), IKKE h-screen (100vh) — samme
          rettelse som freelancer-appens (protected)/layout.tsx. 100vh låser
          sig til browserens STØRSTE mulige visningsområde (adresselinje
          skjult); på mobil, med adresselinjen synlig, betød det at bunden
          af siden (fx "Gem ændringer"-knappen på Variabler-siden) lå uden
          for det faktiske synlige område UDEN at scroll-panelet vidste det
          skulle give ekstra scroll-plads — man kunne altså ikke scrolle sig
          ned til den. h-dvh følger det aktuelt synlige område live. */}
      <div className="flex flex-col h-dvh overflow-hidden bg-pepo-su">
        <AdminTopBar
          name={displayName}
          onLogout={logout}
          companyName={company.name}
          profileImageUrl={isOwnCompanyAdmin ? admin!.profile_image_url : null}
          mobileNav={<AdminNavLinks className="px-1 py-0.5" />}
        />
        <AdminUpdateChecker />
        <div className="flex flex-1 min-h-0">
          <AdminSidebar />
          <AdminPullToRefresh>
            {isSupportVisit && (
              <div className="bg-amber-400 text-amber-950 text-sm font-medium px-4 py-2 text-center">
                Support-tilstand — du er logget ind som Pepo-superadmin i {company.name}s system.
              </div>
            )}
            {children}
          </AdminPullToRefresh>
        </div>
      </div>
    </AdminPushGate>
  );
}

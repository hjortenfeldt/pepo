/**
 * Admin Appens udgave af components/freelancer/PageSkeleton.tsx — vises af
 * Next.js' loading.tsx-konvention mens en tenant-admin-sides Server
 * Component henter data, i stedet for et blankt/frosset øjeblik ved
 * navigation i sidebaren (AdminSidebar.tsx).
 *
 * Layoutet ((protected)/layout.tsx) ejer selv sidens ene scroll-panel (se
 * [[feedback_admin_layout_single_scroll_panel]]) — denne skeleton sætter
 * derfor bevidst hverken h-screen eller sin egen overflow-y-auto, kun
 * indre padding der matcher de rigtige sider (fx DashboardBoard.tsx's
 * px-8 py-[22px]).
 *
 * data-pepo-admin-splash-fallback: markør som AdminSplashScreen.tsx bruger
 * (via document.querySelector + MutationObserver) til at afgøre om
 * destinationssiden stadig venter på data ved koldstart af Admin Appen på
 * mobil — se AdminPageSkeleton.tsx/AdminSplashScreen.tsx-parret. Fjernes
 * IKKE denne markør, hvis komponenten redesignes; flyt den blot til det
 * nye rodelement.
 */
export default function AdminPageSkeleton() {
  return (
    <div data-pepo-admin-splash-fallback className="px-8 py-[22px]">
      <div className="h-7 w-48 rounded-md bg-pepo-bd animate-pulse" />
      <div className="h-4 w-64 rounded-md bg-pepo-bd animate-pulse mt-2" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div className="h-24 rounded-[14px] bg-pepo-bd animate-pulse" />
        <div className="h-24 rounded-[14px] bg-pepo-bd animate-pulse" />
        <div className="h-24 rounded-[14px] bg-pepo-bd animate-pulse" />
      </div>

      <div className="flex flex-col gap-2 mt-6">
        <div className="h-12 rounded-[10px] bg-pepo-bd animate-pulse" />
        <div className="h-12 rounded-[10px] bg-pepo-bd animate-pulse" />
        <div className="h-12 rounded-[10px] bg-pepo-bd animate-pulse" />
        <div className="h-12 rounded-[10px] bg-pepo-bd animate-pulse" />
        <div className="h-12 rounded-[10px] bg-pepo-bd animate-pulse" />
      </div>
    </div>
  );
}

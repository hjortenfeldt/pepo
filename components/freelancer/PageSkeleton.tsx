/**
 * Vises af Next.js' loading.tsx-konvention MENS den nye sides Server
 * Component henter data — altså med det samme man trykker på en fane i
 * BottomNav, i stedet for et par sekunders helt blankt/frosset skærmbillede.
 * Gør navigationen mellem faner opleves lynhurtig selvom selve datakaldet
 * stadig tager sin tid, i stedet for at brugeren tror appen hænger.
 *
 * data-pepo-splash-fallback: markør som SplashScreen.tsx bruger til (via
 * document.querySelector + MutationObserver) at afgøre om destinationssiden
 * stadig venter på data i baggrunden ved koldstart af app'en — helt uafhængigt
 * af selve Next.js' Suspense-swap. Fjernes IKKE denne markør fra elementet
 * herunder, hvis komponenten redesignes; flyt den blot til det nye rodelement.
 */
export default function PageSkeleton() {
  return (
    <div data-pepo-splash-fallback className="px-[var(--page-px)] pt-4 pb-6">
      <div className="h-6 w-32 rounded-md bg-pepo-bd animate-pulse" />
      <div className="h-4 w-24 rounded-md bg-pepo-bd animate-pulse mt-2" />

      <div className="h-24 rounded-[14px] bg-pepo-bd animate-pulse mt-6" />

      <div className="flex flex-col gap-2 mt-6">
        <div className="h-16 rounded-[14px] bg-pepo-bd animate-pulse" />
        <div className="h-16 rounded-[14px] bg-pepo-bd animate-pulse" />
      </div>
    </div>
  );
}

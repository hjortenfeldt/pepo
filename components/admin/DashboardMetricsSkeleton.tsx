/**
 * Fallback vist mens DashboardBoardStream.tsx's tunge events-forespørgsel
 * (se app/tenant/(protected)/page.tsx) stadig er undervejs — matcher
 * DashboardBoard.tsx's rigtige kort-layout (to statistik-kort, to
 * events-lister, en graf), så der ikke er noget synligt "hop" i højde/form
 * når de rigtige data popper ind. Titlen/undertitlen ovenover ("Dashboard")
 * er IKKE en del af denne skeleton — den renderes allerede med det samme i
 * page.tsx, uafhængigt af dette tunge dataload.
 */
export default function DashboardMetricsSkeleton() {
  return (
    <div className="px-8 py-[22px] pb-10">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="h-[230px] rounded-[14px] bg-pepo-bd animate-pulse sm:flex-1" />
        <div className="h-[230px] rounded-[14px] bg-pepo-bd animate-pulse sm:flex-1" />
      </div>

      <div className="h-[180px] rounded-[14px] bg-pepo-bd animate-pulse mt-4" />
      <div className="h-[180px] rounded-[14px] bg-pepo-bd animate-pulse mt-4" />
      <div className="h-[340px] rounded-[14px] bg-pepo-bd animate-pulse mt-4" />
    </div>
  );
}

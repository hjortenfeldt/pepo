"use client";

import { use } from "react";
import type { DashboardEventItem, MonthlyFinancials } from "@/lib/admin-types";
import DashboardBoard from "./DashboardBoard";

export type DashboardMetrics = {
  monthly: MonthlyFinancials[];
  eventCounts: { booket: number; afviklet: number; kommende: number };
  freelancerStats: { ansatte: number; timerArbejdet: number; timerPlanlagt: number };
  upcoming: DashboardEventItem[];
  recent: DashboardEventItem[];
};

/**
 * Læser dashboard-metrics-bundtet med Reacts use()-hook, inde i den
 * <Suspense>-grænse page.tsx sætter op omkring dette element. Selve
 * dataindsamlingen + beregningerne (monthlyFinancials, eventCounts osv.) sker
 * i page.tsx's getDashboardMetrics() — bevidst IKKE awaitet der, men sendt
 * hertil som et promise, så titlen/undertitlen ovenover kan vises med det
 * samme, uafhængigt af den tunge events-forespørgsel. Samme mønster som
 * components/freelancer/OverviewClient.tsx's OpenShiftsList — se den for
 * den fulde begrundelse.
 */
export default function DashboardBoardStream({ promise }: { promise: Promise<DashboardMetrics> }) {
  const data = use(promise);

  return (
    <DashboardBoard
      monthly={data.monthly}
      eventCounts={data.eventCounts}
      freelancerStats={data.freelancerStats}
      upcoming={data.upcoming}
      recent={data.recent}
    />
  );
}

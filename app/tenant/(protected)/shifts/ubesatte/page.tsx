import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { getShiftsBoardData, filterEventsWithUnfilledShiftsWithinDays } from "@/lib/shifts-data";
import UnfilledShiftsView from "@/components/admin/UnfilledShiftsView";

export const metadata: Metadata = { title: "Ledige vagter i løbet af de næste syv dage" };
export const dynamic = "force-dynamic";

/**
 * Deep-link-mål for "Ubesat(te) vagt(er) om få dage"-push'en (se
 * app/api/cron/unfilled-shifts-digest/route.ts) — samme stripped-down
 * mønster som shifts/event/[id]/page.tsx (EventDeepLinkView), men for FLERE
 * events i stedet for ét: kun events med mindst én ubesat vagt inden for de
 * næste 7 dage, ingen faner/søgning/"+ Ny event". Se Pepo –
 * Notifikationstyper.xlsx, fane "Notifikationstyper (Admin)", række 2.
 */
export default async function UnfilledShiftsPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const { events, clients, categories, freelancers } = await getShiftsBoardData(company.id);
  const unfilledEvents = filterEventsWithUnfilledShiftsWithinDays(events, 7);

  return (
    <UnfilledShiftsView
      events={unfilledEvents}
      clients={clients}
      categories={categories}
      freelancers={freelancers}
    />
  );
}

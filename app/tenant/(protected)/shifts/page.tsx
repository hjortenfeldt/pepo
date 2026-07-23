import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { getShiftsBoardData } from "@/lib/shifts-data";
import ShiftBoard from "@/components/admin/ShiftBoard";

export const metadata: Metadata = { title: "Events & vagter" };
export const dynamic = "force-dynamic";

export default async function AdminShiftsPage({
  searchParams,
}: {
  // ?tab=upcoming|past — bruges af "Se alle"-knapperne på Dashboard-siden
  // (DashboardBoard.tsx) til at lande på den rigtige fane med det samme,
  // i stedet for at de bare linkede til /shifts og håbede på at
  // ShiftBoard's default-fane ("Kommende") tilfældigvis var den rigtige.
  searchParams: Promise<{ tab?: string }>;
}) {
  // Se page.tsx (dashboard) for hvorfor company.id skal filtreres
  // eksplicit — RLS alene skelner ikke mellem "min egen virksomhed" og
  // "virksomheden hvis subdomæne jeg besøger som superadmin i support-tilstand".
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const { tab } = await searchParams;
  const initialTab = tab === "past" ? "past" : "upcoming";

  const { events, clients, categories, freelancers } = await getShiftsBoardData(company.id);

  return (
    <ShiftBoard
      events={events}
      clients={clients}
      categories={categories}
      freelancers={freelancers}
      initialTab={initialTab}
    />
  );
}

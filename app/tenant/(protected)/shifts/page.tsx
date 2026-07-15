import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { getShiftsBoardData } from "@/lib/shifts-data";
import ShiftBoard from "@/components/admin/ShiftBoard";

export const metadata: Metadata = { title: "Vagter" };
export const dynamic = "force-dynamic";

export default async function AdminShiftsPage() {
  // Se page.tsx (dashboard) for hvorfor company.id skal filtreres
  // eksplicit — RLS alene skelner ikke mellem "min egen virksomhed" og
  // "virksomheden hvis subdomæne jeg besøger som superadmin i support-tilstand".
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const { events, clients, categories, freelancers } = await getShiftsBoardData(company.id);

  return (
    <ShiftBoard events={events} clients={clients} categories={categories} freelancers={freelancers} />
  );
}

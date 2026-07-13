import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import ClientBoard from "@/components/admin/ClientBoard";
import type { ClientListItem } from "@/lib/admin-types";

export const metadata: Metadata = { title: "Kunder" };
export const dynamic = "force-dynamic";

// Rå formen af en række, som Supabase returnerer for select-kaldet nedenfor.
// Skrevet i hånden, fordi projektet endnu ikke bruger genererede
// Supabase-databasetyper (`supabase gen types typescript`).
type RawVenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
};

type RawClientRow = {
  id: string;
  name: string | null;
  cvr_number: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  client_venues: RawVenueRow[] | null;
};

export default async function AdminClientsPage() {
  const supabase = await createClient();

  // Se dashboard-page.tsx for hvorfor company.id skal filtreres eksplicit.
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const { data: clients, error } = await supabase
    .from("clients")
    .select(
      "id, name, cvr_number, contact_person, contact_phone, contact_email, notes, created_at, client_venues(id, name, address, postal_code, city)"
    )
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("AdminClientsPage: kunne ikke hente kunder", error);
  }

  const items: ClientListItem[] = ((clients ?? []) as RawClientRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    cvrNumber: c.cvr_number,
    contactPerson: c.contact_person,
    contactPhone: c.contact_phone,
    contactEmail: c.contact_email,
    notes: c.notes,
    createdAt: c.created_at,
    venues: (c.client_venues ?? []).map((v) => ({
      id: v.id,
      clientId: c.id,
      name: v.name,
      address: v.address,
      postalCode: v.postal_code,
      city: v.city,
    })),
  }));

  return <ClientBoard clients={items} />;
}

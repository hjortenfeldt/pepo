import { createClient } from "@/lib/supabase/server";
import ClientBoard from "@/components/admin/ClientBoard";
import type { ClientListItem } from "@/lib/admin-types";

export const dynamic = "force-dynamic";

// Rå formen af en række, som Supabase returnerer for select-kaldet nedenfor.
// Skrevet i hånden, fordi projektet endnu ikke bruger genererede
// Supabase-databasetyper (`supabase gen types typescript`).
type RawClientRow = {
  id: string;
  name: string | null;
  cvr_number: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
};

export default async function AdminClientsPage() {
  const supabase = await createClient();

  const { data: clients, error } = await supabase
    .from("clients")
    .select(
      "id, name, cvr_number, address, postal_code, city, contact_person, contact_phone, contact_email, notes, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("AdminClientsPage: kunne ikke hente kunder", error);
  }

  const items: ClientListItem[] = ((clients ?? []) as RawClientRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    cvrNumber: c.cvr_number,
    address: c.address,
    postalCode: c.postal_code,
    city: c.city,
    contactPerson: c.contact_person,
    contactPhone: c.contact_phone,
    contactEmail: c.contact_email,
    notes: c.notes,
    createdAt: c.created_at,
  }));

  return <ClientBoard clients={items} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import CompanyProfileSettings from "@/components/admin/CompanyProfileSettings";

export const metadata: Metadata = { title: "Firmaoplysninger" };
export const dynamic = "force-dynamic";

export default async function CompanyProfilePage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  // Service role-klient, samme begrundelse som settings/calendar/page.tsx:
  // siden er allerede beskyttet af layout.tsx, og vi vil ikke være
  // afhængige af at RLS' SELECT-policy forbliver korrekt konfigureret.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "name, slug, cvr_number, address, postal_code, city, contact_person, contact_phone, contact_email, logo_url"
    )
    .eq("id", company.id)
    .single();

  if (error || !data) {
    console.error("CompanyProfilePage: kunne ikke hente firmaoplysninger", error);
    redirect("/");
  }

  return (
    <CompanyProfileSettings
      initial={{
        name: data.name,
        slug: data.slug,
        cvrNumber: data.cvr_number ?? "",
        address: data.address ?? "",
        postalCode: data.postal_code ?? "",
        city: data.city ?? "",
        contactPerson: data.contact_person ?? "",
        contactPhone: data.contact_phone ?? "",
        contactEmail: data.contact_email ?? "",
        logoUrl: data.logo_url ?? null,
      }}
    />
  );
}

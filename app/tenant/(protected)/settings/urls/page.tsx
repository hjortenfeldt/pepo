import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import ImportantUrlsSettings from "@/components/admin/ImportantUrlsSettings";

export const metadata: Metadata = { title: "Vigtige URL'er" };
export const dynamic = "force-dynamic";

export default async function ImportantUrlsPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  // Service role-klient, samme begrundelse som settings/company/page.tsx.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("google_review_url, website_url, rental_terms_url, faq_url")
    .eq("id", company.id)
    .single();

  if (error || !data) {
    console.error("ImportantUrlsPage: kunne ikke hente URL'er", error);
    redirect("/");
  }

  return (
    <ImportantUrlsSettings
      tenantSlug={company.slug}
      initial={{
        googleReviewUrl: data.google_review_url ?? "",
        websiteUrl: data.website_url ?? "",
        rentalTermsUrl: data.rental_terms_url ?? "",
        faqUrl: data.faq_url ?? "",
      }}
    />
  );
}

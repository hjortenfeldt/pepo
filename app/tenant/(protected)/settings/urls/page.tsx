import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCompanyBySubdomain } from "@/lib/tenant";
import ImportantUrlsSettings from "@/components/admin/ImportantUrlsSettings";

export const metadata: Metadata = { title: "Vigtige URL'er" };
export const dynamic = "force-dynamic";

export default async function ImportantUrlsPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  return <ImportantUrlsSettings tenantSlug={company.slug} />;
}

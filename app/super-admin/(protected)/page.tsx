import { createAdminClient } from "@/lib/supabase/admin";
import CompaniesBoard, { type CompanyListItem } from "@/components/super-admin/CompaniesBoard";

export const dynamic = "force-dynamic";

export default async function SuperAdminCompaniesPage() {
  const supabase = createAdminClient();

  const { data: companies, error } = await supabase
    .from("companies")
    .select(
      "id, name, slug, created_at, admin_users(count), freelancer_profiles(count)"
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("SuperAdminCompaniesPage: kunne ikke hente virksomheder", error);
  }

  type RawRow = {
    id: string;
    name: string;
    slug: string;
    created_at: string;
    admin_users: { count: number }[] | { count: number } | null;
    freelancer_profiles: { count: number }[] | { count: number } | null;
  };

  function count(rel: { count: number }[] | { count: number } | null): number {
    if (!rel) return 0;
    return Array.isArray(rel) ? rel[0]?.count ?? 0 : rel.count ?? 0;
  }

  const items: CompanyListItem[] = ((companies ?? []) as RawRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    createdAt: c.created_at,
    adminCount: count(c.admin_users),
    freelancerCount: count(c.freelancer_profiles),
  }));

  return <CompaniesBoard companies={items} />;
}

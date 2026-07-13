import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import CategoryList from "@/components/admin/CategoryList";
import type { CategoryGroupListItem, CategoryListItem } from "@/lib/admin-types";

export const metadata: Metadata = { title: "Jobfunktioner" };
export const dynamic = "force-dynamic";

// Rå formen af rækkerne, som Supabase returnerer for select-kaldene nedenfor.
// Skrevet i hånden, fordi projektet endnu ikke bruger genererede
// Supabase-databasetyper (`supabase gen types typescript`).
type RawGroupRow = {
  id: string;
  name: string;
  client_rate_per_hour: number | string;
  freelancer_rate_per_hour: number | string;
};

type RawCategoryRow = {
  id: string;
  name: string;
  group_id: string | null;
  icon: string | null;
  freelancer_categories: { count: number }[] | { count: number } | null;
};

export default async function AdminCategoriesPage() {
  const supabase = await createClient();

  const [groupsResult, categoriesResult] = await Promise.all([
    supabase
      .from("work_category_groups")
      .select("id, name, client_rate_per_hour, freelancer_rate_per_hour")
      .order("name"),
    supabase
      .from("work_categories")
      .select("id, name, group_id, icon, freelancer_categories(count)")
      .order("name"),
  ]);

  if (groupsResult.error) {
    console.error("AdminCategoriesPage: kunne ikke hente priskategorier", groupsResult.error);
  }
  if (categoriesResult.error) {
    console.error("AdminCategoriesPage: kunne ikke hente jobfunktioner", categoriesResult.error);
  }

  const groups: CategoryGroupListItem[] = ((groupsResult.data ?? []) as RawGroupRow[]).map((g) => ({
    id: g.id,
    name: g.name,
    // Supabase kan returnere "numeric"-kolonner som streng — coerce forsvarsmæssigt.
    clientRatePerHour: Number(g.client_rate_per_hour),
    freelancerRatePerHour: Number(g.freelancer_rate_per_hour),
  }));

  // NB: samme defensive håndtering af indlejrede relationer som i
  // freelancers/page.tsx — PostgREST kan returnere aggregatet som enten
  // ét objekt eller et array med ét objekt afhængigt af relationstype.
  const categories: CategoryListItem[] = ((categoriesResult.data ?? []) as RawCategoryRow[]).map((c) => {
    const rel = c.freelancer_categories;
    const count = Array.isArray(rel) ? rel[0]?.count ?? 0 : rel?.count ?? 0;
    return {
      id: c.id,
      name: c.name,
      freelancerCount: count,
      groupId: c.group_id,
      icon: c.icon,
    };
  });

  return <CategoryList groups={groups} categories={categories} />;
}

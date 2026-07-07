import { createClient } from "@/lib/supabase/server";
import CategoryList from "@/components/admin/CategoryList";
import type { CategoryListItem } from "@/lib/admin-types";

export const dynamic = "force-dynamic";

// Rå formen af en række, som Supabase returnerer for select-kaldet nedenfor.
// Skrevet i hånden, fordi projektet endnu ikke bruger genererede
// Supabase-databasetyper (`supabase gen types typescript`).
type RawCategoryRow = {
  id: string;
  name: string;
  client_rate_per_hour: number | string;
  freelancer_rate_per_hour: number | string;
  freelancer_categories: { count: number }[] | { count: number } | null;
};

export default async function AdminCategoriesPage() {
  const supabase = await createClient();

  const { data: categories, error } = await supabase
    .from("work_categories")
    .select("id, name, client_rate_per_hour, freelancer_rate_per_hour, freelancer_categories(count)")
    .order("name");

  if (error) {
    console.error("AdminCategoriesPage: kunne ikke hente kategorier", error);
  }

  // NB: samme defensive håndtering af indlejrede relationer som i
  // freelancers/page.tsx — PostgREST kan returnere aggregatet som enten
  // ét objekt eller et array med ét objekt afhængigt af relationstype.
  const items: CategoryListItem[] = ((categories ?? []) as RawCategoryRow[]).map((c) => {
    const rel = c.freelancer_categories;
    const count = Array.isArray(rel) ? rel[0]?.count ?? 0 : rel?.count ?? 0;
    return {
      id: c.id,
      name: c.name,
      freelancerCount: count,
      // Supabase kan returnere "numeric"-kolonner som streng — coerce forsvarsmæssigt.
      clientRatePerHour: Number(c.client_rate_per_hour),
      freelancerRatePerHour: Number(c.freelancer_rate_per_hour),
    };
  });

  return <CategoryList categories={items} />;
}

import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBDOMAIN_HEADER } from "@/lib/tenant-constants";

export { SUBDOMAIN_HEADER };

export async function getCurrentSubdomain(): Promise<string | null> {
  const h = await headers();
  return h.get(SUBDOMAIN_HEADER);
}

export type CurrentCompany = { id: string; name: string; slug: string };

/**
 * Slår virksomheden op ud fra subdomænet i den indkommende request.
 * Bruger service role-klienten, fordi opslaget skal virke uanset om
 * besøgende endnu er logget ind (fx på login-siden) — company-opslag i
 * sig selv afslører ikke andet end navn/slug.
 */
export async function getCompanyBySubdomain(): Promise<CurrentCompany | null> {
  const slug = await getCurrentSubdomain();
  if (!slug) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("getCompanyBySubdomain fejlede", error);
    return null;
  }
  return data;
}

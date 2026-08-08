import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBDOMAIN_HEADER } from "@/lib/tenant-constants";

export { SUBDOMAIN_HEADER };

export async function getCurrentSubdomain(): Promise<string | null> {
  const h = await headers();
  return h.get(SUBDOMAIN_HEADER);
}

export type CurrentCompany = { id: string; name: string; slug: string; logo_url: string | null };

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

/**
 * Bygger en fuld URL på en virksomheds eget subdomæne, fx
 * buildTenantUrl("kulturbyen", "/status/abc") → "https://kulturbyen.pepo.team/status/abc".
 * Til server-kode der skal lægge et link i en klient-mail UDEN selv at have
 * adgang til den indkommende request (fx en cron-rute, som ikke har nogen
 * Host-header at læse subdomænet fra via getCurrentSubdomain() — den kalder
 * jo sig selv med en fast URL, ikke via en browser). Samme
 * NEXT_PUBLIC_ROOT_DOMAIN-mønster som resten af koden (proxy.ts,
 * lib/email-templates.ts's pepoLogoUrl).
 */
export function buildTenantUrl(slug: string, path: string): string {
  return `https://${slug}.${ROOT_DOMAIN}${path}`;
}

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
    .select("id, name, slug, logo_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("getCompanyBySubdomain fejlede", error);
    return null;
  }
  return data;
}

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { cookieDomainOptions } from "./cookie-domain";

/**
 * Supabase-klient til brug i browseren (client components).
 * Bruger kun den offentlige anon-nøgle — aldrig service role-nøglen.
 * Cookien sættes på roddomænet (.pepo.team), se lib/supabase/server.ts.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: cookieDomainOptions() }
  );
}

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cookieDomainOptions } from "./cookie-domain";

/**
 * Supabase-klient bundet til den indloggede brugers session (cookies).
 * Bruges i Server Components, layouts og Server Actions under /tenant og
 * /super-admin, så databasekald respekterer RLS-policies for den faktiske
 * bruger — i modsætning til lib/supabase/admin.ts, som altid omgår RLS.
 *
 * Cookien sættes bevidst på roddomænet (.pepo.team), ikke det enkelte
 * subdomæne, så én login-session virker på tværs af alle virksomheders
 * subdomæner — nødvendigt for at en Pepo-superadmin kan klikke sig ind på
 * en virksomheds system uden at logge ind igen. Selve adgangen til den
 * enkelte virksomheds data styres stadig af RLS (company_id) og af
 * tjekket i app/tenant/(protected)/layout.tsx.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...cookieDomainOptions() })
            );
          } catch {
            // Kaldes fra en Server Component uden skriveadgang til cookies —
            // middleware.ts sørger for at forny sessionen i det tilfælde.
          }
        },
      },
    }
  );
}

import "server-only";
import { cache } from "react";
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

/**
 * `supabase.auth.getUser()` verificerer altid sessionen mod Supabases
 * Auth-server over netværket (med vilje — det er den sikre variant, i
 * modsætning til `getSession()` som kun læser JWT'en lokalt uden at tjekke
 * om den er tilbagekaldt). Problemet er at layoutet OG selve siden (og for
 * freelancer-appens vedkommende helt op til 5-6 sider) hver kaldte den
 * uafhængigt af hinanden i samme navigation — det gav flere sekventielle
 * netværkskald til Supabase for hver eneste sideskift, hvilket var
 * hovedårsagen til at freelancer-appen føltes langsom at bruge.
 *
 * `cache()` fra React sikrer at kaldet kun sker én gang pr. request,
 * uanset hvor mange komponenter (layout + side) der beder om brugeren —
 * så længe de kaldes inden for samme server-render. Løser IKKE at
 * proxy.ts (kører i en helt separat middleware-request) også må kalde det
 * selv, men fjerner de reelt overflødige ekstra kald under selve renderet.
 */
export const getAuthUser = cache(async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

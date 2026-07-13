import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { cookieDomainOptions } from "./cookie-domain";
import { VERIFIED_USER_ID_HEADER } from "@/lib/tenant-constants";

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
 * om den er tilbagekaldt). Problemet var at layoutet OG selve siden (og for
 * freelancer-appens vedkommende helt op til 5-6 sider) hver kaldte den
 * uafhængigt af hinanden i samme navigation — OVENI at proxy.ts
 * (middleware) allerede havde lavet præcis samme netværkskald et øjeblik
 * forinden for at afgøre login/redirect. Det var reelt 2 fulde
 * tur-retur-kald til Supabases auth-server for hver eneste sideskift, og
 * var hovedårsagen til at freelancer-appen føltes langsom at bruge.
 *
 * Løsning: proxy.ts sender det allerede-verificerede bruger-ID videre via
 * VERIFIED_USER_ID_HEADER (se proxy.ts' buildRequestHeaders — headeren
 * nulstilles der altid først, så en klient ikke selv kan sætte/forfalske
 * den). Findes headeren, genbruger vi ID'et i stedet for at verificere
 * sessionen igen. Mangler den (fx et request der undtagelsesvis ikke er
 * gået gennem proxy.ts), falder vi sikkert tilbage til det fulde
 * verificerede opslag — aldrig omvendt, så vi risikerer ikke at stole på
 * et ID uden at nogen faktisk har verificeret det.
 *
 * `cache()` sikrer stadig at selve dette opslag (header-læsning eller
 * netværkskald) kun sker én gang pr. request, uanset hvor mange
 * komponenter (layout + side) der beder om brugeren.
 */
export const getAuthUser = cache(async function getAuthUser(): Promise<User | null> {
  const headerList = await headers();
  const verifiedUserId = headerList.get(VERIFIED_USER_ID_HEADER);
  if (verifiedUserId) {
    // Kun .id bruges nogensinde af kalderne af getAuthUser() i
    // freelancer-appen — et minimalt stand-in-objekt er derfor nok, uden
    // selv at skulle slå den fulde bruger op igen.
    return { id: verifiedUserId } as User;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

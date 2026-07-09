import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUBDOMAIN_HEADER } from "@/lib/tenant-constants";
import { cookieDomainOptions } from "@/lib/supabase/cookie-domain";

/**
 * Hedder "proxy" (ikke "middleware") — Next.js 16 omdøbte konventionen,
 * se https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Denne fil har to opgaver, som begge skal køre på hvert request:
 * 1. Forny Supabase-sessionen (cookie-refresh) — anbefalet mønster fra
 *    @supabase/ssr, uafhængigt af hvilket domæne requestet kommer fra.
 * 2. Afgøre ud fra Host-headeren hvilken "logisk app" der skal svare:
 *    - pepo.team / www.pepo.team → den offentlige registreringsside
 *      (uændret, ingen rewrite).
 *    - admin.pepo.team → Pepos eget super-admin-system.
 *    - <slug>.pepo.team (inkl. pepo.pepo.team) → den virksomheds eget
 *      adminsystem/dashboard, uden "/tenant"-præfiks i den synlige URL.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";
const SUPER_ADMIN_SUBDOMAIN = "admin";

function resolveSubdomain(hostname: string): string | null {
  const host = hostname.split(":")[0].toLowerCase();

  // Lokal udvikling: "localhost" og "*.localhost" (fx kulturbyen.localhost,
  // admin.localhost) virker ud af boksen i moderne browsere.
  const roots = [ROOT_DOMAIN, "localhost"];

  for (const root of roots) {
    if (host === root || host === `www.${root}`) return null; // apex
    if (host.endsWith(`.${root}`)) {
      return host.slice(0, -(root.length + 1));
    }
  }

  return null;
}

// Kopierer cookies sat under sessions-fornyelsen over på det endelige
// svar (redirect/rewrite), så vi ikke mister dem undervejs.
function withRefreshedCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, cookieDomainOptions());
  });
  return target;
}

export async function proxy(request: NextRequest) {
  let refreshed = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          refreshed = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshed.cookies.set(name, value, { ...options, ...cookieDomainOptions() })
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hostname = request.headers.get("host") || "";
  const subdomain = resolveSubdomain(hostname);
  const { pathname } = request.nextUrl;

  // Apex-domænet (pepo.team / www.pepo.team) — den offentlige
  // registrerings-/marketingside. Ingen rewrite, ingen login-krav.
  if (!subdomain) {
    return refreshed;
  }

  const isLoginRoute = pathname === "/login";

  // Kalender-feedet under "Sync med kalender" hentes af eksterne
  // kalenderapps (Google/Apple/Outlook) uden login-cookie — token'et i
  // selve URL'en er hemmeligheden, ikke en session. Skal derfor undtages
  // fra login-redirectet nedenfor, men rewrites stadig til
  // /tenant-præfikset som alt andet på virksomhedens subdomæne.
  const isPublicCalendarFeed = pathname.startsWith("/api/calendar/");

  // admin.pepo.team — Pepos eget super-admin-system.
  if (subdomain === SUPER_ADMIN_SUBDOMAIN) {
    if (!isLoginRoute && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return withRefreshedCookies(NextResponse.redirect(url), refreshed);
    }
    if (isLoginRoute && user) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return withRefreshedCookies(NextResponse.redirect(url), refreshed);
    }
    const url = request.nextUrl.clone();
    url.pathname = `/super-admin${pathname}`;
    return withRefreshedCookies(NextResponse.rewrite(url), refreshed);
  }

  // Alle andre subdomæner er en virksomheds eget adminsystem, fx
  // kulturbyen.pepo.team eller pepo.pepo.team (Pepo selv).
  if (!isLoginRoute && !isPublicCalendarFeed && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return withRefreshedCookies(NextResponse.redirect(url), refreshed);
  }
  if (isLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return withRefreshedCookies(NextResponse.redirect(url), refreshed);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/tenant${pathname}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SUBDOMAIN_HEADER, subdomain);
  return withRefreshedCookies(
    NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
    refreshed
  );
}

export const config = {
  // Udelukker også statiske filer i /public (fx pepo-logo.svg) — uden
  // dette blev enhver anmodning om en fil i /public rewritet til
  // "/tenant/<filnavn>" ligesom almindelige sider, hvilket gjorde at
  // billedet 404'ede og browseren viste et "knækket billede"-ikon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico|css|js|map|woff2?)$).*)",
  ],
};

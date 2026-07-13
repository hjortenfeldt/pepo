// Delt mellem middleware.ts (Edge-runtime) og lib/tenant.ts (Node-runtime
// server-kode) — holdt i sin egen fil uden andre imports, så middleware
// ikke skal bundle Supabase-klienten eller next/headers.
export const SUBDOMAIN_HEADER = "x-pepo-subdomain";

// Sendes af proxy.ts, som allerede har verificeret brugerens session
// netværks-sidet (auth.getUser(), ikke bare et lokalt cookie-tjek) for at
// afgøre login/redirects. getAuthUser() (lib/supabase/server.ts) genbruger
// dette ID i stedet for at foretage præcis samme verificering igen — se
// kommentaren der for baggrunden (freelancer-appens hovedkilde til
// oplevet træghed).
export const VERIFIED_USER_ID_HEADER = "x-pepo-verified-user-id";

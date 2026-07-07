// Delt mellem middleware.ts (Edge-runtime) og lib/tenant.ts (Node-runtime
// server-kode) — holdt i sin egen fil uden andre imports, så middleware
// ikke skal bundle Supabase-klienten eller next/headers.
export const SUBDOMAIN_HEADER = "x-pepo-subdomain";

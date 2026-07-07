import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase-klient med SERVICE ROLE-nøglen.
 *
 * Må KUN importeres i server-kode (server actions, route handlers).
 * "server-only" sikrer at Next.js fejler under build, hvis denne fil
 * ved en fejl importeres i en client component.
 *
 * Bruges til at oprette auth-brugere og skrive til tabeller, der er
 * beskyttet af Row Level Security, uden at være logget ind som brugeren
 * selv (fx registreringsflowet, hvor ansøgeren endnu ikke er godkendt).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

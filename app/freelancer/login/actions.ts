"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sender en 6-cifret login-kode til freelancerens email. Ingen
 * adgangskode i denne app — freelanceren opretter sin konto ved at
 * ansøge på pepo.team, og logger derefter altid ind med en kode sendt
 * til den email, ansøgningen blev sendt med.
 *
 * shouldCreateUser: false, så vilkårlige emails ikke kan bruges til at
 * oprette en ny bruger via login-siden — kun folk der allerede har en
 * freelancer_profiles-konto (dvs. har ansøgt) kan logge ind.
 */
export async function sendLoginCode(email: string) {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
    return { success: false as const, error: "Indtast en gyldig emailadresse." };
  }

  // Rydder en evt. "du er blevet inviteret til [firma]"-sætning sat af
  // sendFreelancerInvitation (freelancers/actions.ts i tenant-admin) — den
  // skal kun vises i netop DEN mail admin selv udløser, ikke ved
  // fremtidige almindelige login-koder freelanceren selv beder om. Fejler
  // dette (fx ukendt email), blokerer det ikke selve kode-afsendelsen.
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("freelancer_profiles")
    .select("id")
    .eq("email", trimmedEmail)
    .maybeSingle();
  if (profile) {
    await adminClient.auth.admin.updateUserById(profile.id, {
      user_metadata: { invited_company_name: null },
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: { shouldCreateUser: false },
  });

  if (error) {
    console.error("sendLoginCode fejlede", error);
    // Samme generiske besked uanset om emailen findes eller ikke — for
    // ikke at afsløre hvilke emails der har en konto.
    return {
      success: false as const,
      error: "Kunne ikke sende koden. Tjek at du har ansøgt med denne emailadresse, og prøv igen.",
    };
  }

  return { success: true as const };
}

export async function verifyLoginCode(email: string, code: string) {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();
  if (!trimmedCode) return { success: false as const, error: "Indtast koden fra emailen." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token: trimmedCode,
    type: "email",
  });

  if (error) {
    return { success: false as const, error: "Forkert eller udløbet kode. Prøv igen." };
  }

  return { success: true as const };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

/**
 * admin_users kan kun oprettes/slettes af super-admins ifølge RLS
 * ("Super admins can manage admin users") — en almindelig tenant-admin må
 * kun SE admins i sin egen virksomhed. Bruger derfor service
 * role-klienten til selve oprettelsen/sletningen, ligesom
 * super-admin/(protected)/actions.tsx' inviteCompanyAdmin, men altid
 * scopet til virksomheden fra det indkommende subdomæne — aldrig et
 * company_id sendt fra klienten.
 */

export async function inviteAdmin(fullName: string, email: string) {
  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedName) return { success: false as const, error: "Udfyld navn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { success: false as const, error: "Indtast en gyldig emailadresse." };
  }

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: trimmedEmail,
    email_confirm: true,
  });

  if (userError || !userData?.user) {
    console.error("inviteAdmin: createUser fejlede", userError);
    if (userError?.message?.toLowerCase().includes("already been registered")) {
      return { success: false as const, error: "Der findes allerede en bruger med denne email." };
    }
    return { success: false as const, error: "Kunne ikke oprette login. Prøv igen." };
  }

  const { error: adminError } = await supabase.from("admin_users").insert({
    id: userData.user.id,
    full_name: trimmedName,
    email: trimmedEmail,
    company_id: company.id,
  });

  if (adminError) {
    console.error("inviteAdmin: admin_users-insert fejlede", adminError);
    await supabase.auth.admin.deleteUser(userData.user.id);
    return { success: false as const, error: "Kunne ikke oprette admin-brugeren. Prøv igen." };
  }

  // Sender et link til at sætte adgangskode første gang, samme flow som
  // det almindelige "glemt adgangskode".
  await supabase.auth.resetPasswordForEmail(trimmedEmail);

  revalidatePath("/settings/admins");
  return { success: true as const };
}

export async function removeAdmin(userId: string) {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const regularClient = await createClient();
  const {
    data: { user: currentUser },
  } = await regularClient.auth.getUser();

  if (currentUser?.id === userId) {
    return { success: false as const, error: "Du kan ikke fjerne din egen adgang." };
  }

  const supabase = createAdminClient();

  // Verificér at brugeren rent faktisk er admin i DENNE virksomhed, så et
  // gættet id fra en anden virksomhed ikke kan slettes herfra.
  const { data: target, error: targetError } = await supabase
    .from("admin_users")
    .select("id, company_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target || target.company_id !== company.id) {
    return { success: false as const, error: "Kunne ikke finde admin-brugeren." };
  }

  const { count } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id);

  if ((count ?? 0) <= 1) {
    return { success: false as const, error: "I kan ikke fjerne den sidste admin-bruger." };
  }

  // Sletter selve login'et — admin_users-rækken har ON DELETE CASCADE på
  // auth.users, så den forsvinder automatisk med.
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error("removeAdmin fejlede", error);
    return { success: false as const, error: "Kunne ikke fjerne adgangen. Prøv igen." };
  }

  revalidatePath("/settings/admins");
  return { success: true as const };
}

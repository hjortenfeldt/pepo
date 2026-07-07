"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { redirect } = await import("next/navigation");
  redirect("/login");
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export async function createCompany(name: string, slugInput: string) {
  const trimmedName = name.trim();
  if (!trimmedName) return { success: false as const, error: "Udfyld virksomhedens navn." };

  const slug = slugify(slugInput || trimmedName);
  if (!slug) return { success: false as const, error: "Udfyld et gyldigt subdomæne." };

  // Bruger service role — super-admin-status er allerede tjekket i layout,
  // og oprettelse af en virksomhed skal kunne ske uanset RLS på companies.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({ name: trimmedName, slug })
    .select("id, slug")
    .single();

  if (error) {
    console.error("createCompany fejlede", error);
    if (error.message?.includes("er reserveret")) {
      return { success: false as const, error: `Subdomænet "${slug}" er reserveret og kan ikke bruges.` };
    }
    if (error.code === "23505") {
      return { success: false as const, error: `Subdomænet "${slug}" er allerede i brug.` };
    }
    if (error.message?.includes("companies_slug_format")) {
      return {
        success: false as const,
        error: "Subdomænet må kun indeholde små bogstaver, tal og bindestreger.",
      };
    }
    return { success: false as const, error: "Kunne ikke oprette virksomheden. Prøv igen." };
  }

  revalidatePath("/");
  return { success: true as const, id: data.id, slug: data.slug };
}

export async function inviteCompanyAdmin(companyId: string, fullName: string, email: string) {
  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedName) return { success: false, error: "Udfyld navn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { success: false, error: "Indtast en gyldig emailadresse." };
  }

  const supabase = createAdminClient();

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: trimmedEmail,
    email_confirm: true,
  });

  if (userError || !userData?.user) {
    console.error("inviteCompanyAdmin: createUser fejlede", userError);
    if (userError?.message?.toLowerCase().includes("already been registered")) {
      return { success: false, error: "Der findes allerede en bruger med denne email." };
    }
    return { success: false, error: "Kunne ikke oprette login. Prøv igen." };
  }

  const { error: adminError } = await supabase.from("admin_users").insert({
    id: userData.user.id,
    full_name: trimmedName,
    email: trimmedEmail,
    company_id: companyId,
  });

  if (adminError) {
    console.error("inviteCompanyAdmin: admin_users-insert fejlede", adminError);
    await supabase.auth.admin.deleteUser(userData.user.id);
    return { success: false, error: "Kunne ikke oprette admin-brugeren. Prøv igen." };
  }

  // Send et link til nulstilling af adgangskode, så personen selv kan
  // sætte en adgangskode første gang — samme flow som Supabase Auth
  // ellers bruger til password-reset.
  await supabase.auth.resetPasswordForEmail(trimmedEmail);

  revalidatePath("/");
  return { success: true };
}

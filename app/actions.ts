"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { RegistrationResult } from "@/lib/types";
import { normalizePhone } from "@/lib/format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modtager den udfyldte registreringsformular og opretter:
 * 1. En Supabase auth-bruger (uden adgangskode — fremtidigt login sker via
 *    magic link/OTP, se projektnoter).
 * 2. En freelancer_profiles-række med application_status = 'pending'.
 * 3. Kobling til de valgte arbejdskategorier.
 * 4. Upload af profilbillede til storage-bucketen "profile-images" (valgfrit).
 *
 * Kører udelukkende server-side med service role-nøglen, så vi kan skrive
 * til tabeller der er beskyttet af Row Level Security, selvom ansøgeren
 * endnu ikke er en godkendt, indlogget bruger.
 */
export async function submitRegistration(
  formData: FormData
): Promise<RegistrationResult> {
  const fullName = String(formData.get("fullName") || "").trim();
  const gender = String(formData.get("gender") || "").trim();
  const birthDate = String(formData.get("birthDate") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const phone = normalizePhone(String(formData.get("phone") || "").trim());
  const bio = String(formData.get("bio") || "").trim();
  const socialMediaUrl = String(formData.get("socialMediaUrl") || "").trim();
  const hasLicense = formData.get("hasLicense") === "true";
  const categoryIds = formData
    .getAll("categoryIds")
    .map(String)
    .filter(Boolean);
  const profileImage = formData.get("profileImage");

  // --- Validering (server-side — stol aldrig kun på klienten) ---
  if (!fullName) return { success: false, error: "Udfyld dit fulde navn." };
  if (!birthDate)
    return { success: false, error: "Udfyld din fødselsdato." };
  if (!email || !EMAIL_RE.test(email)) {
    return { success: false, error: "Indtast en gyldig emailadresse." };
  }
  if (!phone) return { success: false, error: "Udfyld dit mobilnummer." };
  if (categoryIds.length === 0) {
    return {
      success: false,
      error: "Vælg mindst én arbejdskategori.",
    };
  }

  const supabase = createAdminClient();

  // 1. Opret auth-bruger. Ingen adgangskode sættes — freelanceren logger
  // senere ind via magic link/OTP på sin email.
  const { data: userData, error: userError } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

  if (userError || !userData?.user) {
    if (userError?.message?.toLowerCase().includes("already been registered")) {
      return {
        success: false,
        error: "Der findes allerede en ansøgning med denne emailadresse.",
      };
    }
    console.error("submitRegistration: createUser fejlede", userError);
    return {
      success: false,
      error: "Der opstod en fejl. Prøv venligst igen om lidt.",
    };
  }

  const userId = userData.user.id;

  // 2. Upload profilbillede (valgfrit) — fejler uploaden, fortsætter vi
  // uden billede frem for at afbryde hele ansøgningen.
  let profileImageUrl: string | null = null;
  if (profileImage instanceof File && profileImage.size > 0) {
    const ext = profileImage.name.split(".").pop() || "jpg";
    const path = `${userId}/profil.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-images")
      .upload(path, profileImage, {
        upsert: true,
        contentType: profileImage.type,
      });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from("profile-images")
        .getPublicUrl(path);
      profileImageUrl = publicUrlData.publicUrl;
    } else {
      console.error("submitRegistration: billedupload fejlede", uploadError);
    }
  }

  // 3. Opret freelancer-profilen
  const { error: profileError } = await supabase
    .from("freelancer_profiles")
    .insert({
      id: userId,
      full_name: fullName,
      email,
      gender: gender || null,
      birth_date: birthDate,
      location: location || null,
      phone,
      bio: bio || null,
      profile_image_url: profileImageUrl,
      social_media_url: socialMediaUrl || null,
      has_license: hasLicense,
    });

  if (profileError) {
    console.error("submitRegistration: profil-insert fejlede", profileError);
    // Ryd op, så vi ikke efterlader en forældreløs auth-konto
    await supabase.auth.admin.deleteUser(userId);
    return {
      success: false,
      error: "Der opstod en fejl. Prøv venligst igen om lidt.",
    };
  }

  // 3b. Ansøgningen er til Pepo selv — denne side er Pepos egen
  // registreringsside (pepo.team). Godkendelsesstatus hører til
  // freelancer_companies, da en freelancer senere kan arbejde for flere
  // virksomheder (se pepo-migration-multi-tenant.sql).
  const { data: pepoCompany, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", "pepo")
    .single();

  if (companyError || !pepoCompany) {
    console.error("submitRegistration: kunne ikke finde Pepo-virksomheden", companyError);
    await supabase.auth.admin.deleteUser(userId);
    return {
      success: false,
      error: "Der opstod en fejl. Prøv venligst igen om lidt.",
    };
  }

  const { error: membershipError } = await supabase
    .from("freelancer_companies")
    .insert({ freelancer_id: userId, company_id: pepoCompany.id, application_status: "pending" });

  if (membershipError) {
    console.error("submitRegistration: kunne ikke oprette ansøgningen", membershipError);
    await supabase.auth.admin.deleteUser(userId);
    return {
      success: false,
      error: "Der opstod en fejl. Prøv venligst igen om lidt.",
    };
  }

  // 4. Kobl valgte arbejdskategorier på
  const { error: categoriesError } = await supabase
    .from("freelancer_categories")
    .insert(
      categoryIds.map((categoryId) => ({
        freelancer_id: userId,
        category_id: categoryId,
      }))
    );

  if (categoriesError) {
    console.error(
      "submitRegistration: kategori-insert fejlede",
      categoriesError
    );
    return {
      success: false,
      error:
        "Profilen blev oprettet, men kategorierne kunne ikke gemmes. Kontakt Pepo.",
    };
  }

  return { success: true };
}

/**
 * Henter de aktive arbejdskategorier til trin 2 i formularen.
 * Bruges af en Server Component, så listen altid matcher det admin
 * har sat op i work_categories.
 */
export async function getWorkCategories() {
  const supabase = createAdminClient();
  // Denne side er Pepos egen registreringsside — vis kun Pepos egne
  // arbejdskategorier (work_categories hører nu til én virksomhed).
  const { data, error } = await supabase
    .from("work_categories")
    .select("id, name, companies!inner(slug)")
    .eq("companies.slug", "pepo")
    .order("name");

  if (error) {
    console.error("getWorkCategories: fejlede", error);
    return [];
  }
  return data.map(({ id, name }) => ({ id, name }));
}

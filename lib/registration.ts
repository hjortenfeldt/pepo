import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";
import type { RegistrationResult, WorkCategory } from "@/lib/types";
import { updateTag } from "next/cache";
import { FREELANCER_MEMBERSHIPS_TAG } from "@/lib/freelancer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Delt kerne-logik for freelancer-ansøgninger, parametriseret på
 * companyId — bruges af to forskellige offentlige formularer:
 * 1. app/actions.ts (submitRegistration) — Pepos egen ansøgningsside på
 *    roden af pepo.team, hardkodet til "pepo"-virksomheden.
 * 2. app/tenant/apply/actions.ts (submitTenantApplication) — hver
 *    virksomheds egen ansøgningsside på deres eget subdomæne
 *    (fx kulturbyen.pepo.team/apply), companyId fra getCompanyBySubdomain().
 *
 * Udtrukket hertil for at undgå at de ~150 linjer valideringer/DB-kald
 * skulle vedligeholdes to steder og langsomt glide fra hinanden.
 */
export async function submitRegistrationForCompany(
  companyId: string,
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
  if (!birthDate) return { success: false, error: "Udfyld din fødselsdato." };
  if (!email || !EMAIL_RE.test(email)) {
    return { success: false, error: "Indtast en gyldig emailadresse." };
  }
  if (!phone) return { success: false, error: "Udfyld dit mobilnummer." };
  if (categoryIds.length === 0) {
    return { success: false, error: "Vælg mindst én arbejdskategori." };
  }

  const supabase = createAdminClient();

  // 1. Opret auth-bruger. Ingen adgangskode sættes — freelanceren logger
  // senere ind via en engangskode sendt til sin email.
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
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
    console.error("submitRegistrationForCompany: createUser fejlede", userError);
    return { success: false, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
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
      const { data: publicUrlData } = supabase.storage.from("profile-images").getPublicUrl(path);
      profileImageUrl = publicUrlData.publicUrl;
    } else {
      console.error("submitRegistrationForCompany: billedupload fejlede", uploadError);
    }
  }

  // 3. Opret freelancer-profilen
  const { error: profileError } = await supabase.from("freelancer_profiles").insert({
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
    console.error("submitRegistrationForCompany: profil-insert fejlede", profileError);
    await supabase.auth.admin.deleteUser(userId);
    return { success: false, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
  }

  // 3b. Tilknyt ansøgningen til den virksomhed, ansøgningen gjaldt for.
  const { error: membershipError } = await supabase
    .from("freelancer_companies")
    .insert({ freelancer_id: userId, company_id: companyId, application_status: "pending" });

  if (membershipError) {
    console.error("submitRegistrationForCompany: kunne ikke oprette ansøgningen", membershipError);
    await supabase.auth.admin.deleteUser(userId);
    return { success: false, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
  }
  updateTag(FREELANCER_MEMBERSHIPS_TAG);

  // 4. Kobl valgte arbejdskategorier på
  const { error: categoriesError } = await supabase
    .from("freelancer_categories")
    .insert(categoryIds.map((categoryId) => ({ freelancer_id: userId, category_id: categoryId })));

  if (categoriesError) {
    console.error("submitRegistrationForCompany: kategori-insert fejlede", categoriesError);
    return {
      success: false,
      error: "Profilen blev oprettet, men kategorierne kunne ikke gemmes. Kontakt virksomheden.",
    };
  }

  return { success: true };
}

/** De aktive arbejdskategorier for én bestemt virksomhed, til trin 2 i formularen. */
export async function getWorkCategoriesForCompany(companyId: string): Promise<WorkCategory[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("work_categories")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    console.error("getWorkCategoriesForCompany fejlede", error);
    return [];
  }
  return data;
}

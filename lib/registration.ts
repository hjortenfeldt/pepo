import "server-only";
import { randomUUID } from "node:crypto";
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

  // 1. Genbrug et eksisterende auth-login hvis emailen allerede har en
  // konto (fx fordi personen tidligere har ansøgt hos en anden
  // virksomhed) — ellers opret et nyt. Ingen adgangskode sættes uanset
  // hvad — freelanceren logger altid ind via en engangskode sendt til sin
  // email. Hver virksomhed får sin egen, uafhængige profil (se punkt 3),
  // så et genbrugt login betyder IKKE at profildata deles på tværs.
  const { data: existingAuthUserId, error: lookupError } = await supabase.rpc(
    "get_auth_user_id_by_email",
    { p_email: email }
  );
  if (lookupError) {
    console.error("submitRegistrationForCompany: get_auth_user_id_by_email fejlede", lookupError);
  }

  let userId: string;
  let createdNewAuthUser = false;

  if (existingAuthUserId) {
    userId = existingAuthUserId as string;

    const { data: existingProfile } = await supabase
      .from("freelancer_profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (existingProfile) {
      return {
        success: false,
        error: "Der findes allerede en ansøgning med denne emailadresse hos denne virksomhed.",
      };
    }
  } else {
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (userError || !userData?.user) {
      console.error("submitRegistrationForCompany: createUser fejlede", userError);
      return { success: false, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
    }

    userId = userData.user.id;
    createdNewAuthUser = true;
  }

  // 2. Upload profilbillede (valgfrit) — fejler uploaden, fortsætter vi
  // uden billede frem for at afbryde hele ansøgningen. Uploades til en sti
  // baseret på DENNE ansøgnings/profils eget id (genereret nedenfor), ikke
  // login-id'et — ellers ville en ansøgning hos endnu en virksomhed
  // risikere at overskrive et tidligere uploadet billede.
  const profileId = randomUUID();
  let profileImageUrl: string | null = null;
  if (profileImage instanceof File && profileImage.size > 0) {
    const ext = profileImage.name.split(".").pop() || "jpg";
    const path = `${profileId}/profil.${ext}`;
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

  // 3. Opret freelancer-profilen — en helt ny, uafhængig profil for DENNE
  // virksomhed (eget navn/billede/bio osv.), selvom login-kontoen (userId)
  // evt. er genbrugt fra en tidligere ansøgning hos en anden virksomhed.
  const { error: profileError } = await supabase.from("freelancer_profiles").insert({
    id: profileId,
    auth_user_id: userId,
    company_id: companyId,
    application_status: "pending",
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
    if (createdNewAuthUser) await supabase.auth.admin.deleteUser(userId);
    return { success: false, error: "Der opstod en fejl. Prøv venligst igen om lidt." };
  }
  updateTag(FREELANCER_MEMBERSHIPS_TAG);

  // 4. Kobl valgte arbejdskategorier på. freelancer_categories.freelancer_id
  // peger på login-id'et (userId), ikke på denne profils eget id —
  // jobfunktioner er bevidst fælles på tværs af personens virksomheder (se
  // lib/freelancer.ts). Ved et genbrugt login undgår vi at forsøge at
  // indsætte kategorier personen allerede har (fra en anden virksomhed).
  let categoryIdsToInsert = categoryIds;
  if (!createdNewAuthUser) {
    const { data: existingCategories } = await supabase
      .from("freelancer_categories")
      .select("category_id")
      .eq("freelancer_id", userId);
    const existingIds = new Set((existingCategories ?? []).map((c) => c.category_id as string));
    categoryIdsToInsert = categoryIds.filter((id) => !existingIds.has(id));
  }

  if (categoryIdsToInsert.length > 0) {
    const { error: categoriesError } = await supabase
      .from("freelancer_categories")
      .insert(categoryIdsToInsert.map((categoryId) => ({ freelancer_id: userId, category_id: categoryId })));

    if (categoriesError) {
      console.error("submitRegistrationForCompany: kategori-insert fejlede", categoriesError);
      return {
        success: false,
        error: "Profilen blev oprettet, men kategorierne kunne ikke gemmes. Kontakt virksomheden.",
      };
    }
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

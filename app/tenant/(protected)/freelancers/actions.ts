"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { normalizePhone } from "@/lib/format";
import { revalidatePath, updateTag } from "next/cache";
import { FREELANCER_MEMBERSHIPS_TAG } from "@/lib/freelancer";

export async function setApplicationStatus(
  freelancerId: string,
  status: "approved" | "rejected"
) {
  const supabase = await createClient();
  const company = await getCompanyBySubdomain();

  if (!company) {
    return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  // RLS begrænser i forvejen til admins egen virksomhed, men company_id
  // filtreres eksplicit her alligevel — se
  // feedback_superadmin_scoping_required i projektets hukommelse.
  const { error } = await supabase
    .from("freelancer_profiles")
    .update({ application_status: status })
    .eq("id", freelancerId)
    .eq("company_id", company.id);

  if (error) {
    console.error("setApplicationStatus fejlede", error);
    return { success: false, error: "Kunne ikke opdatere status. Prøv igen." };
  }

  revalidatePath("/freelancers");
  // Freelancerens egen app (getFreelancerMemberships) cacher denne status —
  // uden denne får de først opdateret adgang op til 30 sek. senere i stedet
  // for med det samme.
  updateTag(FREELANCER_MEMBERSHIPS_TAG);
  return { success: true };
}

export type FreelancerFormInput = {
  fullName: string;
  gender: string;
  birthDate: string; // ISO date (yyyy-mm-dd)
  phone: string;
  email: string;
  location: string;
  bio: string;
  socialMediaUrl: string;
  categoryIds: string[];
  hasLicense: boolean;
  // Data-URL fra FileReader (samme mønster som "Opret freelancer" i
  // prototypen) — uploades til storage-bucketen "profile-images" ved gem.
  photoDataUrl: string | null;
};

// Skal holdes i sync med feltsættet i RegistrationForm.tsx (den offentlige
// ansøgningsside, /apply) og med visningen i FreelancerBoard.tsx's
// profilpanel ("view") — se feedback_freelancer_profile_fields_in_sync i
// projektets hukommelse. Tilføjes et felt ét sted, skal det tilføjes alle
// tre steder (opret, redigér, ansøgningsformular) plus selve visningen.
function validate(input: FreelancerFormInput) {
  if (!input.fullName.trim()) return "Udfyld navn.";
  if (!input.birthDate.trim()) return "Udfyld fødselsdato.";
  if (input.categoryIds.length === 0) return "Vælg mindst én jobfunktion.";
  return null;
}

async function uploadPhotoIfNeeded(
  supabase: ReturnType<typeof createAdminClient>,
  freelancerId: string,
  photoDataUrl: string | null
): Promise<string | null> {
  if (!photoDataUrl || !photoDataUrl.startsWith("data:")) return null;

  const match = photoDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1];
  const base64 = match[2];
  const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
  const buffer = Buffer.from(base64, "base64");
  const path = `${freelancerId}/profil.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-images")
    .upload(path, buffer, { upsert: true, contentType });

  if (uploadError) {
    console.error("uploadPhotoIfNeeded: upload fejlede", uploadError);
    return null;
  }

  const { data: publicUrlData } = supabase.storage
    .from("profile-images")
    .getPublicUrl(path);
  return publicUrlData.publicUrl;
}

/**
 * Admin opretter en freelancer direkte, uden det almindelige
 * ansøgningsflow (svarer til "+ Opret freelancer" i prototypen).
 *
 * En freelancer kan arbejde for flere virksomheder, men hver virksomhed har
 * sin EGEN, fuldstændigt uafhængige profil (navn, billede, bio, jobfunktioner
 * osv.) — kun login-emailen/auth-kontoen er fælles. Findes der allerede et
 * auth-login med denne email (fx fordi personen allerede er freelancer hos
 * en anden virksomhed), genbruges DET login (så personen kan logge ind med
 * samme kode uanset hvilken virksomhed de arbejder for), men der oprettes
 * altid en helt ny freelancer_profiles-række for denne virksomhed.
 */
export async function createFreelancer(input: FreelancerFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false as const, error: validationError };

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const email = input.email.trim().toLowerCase() || null;

  let authUserId: string | null = null;
  if (email) {
    const { data: foundId, error: lookupError } = await supabase.rpc("get_auth_user_id_by_email", {
      p_email: email,
    });
    if (lookupError) {
      console.error("createFreelancer: get_auth_user_id_by_email fejlede", lookupError);
    } else {
      authUserId = (foundId as string | null) ?? null;
    }
  }

  let createdNewAuthUser = false;

  if (authUserId) {
    // Allerede et login med denne email — tjek om der allerede findes en
    // profil for NETOP denne virksomhed under det login.
    const { data: existingProfile } = await supabase
      .from("freelancer_profiles")
      .select("id")
      .eq("auth_user_id", authUserId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (existingProfile) {
      return {
        success: false as const,
        error: "Denne freelancer er allerede tilknyttet jeres virksomhed.",
      };
    }
  } else {
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: email ?? undefined,
      email_confirm: true,
    });

    if (userError || !userData?.user) {
      if (userError?.message?.toLowerCase().includes("already been registered")) {
        // Emailen findes som en auth-konto, men get_auth_user_id_by_email
        // burde have fundet den — sjældent kant-tilfælde (fx en race
        // condition), vis en generisk fejl frem for at gætte.
        return {
          success: false as const,
          error: "Denne emailadresse er allerede i brug af en anden konto i Pepo. Prøv igen om lidt.",
        };
      }
      console.error("createFreelancer: createUser fejlede", userError);
      return { success: false as const, error: "Der opstod en fejl. Prøv igen." };
    }

    authUserId = userData.user.id;
    createdNewAuthUser = true;
  }

  // Genereres i forvejen (frem for at lade databasen tildele et id ved
  // insert), så fotoet kan uploades til en sti baseret på DENNE virksomheds
  // profil-id — ikke login-id'et, som ville være fælles med en evt. profil
  // hos en anden virksomhed og dermed risikere at overskrive dens foto.
  const freelancerId = randomUUID();
  const profileImageUrl = await uploadPhotoIfNeeded(supabase, freelancerId, input.photoDataUrl);

  const { error: profileError } = await supabase.from("freelancer_profiles").insert({
    id: freelancerId,
    auth_user_id: authUserId,
    company_id: company.id,
    application_status: "approved",
    full_name: input.fullName.trim(),
    email: input.email.trim() || null,
    gender: input.gender.trim() || null,
    birth_date: input.birthDate,
    location: input.location.trim() || null,
    phone: normalizePhone(input.phone.trim()),
    bio: input.bio.trim() || null,
    profile_image_url: profileImageUrl,
    social_media_url: input.socialMediaUrl.trim() || null,
    has_license: input.hasLicense,
  });

  if (profileError) {
    console.error("createFreelancer: profil-insert fejlede", profileError);
    if (createdNewAuthUser) await supabase.auth.admin.deleteUser(authUserId);
    return { success: false as const, error: "Kunne ikke oprette freelanceren. Prøv igen." };
  }

  if (input.categoryIds.length > 0) {
    // freelancer_categories.freelancer_id peger på login-id'et
    // (auth_user_id), IKKE på denne profils eget id — jobfunktioner er
    // bevidst fælles på tværs af en persons virksomheder (se
    // lib/freelancer.ts). Ved et genbrugt login må vi derfor ikke forsøge at
    // indsætte kategorier de allerede har (fra en anden virksomhed) igen —
    // det rammer unique-constrainten på (freelancer_id, category_id).
    let categoryIdsToInsert = input.categoryIds;
    if (!createdNewAuthUser) {
      const { data: existingCategories } = await supabase
        .from("freelancer_categories")
        .select("category_id")
        .eq("freelancer_id", authUserId);
      const existingIds = new Set((existingCategories ?? []).map((c) => c.category_id as string));
      categoryIdsToInsert = input.categoryIds.filter((id) => !existingIds.has(id));
    }

    if (categoryIdsToInsert.length > 0) {
      const { error: categoriesError } = await supabase.from("freelancer_categories").insert(
        categoryIdsToInsert.map((categoryId) => ({
          freelancer_id: authUserId,
          category_id: categoryId,
        }))
      );
      if (categoriesError) {
        console.error("createFreelancer: kategori-insert fejlede", categoriesError);
      }
    }
  }

  revalidatePath("/freelancers");
  updateTag(FREELANCER_MEMBERSHIPS_TAG);
  return { success: true as const, id: freelancerId, alreadyExisted: !createdNewAuthUser };
}

/**
 * Sender en login-kode til freelanceren, så de kan komme i gang uden selv
 * at skulle vide at de skal bede om en kode på login-siden — nøjagtig
 * samme mekanisme som freelancer-appens egen "send login-kode"
 * (signInWithOtp), blot udløst af admin. Kaldbar både lige efter oprettelse
 * og senere fra freelancerens profil, indtil første login (se
 * hasFreelancerLoggedIn nedenfor).
 *
 * user_metadata sættes med virksomhedens navn lige før afsendelse, så
 * mail-skabelonen (Supabase Dashboard > Authentication > Email Templates >
 * Magic Link) kan vise {{ .Data.invited_company_name }} i teksten.
 * freelancerId er DENNE virksomheds profil-id — vi slår login-id'et
 * (auth_user_id) op ud fra den, da det er login-id'et OTP-koden sendes til.
 */
export async function sendFreelancerInvitation(freelancerId: string) {
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .from("freelancer_profiles")
    .select("auth_user_id, email")
    .eq("id", freelancerId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!profile) {
    return { success: false as const, error: "Freelanceren er ikke tilknyttet denne virksomhed." };
  }

  if (!profile.email) {
    return { success: false as const, error: "Freelanceren har ingen emailadresse registreret." };
  }

  await adminClient.auth.admin.updateUserById(profile.auth_user_id, {
    user_metadata: { invited_company_name: company.name },
  });

  // Samme klient/kald som freelancerens egen login-side (sendLoginCode i
  // app/freelancer/login/actions.ts), ikke admin-klienten — for at bruge
  // nøjagtig samme, allerede afprøvede afsendelsesvej.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: profile.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    console.error("sendFreelancerInvitation fejlede", error);
    return { success: false as const, error: "Kunne ikke sende invitationen. Prøv igen." };
  }

  return { success: true as const };
}

/**
 * Har freelanceren nogensinde logget ind? Bruges til kun at vise
 * "Send invitation" indtil freelanceren har logget ind første gang.
 * freelancerId er DENNE virksomheds profil-id — login-status hører til
 * auth-kontoen (auth_user_id), som slås op via profilen.
 */
export async function hasFreelancerLoggedIn(freelancerId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("freelancer_profiles")
    .select("auth_user_id")
    .eq("id", freelancerId)
    .maybeSingle();
  if (!profile) return false;

  const { data, error } = await adminClient.auth.admin.getUserById(profile.auth_user_id);
  if (error || !data?.user) return false;
  return Boolean(data.user.last_sign_in_at);
}

/**
 * Admin redigerer en eksisterende freelancerprofil (svarer til "Redigér
 * freelancer" i prototypen). freelancerId er profilens eget id (unikt pr.
 * virksomhed) — updateRow rammer derfor kun DENNE virksomheds profildata,
 * aldrig personens evt. andre profiler hos andre virksomheder.
 */
export async function updateFreelancer(freelancerId: string, input: FreelancerFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false as const, error: validationError };

  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = createAdminClient();

  // Bruger service role-klienten (RLS gælder ikke) — verificér derfor
  // eksplicit at profilen rent faktisk hører til DENNE virksomhed, så en
  // superadmin i support-tilstand ikke kan redigere en profil, der hører
  // til en helt anden virksomhed.
  const { data: existing } = await supabase
    .from("freelancer_profiles")
    .select("id, auth_user_id")
    .eq("id", freelancerId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!existing) {
    return { success: false as const, error: "Freelanceren er ikke tilknyttet denne virksomhed." };
  }

  const profileImageUrl = await uploadPhotoIfNeeded(supabase, freelancerId, input.photoDataUrl);

  const updateRow: Record<string, unknown> = {
    full_name: input.fullName.trim(),
    email: input.email.trim() || null,
    gender: input.gender.trim() || null,
    birth_date: input.birthDate,
    location: input.location.trim() || null,
    phone: normalizePhone(input.phone.trim()),
    bio: input.bio.trim() || null,
    social_media_url: input.socialMediaUrl.trim() || null,
    has_license: input.hasLicense,
  };
  if (profileImageUrl) updateRow.profile_image_url = profileImageUrl;

  const { error: profileError } = await supabase
    .from("freelancer_profiles")
    .update(updateRow)
    .eq("id", freelancerId);

  if (profileError) {
    console.error("updateFreelancer: profil-update fejlede", profileError);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  // freelancer_categories.freelancer_id = login-id'et (auth_user_id), fælles
  // på tværs af personens evt. andre virksomheder — vi må derfor kun slette
  // og genindsætte kategorier der hører til DENNE virksomheds jobfunktioner,
  // ellers ville en redigering her utilsigtet slette en anden virksomheds
  // kategorivalg for samme person.
  const { data: companyCategoryRows } = await supabase
    .from("work_categories")
    .select("id")
    .eq("company_id", company.id);
  const companyCategoryIds = (companyCategoryRows ?? []).map((c) => c.id as string);

  if (companyCategoryIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("freelancer_categories")
      .delete()
      .eq("freelancer_id", existing.auth_user_id)
      .in("category_id", companyCategoryIds);
    if (deleteError) {
      console.error("updateFreelancer: kategori-sletning fejlede", deleteError);
    }
  }

  if (input.categoryIds.length > 0) {
    const { error: categoriesError } = await supabase.from("freelancer_categories").insert(
      input.categoryIds.map((categoryId) => ({
        freelancer_id: existing.auth_user_id,
        category_id: categoryId,
      }))
    );
    if (categoriesError) {
      console.error("updateFreelancer: kategori-insert fejlede", categoriesError);
    }
  }

  revalidatePath("/freelancers");
  return { success: true as const };
}

/**
 * Admin sletter en freelancerprofil permanent (fra "Redigér freelancer").
 * Sletter kun DENNE virksomheds egen profil-række — personens evt. andre
 * profiler hos andre virksomheder, og selve login-kontoen (auth_user_id),
 * berøres ikke. Ingen andre tabeller har længere en fremmednøgle direkte
 * til freelancer_profiles (shifts/beskeder/jobfunktioner peger nu på
 * login-id'et, se freelancer_profiles_per_company-migrationen), så
 * sletningen er isoleret og kræver ingen oprydning andre steder.
 */
export async function deleteFreelancer(freelancerId: string) {
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("freelancer_profiles")
    .select("id")
    .eq("id", freelancerId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!existing) {
    return { success: false as const, error: "Freelanceren er ikke tilknyttet denne virksomhed." };
  }

  const { error } = await supabase
    .from("freelancer_profiles")
    .delete()
    .eq("id", freelancerId)
    .eq("company_id", company.id);

  if (error) {
    console.error("deleteFreelancer fejlede", error);
    return { success: false as const, error: "Kunne ikke slette freelanceren. Prøv igen." };
  }

  revalidatePath("/freelancers");
  updateTag(FREELANCER_MEMBERSHIPS_TAG);
  return { success: true as const };
}

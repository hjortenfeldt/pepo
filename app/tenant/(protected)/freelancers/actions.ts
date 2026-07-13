"use server";

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
  // sættes eksplicit her, da freelancer_companies har en sammensat
  // primærnøgle (freelancer_id, company_id) og ikke sit eget id-felt.
  const { error } = await supabase
    .from("freelancer_companies")
    .update({ application_status: status })
    .eq("freelancer_id", freelancerId)
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
  phone: string;
  email: string;
  location: string;
  bio: string;
  categoryIds: string[];
  hasLicense: boolean;
  // Data-URL fra FileReader (samme mønster som "Opret freelancer" i
  // prototypen) — uploades til storage-bucketen "profile-images" ved gem.
  photoDataUrl: string | null;
};

function validate(input: FreelancerFormInput) {
  if (!input.fullName.trim()) return "Udfyld navn.";
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
 * Opretter en auth-bruger uden adgangskode (samme mønster som
 * submitRegistration i app/actions.ts), en freelancer_profiles-række, og
 * en freelancer_companies-kobling med application_status = 'approved',
 * da admin selv har taget stilling ved oprettelsen.
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

  // En freelancer kan arbejde for flere virksomheder samtidig (se
  // freelancer_companies) — findes der allerede en freelancer med denne
  // email, skal vi bare tilknytte DEM til denne virksomhed i stedet for at
  // forsøge at oprette endnu en konto (som ville fejle, da emailen allerede
  // er i brug — det er jo reelt samme person).
  const existingProfile = email
    ? (await supabase.from("freelancer_profiles").select("id").eq("email", email).maybeSingle()).data
    : null;

  let freelancerId: string;
  const alreadyExisted = Boolean(existingProfile);

  if (existingProfile) {
    freelancerId = existingProfile.id;

    const { data: existingMembership } = await supabase
      .from("freelancer_companies")
      .select("freelancer_id")
      .eq("freelancer_id", freelancerId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (existingMembership) {
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
        // Emailen findes som en auth-konto, men IKKE som freelancer endnu
        // (fx en administrator der endnu ikke selv er freelancer noget
        // sted) — sjældnere kant-tilfælde, som vi ikke kan løse sikkert
        // her uden at vide hvem kontoen tilhører.
        return {
          success: false as const,
          error: "Denne emailadresse er allerede i brug af en anden konto i Pepo.",
        };
      }
      console.error("createFreelancer: createUser fejlede", userError);
      return { success: false as const, error: "Der opstod en fejl. Prøv igen." };
    }

    freelancerId = userData.user.id;
    const profileImageUrl = await uploadPhotoIfNeeded(supabase, freelancerId, input.photoDataUrl);

    const { error: profileError } = await supabase.from("freelancer_profiles").insert({
      id: freelancerId,
      full_name: input.fullName.trim(),
      email: input.email.trim() || null,
      gender: null,
      birth_date: null,
      location: input.location.trim() || null,
      phone: normalizePhone(input.phone.trim()),
      bio: input.bio.trim() || null,
      profile_image_url: profileImageUrl,
      social_media_url: null,
      has_license: input.hasLicense,
    });

    if (profileError) {
      console.error("createFreelancer: profil-insert fejlede", profileError);
      await supabase.auth.admin.deleteUser(freelancerId);
      return { success: false as const, error: "Kunne ikke oprette freelanceren. Prøv igen." };
    }
  }

  const { error: membershipError } = await supabase.from("freelancer_companies").insert({
    freelancer_id: freelancerId,
    company_id: company.id,
    application_status: "approved",
  });

  if (membershipError) {
    console.error("createFreelancer: membership-insert fejlede", membershipError);
    if (!alreadyExisted) await supabase.auth.admin.deleteUser(freelancerId);
    return { success: false as const, error: "Kunne ikke oprette freelanceren. Prøv igen." };
  }

  if (input.categoryIds.length > 0) {
    // Ved en eksisterende freelancer må vi ikke forsøge at indsætte
    // kategorier de allerede har (fx fra en anden virksomhed) igen — det
    // rammer unique-constrainten på (freelancer_id, category_id).
    let categoryIdsToInsert = input.categoryIds;
    if (alreadyExisted) {
      const { data: existingCategories } = await supabase
        .from("freelancer_categories")
        .select("category_id")
        .eq("freelancer_id", freelancerId);
      const existingIds = new Set((existingCategories ?? []).map((c) => c.category_id as string));
      categoryIdsToInsert = input.categoryIds.filter((id) => !existingIds.has(id));
    }

    if (categoryIdsToInsert.length > 0) {
      const { error: categoriesError } = await supabase.from("freelancer_categories").insert(
        categoryIdsToInsert.map((categoryId) => ({
          freelancer_id: freelancerId,
          category_id: categoryId,
        }))
      );
      if (categoriesError) {
        console.error("createFreelancer: kategori-insert fejlede", categoriesError);
      }
    }
  }

  revalidatePath("/freelancers");
  return { success: true as const, id: freelancerId, alreadyExisted };
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
 */
export async function sendFreelancerInvitation(freelancerId: string) {
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const adminClient = createAdminClient();

  // Samme tilknytnings-tjek som updateFreelancer — kun freelancere der rent
  // faktisk hører til DENNE virksomhed kan inviteres herfra.
  const { data: membership } = await adminClient
    .from("freelancer_companies")
    .select("freelancer_id")
    .eq("freelancer_id", freelancerId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!membership) {
    return { success: false as const, error: "Freelanceren er ikke tilknyttet denne virksomhed." };
  }

  const { data: profile } = await adminClient
    .from("freelancer_profiles")
    .select("email")
    .eq("id", freelancerId)
    .maybeSingle();

  if (!profile?.email) {
    return { success: false as const, error: "Freelanceren har ingen emailadresse registreret." };
  }

  await adminClient.auth.admin.updateUserById(freelancerId, {
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
 */
export async function hasFreelancerLoggedIn(freelancerId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.getUserById(freelancerId);
  if (error || !data?.user) return false;
  return Boolean(data.user.last_sign_in_at);
}

/**
 * Admin redigerer en eksisterende freelancerprofil (svarer til "Redigér
 * freelancer" i prototypen). Bruger service role-klienten, da
 * freelancer_categories skal synkroniseres på tværs af flere rækker.
 */
export async function updateFreelancer(freelancerId: string, input: FreelancerFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false as const, error: validationError };

  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = createAdminClient();

  // freelancer_profiles/freelancer_categories har ikke selv et company_id
  // (en freelancer kan arbejde for flere virksomheder), og denne funktion
  // bruger service role-klienten (RLS gælder ikke) — verificér derfor
  // eksplicit at freelanceren rent faktisk er tilknyttet DENNE virksomhed,
  // så en superadmin i support-tilstand ikke kan redigere en freelancer,
  // der hører til en helt anden virksomhed.
  const { data: membership } = await supabase
    .from("freelancer_companies")
    .select("freelancer_id")
    .eq("freelancer_id", freelancerId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!membership) {
    return { success: false as const, error: "Freelanceren er ikke tilknyttet denne virksomhed." };
  }

  const profileImageUrl = await uploadPhotoIfNeeded(supabase, freelancerId, input.photoDataUrl);

  const updateRow: Record<string, unknown> = {
    full_name: input.fullName.trim(),
    email: input.email.trim() || null,
    location: input.location.trim() || null,
    phone: normalizePhone(input.phone.trim()),
    bio: input.bio.trim() || null,
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

  const { error: deleteError } = await supabase
    .from("freelancer_categories")
    .delete()
    .eq("freelancer_id", freelancerId);
  if (deleteError) {
    console.error("updateFreelancer: kategori-sletning fejlede", deleteError);
  }

  if (input.categoryIds.length > 0) {
    const { error: categoriesError } = await supabase.from("freelancer_categories").insert(
      input.categoryIds.map((categoryId) => ({
        freelancer_id: freelancerId,
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

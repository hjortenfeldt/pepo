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
  const email = input.email.trim().toLowerCase() || undefined;

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (userError || !userData?.user) {
    if (userError?.message?.toLowerCase().includes("already been registered")) {
      return { success: false as const, error: "Der findes allerede en freelancer med denne emailadresse." };
    }
    console.error("createFreelancer: createUser fejlede", userError);
    return { success: false as const, error: "Der opstod en fejl. Prøv igen." };
  }

  const freelancerId = userData.user.id;
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

  const { error: membershipError } = await supabase.from("freelancer_companies").insert({
    freelancer_id: freelancerId,
    company_id: company.id,
    application_status: "approved",
  });

  if (membershipError) {
    console.error("createFreelancer: membership-insert fejlede", membershipError);
    await supabase.auth.admin.deleteUser(freelancerId);
    return { success: false as const, error: "Kunne ikke oprette freelanceren. Prøv igen." };
  }

  if (input.categoryIds.length > 0) {
    const { error: categoriesError } = await supabase.from("freelancer_categories").insert(
      input.categoryIds.map((categoryId) => ({
        freelancer_id: freelancerId,
        category_id: categoryId,
      }))
    );
    if (categoriesError) {
      console.error("createFreelancer: kategori-insert fejlede", categoriesError);
    }
  }

  revalidatePath("/freelancers");
  return { success: true as const, id: freelancerId };
}

/**
 * Admin redigerer en eksisterende freelancerprofil (svarer til "Redigér
 * freelancer" i prototypen). Bruger service role-klienten, da
 * freelancer_categories skal synkroniseres på tværs af flere rækker.
 */
export async function updateFreelancer(freelancerId: string, input: FreelancerFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false as const, error: validationError };

  const supabase = createAdminClient();
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

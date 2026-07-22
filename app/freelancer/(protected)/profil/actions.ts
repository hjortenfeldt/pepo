"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";
import { revalidatePath, updateTag } from "next/cache";
import { FREELANCER_MEMBERSHIPS_TAG } from "@/lib/freelancer";

export type MyProfileFormInput = {
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
  // Data-URL fra FileReader, uploades til storage-bucketen "profile-images" ved gem.
  photoDataUrl: string | null;
};

// Skal holdes i sync med FreelancerFormInput i
// app/tenant/(protected)/freelancers/actions.ts — samme feltsæt, blot gemt
// af freelanceren selv om sin egen profil i stedet for af en admin. Se
// feedback_freelancer_profile_fields_in_sync i projektets hukommelse.
function validate(input: MyProfileFormInput) {
  if (!input.fullName.trim()) return "Udfyld navn.";
  if (!input.birthDate.trim()) return "Udfyld fødselsdato.";
  if (input.categoryIds.length === 0) return "Vælg mindst én jobfunktion.";
  return null;
}

async function uploadPhotoIfNeeded(
  supabase: ReturnType<typeof createAdminClient>,
  profileId: string,
  photoDataUrl: string | null
): Promise<string | null> {
  if (!photoDataUrl || !photoDataUrl.startsWith("data:")) return null;

  const match = photoDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1];
  const base64 = match[2];
  const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
  const buffer = Buffer.from(base64, "base64");
  const path = `${profileId}/profil.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-images")
    .upload(path, buffer, { upsert: true, contentType });

  if (uploadError) {
    console.error("updateMyProfile: foto-upload fejlede", uploadError);
    return null;
  }

  const { data: publicUrlData } = supabase.storage.from("profile-images").getPublicUrl(path);
  return publicUrlData.publicUrl;
}

/**
 * Freelanceren redigerer sin EGEN profil for den aktuelt aktive virksomhed
 * ("Rediger profil" bag profilklodsen på "Mere") — samme feltsæt og
 * gemme-logik som admins updateFreelancer() i
 * app/tenant/(protected)/freelancers/actions.ts. Bruger admin-klienten
 * (service role) ligesom resten af freelancer-app-skrivningerne til
 * profile-images-bucketen kræver, men verificerer FØRST eksplicit at
 * profileId rent faktisk er DENNE brugers eget login (auth_user_id), så et
 * forfalsket/forkert profileId aldrig kan bruges til at redigere en andens
 * profil — se feedback_superadmin_scoping_required for samme princip brugt
 * tenant-side (eksplicit scoping som backstop, ikke kun RLS).
 */
export async function updateMyProfile(profileId: string, input: MyProfileFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false as const, error: validationError };

  const user = await getAuthUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("freelancer_profiles")
    .select("id, auth_user_id, company_id")
    .eq("id", profileId)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return { success: false as const, error: "Denne profil tilhører dig ikke." };
  }

  const profileImageUrl = await uploadPhotoIfNeeded(supabase, profileId, input.photoDataUrl);

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
    .eq("id", profileId);

  if (profileError) {
    console.error("updateMyProfile: profil-update fejlede", profileError);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  // freelancer_categories.freelancer_id peger på login-id'et (auth_user_id),
  // fælles på tværs af personens evt. andre virksomheder — slet/genindsæt
  // derfor kun kategorier der hører til DENNE virksomheds jobfunktioner,
  // ellers ville en redigering her utilsigtet ramme et andet firmas
  // kategorivalg for samme person (samme mønster som updateFreelancer i
  // tenant-adminens actions.ts).
  const { data: companyCategoryRows } = await supabase
    .from("work_categories")
    .select("id")
    .eq("company_id", existing.company_id);
  const companyCategoryIds = (companyCategoryRows ?? []).map((c) => c.id as string);

  if (companyCategoryIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("freelancer_categories")
      .delete()
      .eq("freelancer_id", existing.auth_user_id)
      .in("category_id", companyCategoryIds);
    if (deleteError) {
      console.error("updateMyProfile: kategori-sletning fejlede", deleteError);
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
      console.error("updateMyProfile: kategori-insert fejlede", categoriesError);
    }
  }

  // Navn/email/billede indgår i den cachede medlemskabsliste
  // (getFreelancerMemberships) som "Mere"-siden viser — uden updateTag ville
  // den vise gamle værdier i op til 30 sek. efter gem.
  revalidatePath("/profil");
  revalidatePath("/mere");
  updateTag(FREELANCER_MEMBERSHIPS_TAG);

  return { success: true as const };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ProfileSaveResult } from "@/components/admin/ProfileSettings";

export type OwnProfileInput = {
  fullName: string;
  email: string;
  // Data-URL fra FileReader, samme mønster som i
  // app/tenant/(protected)/profile/actions.ts — null hvis uændret.
  photoDataUrl: string | null;
};

async function uploadPhotoIfNeeded(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  photoDataUrl: string | null
): Promise<string | null> {
  if (!photoDataUrl || !photoDataUrl.startsWith("data:")) return null;

  const match = photoDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1];
  const base64 = match[2];
  const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
  const buffer = Buffer.from(base64, "base64");
  const path = `${userId}/profil.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-images")
    .upload(path, buffer, { upsert: true, contentType });

  if (uploadError) {
    console.error("uploadPhotoIfNeeded (super-admin profil): upload fejlede", uploadError);
    return null;
  }

  const { data: publicUrlData } = supabase.storage.from("profile-images").getPublicUrl(path);
  // Cache-bust, så det nye billede vises med det samme.
  return `${publicUrlData.publicUrl}?t=${Date.now()}`;
}

/**
 * Opdaterer den loggede superadmins egne oplysninger (profilbillede, navn,
 * email). Samme mønster som tenant-adminnernes updateOwnProfile, men mod
 * super_admins-tabellen i stedet for admin_users — ingen company-scoping
 * relevant her, da en superadmin ikke hører til én bestemt virksomhed.
 */
export async function updateOwnSuperAdminProfile(input: OwnProfileInput): Promise<ProfileSaveResult> {
  const trimmedName = input.fullName.trim();
  const trimmedEmail = input.email.trim().toLowerCase();
  if (!trimmedName) return { success: false, error: "Udfyld navn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { success: false, error: "Indtast en gyldig emailadresse." };
  }

  const regularClient = await createClient();
  const {
    data: { user },
  } = await regularClient.auth.getUser();

  if (!user) {
    return { success: false, error: "Du er ikke logget ind. Prøv at logge ind igen." };
  }

  const supabase = createAdminClient();
  const profileImageUrl = await uploadPhotoIfNeeded(supabase, user.id, input.photoDataUrl);

  const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
    email: trimmedEmail,
    email_confirm: true,
  });

  if (authError) {
    console.error("updateOwnSuperAdminProfile: opdatering af login-email fejlede", authError);
    if (authError.message?.toLowerCase().includes("already been registered")) {
      return { success: false, error: "Der findes allerede en bruger med denne email." };
    }
    return { success: false, error: "Kunne ikke opdatere email. Prøv igen." };
  }

  const updateRow: Record<string, unknown> = {
    full_name: trimmedName,
    email: trimmedEmail,
  };
  if (profileImageUrl) updateRow.profile_image_url = profileImageUrl;

  const { error: profileError } = await supabase.from("super_admins").update(updateRow).eq("id", user.id);

  if (profileError) {
    console.error("updateOwnSuperAdminProfile: super_admins-update fejlede", profileError);
    return { success: false, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/", "layout");
  return { success: true, profileImageUrl };
}

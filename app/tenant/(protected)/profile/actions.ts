"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type OwnProfileInput = {
  fullName: string;
  email: string;
  // Data-URL fra FileReader, samme mønster som freelancer-fotoupload i
  // app/tenant/(protected)/freelancers/actions.ts — null hvis uændret.
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
    console.error("uploadPhotoIfNeeded (profil): upload fejlede", uploadError);
    return null;
  }

  const { data: publicUrlData } = supabase.storage.from("profile-images").getPublicUrl(path);
  // Cache-bust, så det nye billede vises med det samme og ikke rammer en
  // gammel, browser-cachet udgave på samme filsti.
  return `${publicUrlData.publicUrl}?t=${Date.now()}`;
}

/**
 * Opdaterer den loggede admins egne oplysninger (profilbillede, navn,
 * email). Bruger service role-klienten, da admin_users kun kan opdateres
 * af super-admins ifølge RLS, og fordi en emailændring også skal
 * afspejles i selve login'et (auth.users), hvilket kræver admin-API'et.
 */
export async function updateOwnProfile(input: OwnProfileInput) {
  const trimmedName = input.fullName.trim();
  const trimmedEmail = input.email.trim().toLowerCase();
  if (!trimmedName) return { success: false as const, error: "Udfyld navn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { success: false as const, error: "Indtast en gyldig emailadresse." };
  }

  const regularClient = await createClient();
  const {
    data: { user },
  } = await regularClient.auth.getUser();

  if (!user) {
    return { success: false as const, error: "Du er ikke logget ind. Prøv at logge ind igen." };
  }

  const supabase = createAdminClient();
  const profileImageUrl = await uploadPhotoIfNeeded(supabase, user.id, input.photoDataUrl);

  const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
    email: trimmedEmail,
    email_confirm: true,
  });

  if (authError) {
    console.error("updateOwnProfile: opdatering af login-email fejlede", authError);
    if (authError.message?.toLowerCase().includes("already been registered")) {
      return { success: false as const, error: "Der findes allerede en bruger med denne email." };
    }
    return { success: false as const, error: "Kunne ikke opdatere email. Prøv igen." };
  }

  const updateRow: Record<string, unknown> = {
    full_name: trimmedName,
    email: trimmedEmail,
  };
  if (profileImageUrl) updateRow.profile_image_url = profileImageUrl;

  const { error: profileError } = await supabase.from("admin_users").update(updateRow).eq("id", user.id);

  if (profileError) {
    console.error("updateOwnProfile: admin_users-update fejlede", profileError);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/", "layout");
  return { success: true as const, profileImageUrl };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Admin Appens udgave af app/freelancer/(protected)/actions.ts's
// savePushSubscription/removePushSubscription — samme mønster, men mod sin
// egen tabel (admin_push_subscriptions, admin_id i stedet for
// freelancer_id), så en admins push-abonnementer aldrig kan blandes sammen
// med en freelancer-profils, selv hvis samme person bruger begge apps i
// samme browser (og dermed samme service worker/PushManager).
export async function saveAdminPushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const { error } = await supabase
    .from("admin_push_subscriptions")
    .upsert(
      { admin_id: user.id, endpoint: subscription.endpoint, keys: subscription.keys },
      { onConflict: "endpoint" }
    );

  if (error) {
    console.error("saveAdminPushSubscription fejlede", error);
    return { success: false as const, error: "Kunne ikke aktivere notifikationer. Prøv igen." };
  }

  return { success: true as const };
}

export async function removeAdminPushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("admin_push_subscriptions").delete().eq("endpoint", endpoint);
  return { success: true as const };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Stempel-ur: starter en ny time_clock_entries-række for den indloggede
 * freelancer. company_id sættes automatisk af databasetriggeren
 * set_company_id_time_clock_entries (slår op via shift_id), så den skal
 * ikke sendes med herfra.
 */
export async function startShift(shiftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const { data: existing } = await supabase
    .from("time_clock_entries")
    .select("id")
    .eq("freelancer_id", user.id)
    .is("clock_out_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { success: false as const, error: "Du har allerede en vagt i gang. Afslut den først." };
  }

  const { error } = await supabase.from("time_clock_entries").insert({
    shift_id: shiftId,
    freelancer_id: user.id,
    clock_in_at: new Date().toISOString(),
  });

  if (error) {
    console.error("startShift fejlede", error);
    return { success: false as const, error: "Kunne ikke starte vagten. Prøv igen." };
  }

  revalidatePath("/");
  return { success: true as const };
}

export async function stopShift(entryId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_clock_entries")
    .update({ clock_out_at: new Date().toISOString() })
    .eq("id", entryId);

  if (error) {
    console.error("stopShift fejlede", error);
    return { success: false as const, error: "Kunne ikke afslutte vagten. Prøv igen." };
  }

  revalidatePath("/");
  return { success: true as const };
}

/**
 * "Meld dig" på en åben/videresalgs-vagt. shift_interests har ingen
 * databaseunik-begrænsning på (shift_id, freelancer_id) endnu, så vi
 * tjekker selv for en eksisterende ansøgning frem for at stole på en
 * konflikt fra databasen.
 */
export async function applyToShift(shiftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const { data: existing } = await supabase
    .from("shift_interests")
    .select("id")
    .eq("shift_id", shiftId)
    .eq("freelancer_id", user.id)
    .maybeSingle();

  if (existing) {
    return { success: false as const, error: "Du har allerede meldt dig til denne vagt." };
  }

  const { error } = await supabase.from("shift_interests").insert({
    shift_id: shiftId,
    freelancer_id: user.id,
  });

  if (error) {
    console.error("applyToShift fejlede", error);
    return { success: false as const, error: "Kunne ikke melde dig til vagten. Prøv igen." };
  }

  revalidatePath("/");
  return { success: true as const };
}

/**
 * Gemmer et push-abonnement fra browserens PushManager. "upsert" på
 * endpoint, så en gentilmelding fra samme enhed (fx efter man har ryddet
 * notifikationstilladelsen og aktiveret den igen) opdaterer i stedet for
 * at fejle på det unikke endpoint-index.
 */
export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { freelancer_id: user.id, endpoint: subscription.endpoint, keys: subscription.keys },
      { onConflict: "endpoint" }
    );

  if (error) {
    console.error("savePushSubscription fejlede", error);
    return { success: false as const, error: "Kunne ikke aktivere notifikationer. Prøv igen." };
  }

  return { success: true as const };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { success: true as const };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { pushNewShiftRequestToAdmins } from "@/lib/shift-notifications";

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
 * Anmoder om en åben/videresalgs-vagt (shift_interests-række). Anmodningen
 * lander hos vagt-administratoren hos den pågældende virksomhed, som
 * derefter tildeler vagten til én af dem der har anmodet — se
 * ShiftDetailPanel.tsx's "Interesserede freelancere"-liste i adminsystemet.
 * shift_interests har en unik-begrænsning på (shift_id, freelancer_id), men
 * vi tjekker selv for en eksisterende anmodning først for at kunne give en
 * pæn fejlbesked frem for en rå databasefejl.
 */
export async function requestShift(shiftId: string) {
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
    return { success: false as const, error: "Du har allerede anmodet om denne vagt." };
  }

  const { error } = await supabase.from("shift_interests").insert({
    shift_id: shiftId,
    freelancer_id: user.id,
  });

  if (error) {
    console.error("requestShift fejlede", error);
    return { success: false as const, error: "Kunne ikke sende anmodningen. Prøv igen." };
  }

  // Fejler aldrig hårdt for selve anmodningen — se safePush i
  // lib/shift-notifications.ts. Sendes til virksomhedens admins, ikke
  // freelanceren selv (som jo ved det allerede). await'es ligesom de øvrige
  // push-kald i app/tenant/(protected)/shifts/actions.ts.
  await pushNewShiftRequestToAdmins(shiftId, user.id);

  revalidatePath("/");
  revalidatePath(`/vagt/${shiftId}`);
  return { success: true as const };
}

/**
 * Fortryder en anmodning ("Annuller anmodning" i vagt-detaljevisningen), så
 * længe admin ikke allerede har tildelt vagten til nogen — tildeling sker i
 * adminsystemet og ændrer shifts.status, ikke denne række, så en freelancer
 * kan ikke "fortryde" en vagt der reelt er givet væk.
 */
export async function withdrawShiftRequest(shiftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const { error } = await supabase
    .from("shift_interests")
    .delete()
    .eq("shift_id", shiftId)
    .eq("freelancer_id", user.id);

  if (error) {
    console.error("withdrawShiftRequest fejlede", error);
    return { success: false as const, error: "Kunne ikke annullere anmodningen. Prøv igen." };
  }

  revalidatePath("/");
  revalidatePath(`/vagt/${shiftId}`);
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

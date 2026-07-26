"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { pushNewShiftRequestToAdmins, queueOpenShiftNotifications } from "@/lib/shift-notifications";
import { loadOpenShiftDetail } from "@/lib/freelancer-shift-detail";
import type { OpenShiftDetail } from "@/components/freelancer/ShiftRequestDetail";

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
 * "Sæt vagten til salg" — freelanceren gør sin egen TILDELTE vagt ledig
 * igen, uden selv at give slip på den: tager ingen anden vagten inden
 * eventen, er det stadig freelanceren selv, der møder op (se
 * cancelShiftResale nedenfor for fortryd-vejen). Kører via en SECURITY
 * DEFINER-funktion i databasen (put_shift_for_resale) i stedet for et
 * almindeligt .update()-kald — der findes bevidst ingen bred RLS
 * UPDATE-policy på shifts for freelancere, da den ellers ville lade en
 * freelancer rette vilkårlige kolonner på egen vagt (tidspunkt, jobfunktion
 * osv.) via et direkte API-kald uden om appens UI.
 */
export async function putShiftForResale(shiftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const { data, error } = await supabase.rpc("put_shift_for_resale", { p_shift_id: shiftId }).single();

  if (error) {
    console.error("putShiftForResale fejlede", error);
    return { success: false as const, error: "Kunne ikke sætte vagten til salg. Prøv igen." };
  }

  const fields = data as { category_id: string; company_id: string };

  // Samme kø til "nye ledige vagter"-notifikationen som når en vagt
  // oprettes eller frigives — se queueOpenShiftNotifications' egen
  // kommentar i lib/shift-notifications.ts.
  await queueOpenShiftNotifications(fields.company_id, fields.category_id, shiftId);

  revalidatePath("/");
  revalidatePath(`/vagt/${shiftId}`);
  return { success: true as const };
}

/**
 * Fortryder "Sæt vagten til salg", så længe ingen anden freelancer endnu er
 * blevet tildelt vagten — se cancel_shift_resale i databasen, som også
 * rydder eventuelle ventende anmodninger fra andre freelancere, da de ikke
 * længere er relevante, når vagten ikke er til salg mere.
 */
export async function cancelShiftResale(shiftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "Du er ikke logget ind." };

  const { error } = await supabase.rpc("cancel_shift_resale", { p_shift_id: shiftId });

  if (error) {
    console.error("cancelShiftResale fejlede", error);
    return { success: false as const, error: "Kunne ikke fortryde salget. Prøv igen." };
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

/**
 * Henter data til Vagtdetaljer-overlay-panelet (ShiftDetailPanel.tsx) fra
 * Overblik-sidens "Mine vagter"/"Ledige vagter" — samme datahentning som
 * den fulde side på /vagt/[id], men uden redirect: panelet viser i stedet
 * en "ikke fundet"-besked hvis der returneres null, da et redirect ikke
 * giver mening midt i et åbent overlay.
 */
export async function getShiftDetail(shiftId: string): Promise<OpenShiftDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return loadOpenShiftDetail(supabase, user.id, shiftId);
}

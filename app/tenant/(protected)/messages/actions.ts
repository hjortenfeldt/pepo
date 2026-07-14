"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { sendPushToFreelancers } from "@/lib/push";

export type MessageFormInput = {
  subject: string;
  body: string;
  sentToAll: boolean;
  targetCategoryId: string | null;
};

function validate(input: MessageFormInput) {
  if (!input.subject.trim()) return "Udfyld emnet.";
  if (!input.body.trim()) return "Udfyld beskeden.";
  if (!input.sentToAll && !input.targetCategoryId) return "Vælg en jobfunktion.";
  return null;
}

export async function sendMessage(input: MessageFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false, error: validationError };

  // Se shifts/actions.ts for hvorfor company.id skal sættes/filtreres
  // eksplicit i stedet for at stole på RLS/databasetriggerens fallback.
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      company_id: company.id,
      sender_admin_id: user?.id ?? null,
      subject: input.subject.trim(),
      body: input.body.trim(),
      sent_to_all: input.sentToAll,
      target_category_id: input.sentToAll ? null : input.targetCategoryId,
    })
    .select("id")
    .single();

  if (messageError || !message) {
    console.error("sendMessage: kunne ikke oprette beskeden", messageError);
    return { success: false, error: "Kunne ikke sende beskeden. Prøv igen." };
  }

  // Modtagerlisten er et øjebliksbillede taget ved afsendelse — hvem der
  // reelt fik beskeden, ændrer sig ikke bagefter selvom en freelancers
  // kategorier ændres senere. Hentes bredt og filtreres i JS, samme
  // mønster som freelancer-kategori-udtrækket i shifts/page.tsx.
  //
  // Godkendte profiler for DENNE virksomhed — auth_user_id er login-id'et,
  // som er det message_recipients rent faktisk skal gemme (se
  // freelancer_categories.freelancer_id-forklaringen i lib/freelancer.ts:
  // jobfunktioner peger på login-id'et, ikke på denne profils eget id).
  const { data: approvedProfiles, error: profilesError } = await supabase
    .from("freelancer_profiles")
    .select("auth_user_id")
    .eq("company_id", company.id)
    .eq("application_status", "approved");

  if (profilesError) {
    console.error("sendMessage: kunne ikke finde modtagere", profilesError);
    return { success: false, error: "Beskeden blev gemt, men modtagerlisten kunne ikke oprettes." };
  }

  const authIds = (approvedProfiles ?? []).map((p) => p.auth_user_id as string);

  let categoriesByAuthId = new Map<string, Set<string>>();
  if (!input.sentToAll && authIds.length > 0) {
    const { data: categoryRows, error: categoriesError } = await supabase
      .from("freelancer_categories")
      .select("freelancer_id, category_id")
      .in("freelancer_id", authIds);

    if (categoriesError) {
      console.error("sendMessage: kunne ikke hente freelancer-kategorier", categoriesError);
      return { success: false, error: "Beskeden blev gemt, men modtagerlisten kunne ikke oprettes." };
    }

    categoriesByAuthId = new Map();
    for (const row of categoryRows ?? []) {
      const set = categoriesByAuthId.get(row.freelancer_id) ?? new Set<string>();
      set.add(row.category_id);
      categoriesByAuthId.set(row.freelancer_id, set);
    }
  }

  const recipientIds = authIds.filter(
    (authId) => input.sentToAll || categoriesByAuthId.get(authId)?.has(input.targetCategoryId ?? "")
  );

  if (recipientIds.length > 0) {
    const { error: insertError } = await supabase
      .from("message_recipients")
      .insert(recipientIds.map((id) => ({ message_id: message.id, freelancer_id: id })));
    if (insertError) {
      console.error("sendMessage: kunne ikke oprette modtagerrækker", insertError);
      return { success: false, error: "Beskeden blev gemt, men modtagerlisten kunne ikke oprettes." };
    }

    // Push-notifikation til dem, der har aktiveret det i appen. Afventes
    // bevidst her (i stedet for "fire and forget"), da baggrundsarbejde
    // uden await kan blive afbrudt af Vercels serverless-runtime, så snart
    // denne funktion returnerer. Fejler aldrig selve beskeden, hvis
    // push-afsendelsen fejler (se lib/push.ts) — beskeden er allerede gemt.
    try {
      await sendPushToFreelancers(recipientIds, {
        title: input.subject.trim(),
        body: input.body.trim(),
        url: "/beskeder",
      });
    } catch (err) {
      console.error("sendMessage: push-afsendelse fejlede", err);
    }
  }

  revalidatePath("/messages");
  return { success: true };
}

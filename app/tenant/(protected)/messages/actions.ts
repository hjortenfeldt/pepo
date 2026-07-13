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
  // Godkendelsesstatus hører til freelancer_companies (en freelancer kan
  // arbejde for flere virksomheder) — company.id filtreres eksplicit.
  const { data: approved, error: recipientsError } = await supabase
    .from("freelancer_companies")
    .select("freelancer_profiles(id, freelancer_categories(category_id))")
    .eq("company_id", company.id)
    .eq("application_status", "approved");

  if (recipientsError) {
    console.error("sendMessage: kunne ikke finde modtagere", recipientsError);
    return { success: false, error: "Beskeden blev gemt, men modtagerlisten kunne ikke oprettes." };
  }

  type ApprovedProfile = { id: string; freelancer_categories: { category_id: string }[] | null };
  type ApprovedRow = { freelancer_profiles: ApprovedProfile | ApprovedProfile[] | null };
  const one = <T,>(rel: T | T[] | null | undefined): T | null =>
    !rel ? null : Array.isArray(rel) ? rel[0] ?? null : rel;

  const recipientIds = ((approved ?? []) as ApprovedRow[])
    .map((row) => one(row.freelancer_profiles))
    .filter((f): f is ApprovedProfile => f !== null)
    .filter(
      (f) =>
        input.sentToAll ||
        (f.freelancer_categories ?? []).some((fc) => fc.category_id === input.targetCategoryId)
    )
    .map((f) => f.id);

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

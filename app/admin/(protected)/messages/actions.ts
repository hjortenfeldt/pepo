"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
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
  const { data: approved, error: recipientsError } = await supabase
    .from("freelancer_profiles")
    .select("id, freelancer_categories(category_id)")
    .eq("application_status", "approved");

  if (recipientsError) {
    console.error("sendMessage: kunne ikke finde modtagere", recipientsError);
    return { success: false, error: "Beskeden blev gemt, men modtagerlisten kunne ikke oprettes." };
  }

  type ApprovedRow = { id: string; freelancer_categories: { category_id: string }[] | null };
  const recipientIds = ((approved ?? []) as ApprovedRow[])
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
  }

  revalidatePath("/admin/messages");
  return { success: true };
}

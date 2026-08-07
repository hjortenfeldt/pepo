"use server";

import { getCompanyBySubdomain } from "@/lib/tenant";
import { getEventStatusByToken, addClientMessageByEventToken } from "@/lib/event-status";
import { addClientMessageByToken } from "@/lib/event-requests";
import { uploadMessageAttachment, type NewMessageAttachment } from "@/lib/event-messages";

/**
 * Klientens generaliserede status/dialog-side (app/tenant/status/[token]) —
 * ingen login, adgang alene via token'et. Se lib/event-status.ts for hvorfor
 * denne findes ved siden af den ældre request-specifikke variant.
 */
export async function getEventStatus(token: string) {
  const company = await getCompanyBySubdomain();
  if (!company) return null;
  return getEventStatusByToken(company.id, token);
}

export async function replyToEventStatus(token: string, body: string, attachments?: NewMessageAttachment[]) {
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };

  const status = await getEventStatusByToken(company.id, token);
  if (!status) return { success: false as const, error: "Kunne ikke finde eventet." };

  if (status.kind === "request") {
    return addClientMessageByToken(company.id, token, body, attachments);
  }
  return addClientMessageByEventToken(company.id, token, body, attachments);
}

export async function uploadEventStatusAttachment(token: string, file: File) {
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  return uploadMessageAttachment(company.id, token, file);
}

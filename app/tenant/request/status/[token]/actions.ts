"use server";

import { getCompanyBySubdomain } from "@/lib/tenant";
import { getEventRequestByToken, addClientMessageByToken } from "@/lib/event-requests";
import { uploadMessageAttachment, type NewMessageAttachment } from "@/lib/event-messages";

/**
 * Klientens egen status/dialog-side (/request/status/[token]) — ingen
 * login, adgang er alene token-baseret (se event_requests.access_token,
 * unik og unguessable). Samme tynde "use server"-wrapper-mønster som
 * app/tenant/request/actions.ts.
 */
export async function getEventRequestStatus(token: string) {
  const company = await getCompanyBySubdomain();
  if (!company) return null;
  return getEventRequestByToken(company.id, token);
}

export async function replyToEventRequest(token: string, body: string, attachments?: NewMessageAttachment[]) {
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  return addClientMessageByToken(company.id, token, body, attachments);
}

/** Uploader én vedhæftning til klientens svar, FØR selve beskeden sendes — se uploadMessageAttachment. */
export async function uploadEventMessageAttachment(token: string, file: File) {
  const company = await getCompanyBySubdomain();
  if (!company) return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  return uploadMessageAttachment(company.id, token, file);
}

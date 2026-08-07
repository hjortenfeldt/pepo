import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Delt beskedtråd-logik — genbruges af tre helt forskellige overflader:
 * 1. Den to-vejs-dialog med kunden, BÅDE mens der endnu kun er en
 *    forespørgsel (event_request_id sat, intet event) og efter eventet er
 *    oprettet (event_id sat).
 * 2. Den automatiske, kronologiske ÆNDRINGSLOG (sender "system") — indsat
 *    af de handlinger i shifts/actions.ts der ændrer eventet/vagterne, ALDRIG
 *    vist på klientens offentlige side.
 * 3. Manuelt oprettede events (uden nogen forespørgsel overhovedet) — deres
 *    tråd har kun event_id sat, aldrig event_request_id.
 *
 * Se migrationen "generalize_event_correspondence" og
 * [[project_event_request_feature]] for hele baggrunden.
 *
 * ALT DB-arbejde her går via createAdminClient() (service role) — indsættelse
 * skal virke uanset om kalderen selv har en admin-session (fx en admins svar)
 * eller ej (klientens offentlige side har aldrig én).
 */

export type MessageSender = "admin" | "client" | "system";

export type NewMessageAttachment = { fileName: string; fileUrl: string; fileType: string | null };
export type EventMessageAttachmentItem = { id: string; fileName: string; fileUrl: string; fileType: string | null };

export type EventMessageItem = {
  id: string;
  sender: MessageSender;
  senderName: string | null;
  body: string;
  createdAt: string;
  attachments: EventMessageAttachmentItem[];
};

type RawMessageRow = { id: string; sender: string; sender_name: string | null; body: string; created_at: string };
type RawAttachmentRow = { id: string; message_id: string; file_name: string; file_url: string; file_type: string | null };

function toMessageItems(messages: RawMessageRow[], attachments: RawAttachmentRow[]): EventMessageItem[] {
  const byMessage = new Map<string, EventMessageAttachmentItem[]>();
  for (const a of attachments) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push({ id: a.id, fileName: a.file_name, fileUrl: a.file_url, fileType: a.file_type });
    byMessage.set(a.message_id, list);
  }
  return messages.map((m) => ({
    id: m.id,
    sender: m.sender as MessageSender,
    senderName: m.sender_name,
    body: m.body,
    createdAt: m.created_at,
    attachments: byMessage.get(m.id) ?? [],
  }));
}

async function fetchAttachments(
  supabase: ReturnType<typeof createAdminClient>,
  messageIds: string[]
): Promise<RawAttachmentRow[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from("event_message_attachments")
    .select("id, message_id, file_name, file_url, file_type")
    .in("message_id", messageIds);
  if (error) {
    console.error("fetchAttachments fejlede", error);
    return [];
  }
  return (data ?? []) as RawAttachmentRow[];
}

/** Fuld tråd for én forespørgsel (bruges både før og efter accept — event_request_id ændrer sig aldrig). */
export async function getMessagesForRequest(companyId: string, eventRequestId: string): Promise<EventMessageItem[]> {
  const supabase = createAdminClient();
  const { data: messages, error } = await supabase
    .from("event_messages")
    .select("id, sender, sender_name, body, created_at")
    .eq("event_request_id", eventRequestId)
    .eq("company_id", companyId)
    .order("created_at");

  if (error) {
    console.error("getMessagesForRequest fejlede", error);
    return [];
  }

  const ids = (messages ?? []).map((m) => m.id as string);
  const attachments = await fetchAttachments(supabase, ids);
  return toMessageItems((messages ?? []) as RawMessageRow[], attachments);
}

/**
 * Fuld tråd for ÉT event — uanset om det stammer fra en accepteret
 * forespørgsel (samme rækker som getMessagesForRequest, blot fundet via
 * event_id i stedet) eller er oprettet helt manuelt uden nogen forespørgsel.
 * Bruges af "Korrespondance"-knappens visning på /shifts/event/[id].
 * Inkluderer system-beskederne — kaldende UI viser dem, klientens
 * offentlige side gør ikke (filtreres væk der, se app/tenant/status).
 */
export async function getMessagesForEvent(companyId: string, eventId: string): Promise<EventMessageItem[]> {
  const supabase = createAdminClient();
  const { data: messages, error } = await supabase
    .from("event_messages")
    .select("id, sender, sender_name, body, created_at")
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .order("created_at");

  if (error) {
    console.error("getMessagesForEvent fejlede", error);
    return [];
  }

  const ids = (messages ?? []).map((m) => m.id as string);
  const attachments = await fetchAttachments(supabase, ids);
  return toMessageItems((messages ?? []) as RawMessageRow[], attachments);
}

/**
 * Indsætter én besked i en tråd. Præcis hvilke(t) af eventRequestId/eventId
 * der er sat afgør hvor den dukker op — se filens toppkommentar. Bruges
 * direkte af klientens/adminens svar-handlinger OG af logEventSystemMessage
 * nedenfor.
 */
export async function insertEventMessage(input: {
  companyId: string;
  eventRequestId?: string | null;
  eventId?: string | null;
  sender: MessageSender;
  senderName?: string | null;
  body: string;
  attachments?: NewMessageAttachment[];
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const trimmed = input.body.trim();
  const hasAttachments = (input.attachments?.length ?? 0) > 0;
  if (!trimmed && !hasAttachments) return { success: false, error: "Beskeden må ikke være tom." };

  const supabase = createAdminClient();

  const { data: message, error } = await supabase
    .from("event_messages")
    .insert({
      company_id: input.companyId,
      event_request_id: input.eventRequestId ?? null,
      event_id: input.eventId ?? null,
      sender: input.sender,
      sender_name: input.senderName ?? null,
      body: trimmed,
      // Afsenderen har jo selv lige "set" sin egen besked — kun modparten
      // mangler at læse den. System-beskeder regnes som "set" af admin fra
      // start (de er selv resultatet af en admin-handling), og vises aldrig
      // for klienten overhovedet, så read_by_client er reelt irrelevant der.
      read_by_admin: input.sender === "admin" || input.sender === "system",
      read_by_client: input.sender === "client",
    })
    .select("id")
    .single();

  if (error || !message) {
    console.error("insertEventMessage fejlede", error);
    return { success: false, error: "Kunne ikke gemme beskeden. Prøv igen." };
  }

  if (input.attachments && input.attachments.length > 0) {
    const { error: attachError } = await supabase.from("event_message_attachments").insert(
      input.attachments.map((a) => ({
        message_id: message.id,
        company_id: input.companyId,
        file_name: a.fileName,
        file_url: a.fileUrl,
        file_type: a.fileType,
      }))
    );
    if (attachError) {
      console.error("insertEventMessage: kunne ikke gemme vedhæftninger", attachError);
    }
  }

  return { success: true, messageId: message.id as string };
}

/** Samme "fjern æ/ø/mellemrum osv."-rensning som shifts/actions.ts' uploadAttachment — Supabase Storage-nøgler tåler ikke danske bogstaver eller mellemrum. */
function sanitizeStorageFilename(name: string): string {
  const withoutDanishLetters = name
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const cleaned = withoutDanishLetters
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");

  return cleaned || "fil";
}

/**
 * Uploader én vedhæftning til bucket'en "message-attachments" og returnerer
 * dens offentlige URL — bruges af BÅDE klientens og adminens svar-bokse, FØR
 * selve beskeden er indsat (message_id kendes derfor ikke endnu, sættes af
 * insertEventMessage bagefter). `folderKey` er typisk forespørgslens
 * access_token (klientsiden, ingen anden stabil unik nøgle uden login) eller
 * dens id (adminsiden) — bruges kun til at gruppere filerne i storage, ikke
 * til adgangskontrol (den sker udelukkende via companyId + service role).
 */
export async function uploadMessageAttachment(
  companyId: string,
  folderKey: string,
  file: File
): Promise<{ success: true; attachment: NewMessageAttachment } | { success: false; error: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Ingen fil valgt." };
  }

  const supabase = createAdminClient();
  const path = `${companyId}/${folderKey}/${crypto.randomUUID()}-${sanitizeStorageFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("message-attachments")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    console.error("uploadMessageAttachment: upload fejlede", uploadError);
    return { success: false, error: "Kunne ikke uploade filen. Prøv igen." };
  }

  const { data: publicUrlData } = supabase.storage.from("message-attachments").getPublicUrl(path);

  return {
    success: true,
    attachment: { fileName: file.name, fileUrl: publicUrlData.publicUrl, fileType: file.type || null },
  };
}

/** Markerer alle klient-beskeder i ÉT events tråd som læst af admin — kaldes når EventDeepLinkView/dens page.tsx henter tråden. */
export async function markEventMessagesReadByAdmin(companyId: string, eventId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("event_messages")
    .update({ read_by_admin: true })
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .eq("sender", "client");
  if (error) console.error("markEventMessagesReadByAdmin fejlede", error);
}

/**
 * Genererer og indsætter én system-besked (den kronologiske ændringslog) —
 * kaldes fra shifts/actions.ts's mutationer EFTER selve ændringen er gemt.
 * Fejler aldrig hårdt for den kaldende handling (samme filosofi som
 * push-koden) — en fejlet log-besked skal ikke vælte den faktiske gemning.
 */
export async function logEventSystemMessage(
  companyId: string,
  eventId: string,
  adminName: string | null,
  body: string
): Promise<void> {
  try {
    await insertEventMessage({ companyId, eventId, sender: "system", senderName: adminName, body });
  } catch (err) {
    console.error("logEventSystemMessage fejlede", err);
  }
}

/**
 * Den indloggede admins fulde navn, til brug som sender_name på beskeder
 * (både rigtige svar og system-log-linjer). Tager sessions-klienten som
 * parameter i stedet for selv at oprette en, da kalderen typisk allerede har
 * én til rådighed fra sin egen company/auth-opslag.
 */
export async function getCurrentAdminName(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase.from("admin_users").select("full_name").eq("id", user.id).maybeSingle();
  return (admin?.full_name as string | undefined) ?? null;
}

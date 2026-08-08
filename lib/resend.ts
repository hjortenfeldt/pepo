// Minimal Resend-integration — almindelig fetch mod deres REST API i stedet
// for at tilføje endnu en SDK-afhængighed for ét enkelt endpoint. Bruges
// KUN af Send Email-hooket (app/api/auth/send-email/route.ts), som er den
// første kode i repoet der selv sender e-mail direkte (SMTP-relayen til
// Resend, konfigureret i Supabase Dashboard > Auth > SMTP Settings, er en
// helt separat, allerede fungerende ting — se
// [[project_email_delivery_todo]] — men den kan ikke bruges til DENNE
// e-mail, da den kun sender Supabase's egen faste skabelon).
//
// RESEND_API_KEY er en NY miljøvariabel (findes ikke fra før), skal
// tilføjes i Vercel — se .env.local.example.
const RESEND_API_URL = "https://api.resend.com/emails";

// mail.pepo.team er allerede verificeret som afsender-domæne i Resend (se
// [[project_email_delivery_todo]]) — al e-mail herfra bruger denne faste
// adresse, uanset tenant (der er IKKE noget pr.-virksomhed-domæne i Resend —
// det ville kræve at hver tenant selv verificerer DNS/DKIM/SPF for deres
// eget domæne, se [[project_client_emails_send_wiring_audit]]).
const FROM_EMAIL = "pepo@mail.pepo.team";
const DEFAULT_FROM_NAME = "Pepo";

// Fjerner tegn der ville ødelægge/manipulere selve From-headeren, hvis en
// admin/tenant et sted kunne nå at skrive dem ind i et virksomhedsnavn
// (citationstegn, vinkelparenteser, linjeskift). Virksomhedsnavnet selv er
// ellers ret fri tekst (indtastet under Indstillinger > Virksomhed).
function sanitizeHeaderValue(value: string): string {
  return value.replace(/["<>\r\n]/g, "").trim();
}

/**
 * Bygger "From"-headeren. Uden `fromName` (fx auth-mails uden nogen
 * virksomhedskontekst) er den simpelthen "Pepo <pepo@mail.pepo.team>". Med
 * `fromName` (klientens booking-godkendt/opfølgnings-/besked-mails,
 * freelancerens invitationsmail) bliver den simpelthen "<Virksomhed>
 * <pepo@mail.pepo.team>" — samme underliggende, allerede-verificerede
 * adresse, men modtageren ser udelukkende virksomhedens eget navn, ikke
 * "Pepo" (Hjorths reviderede valg 2026-08-08 — først besluttet som
 * "<Virksomhed> via Pepo", derefter forenklet til blot "<Virksomhed>", se
 * [[project_client_emails_send_wiring_audit]]).
 */
function buildFromHeader(fromName?: string | null): string {
  if (!fromName) return `${DEFAULT_FROM_NAME} <${FROM_EMAIL}>`;
  const clean = sanitizeHeaderValue(fromName);
  if (!clean) return `${DEFAULT_FROM_NAME} <${FROM_EMAIL}>`;
  return `${clean} <${FROM_EMAIL}>`;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  fromName,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Virksomhedens navn, til afsendernavnet ("<Virksomhed> <pepo@mail.pepo.team>") — se buildFromHeader. Udelades for mails uden nogen virksomhedskontekst (auth-mails). */
  fromName?: string | null;
  /** Sætter Reply-To til virksomhedens egen email, så et svar fra klienten lander hos DEM, ikke i en Pepo-postkasse ingen tjekker. Udelades hvis virksomheden ikke har udfyldt en kontakt-email. */
  replyTo?: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY mangler — kan ikke sende e-mail.");
  }

  const payload: Record<string, unknown> = {
    from: buildFromHeader(fromName),
    to: [to],
    subject,
    html,
    text,
  };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend afviste e-mailen (${response.status}): ${body}`);
  }
}

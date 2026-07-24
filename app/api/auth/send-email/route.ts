import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import {
  buildInvitationEmailHtml,
  buildInvitationEmailText,
  buildSimpleAuthEmailHtml,
  buildSimpleAuthEmailText,
  renderInvitationTokens,
  DEFAULT_FREELANCER_INVITATION_SUBJECT,
  DEFAULT_FREELANCER_INVITATION_BODY,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

/**
 * Supabase Auth "Send Email"-hook — overtager afsendelsen af ALLE auth-mails
 * i hele projektet fra Supabase's egen SMTP/skabelon (se
 * [[project_email_delivery_todo]]), fordi den generiske "Magic Link"-
 * skabelon i Supabase Dashboard er ÉT globalt template og derfor ikke kan
 * variere pr. virksomhed — nødvendigt for at Indstillinger > Tekster (se
 * components/admin/InvitationTextSettings.tsx) reelt kan ændre ordlyden.
 *
 * Aktiveres i Supabase Dashboard > Authentication > Hooks > "Send Email
 * hook" (HTTPS), peget på denne rutes fulde URL, med en genereret hemmelig
 * nøgle (format "v1,whsec_...") gemt som SEND_EMAIL_HOOK_SECRET i Vercel.
 * Se Standard Webhooks-specifikationen (standardwebhooks-pakken) for selve
 * signaturverifikationen — headers `webhook-id`/`webhook-timestamp`/
 * `webhook-signature`.
 *
 * Kun TO reelle afsendelsesveje findes i kodebasen i dag (se undersøgelsen
 * der lå til grund for denne fil): "magiclink" (freelancerens login-kode —
 * enten selvbetjent fra /login, eller udløst af en admins "Send
 * invitation", se lib/tenant-admin-freelancers-actions) og "recovery"
 * (ny tenant-admins "sæt din adgangskode"-link, udløst af inviteAdmin/
 * inviteCompanyAdmin). Tenant-admin/super-admin ROUTINE-login er
 * password-baseret og rammer aldrig denne hook. En eventuel fremtidig,
 * uventet email_action_type falder tilbage til en simpel, ubrandet
 * kode-email frem for slet ingen email.
 */
export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    console.error("send-email hook: SEND_EMAIL_HOOK_SECRET mangler i miljøvariablerne");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  let user: HookUser;
  let emailData: HookEmailData;
  try {
    const wh = new Webhook(secret.replace("v1,whsec_", ""));
    const verified = wh.verify(payload, headers) as { user: HookUser; email_data: HookEmailData };
    user = verified.user;
    emailData = verified.email_data;
  } catch (err) {
    console.error("send-email hook: signaturverifikation fejlede", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!user.email) {
    console.error("send-email hook: bruger uden email", user.id);
    return NextResponse.json({ error: "Bruger mangler email" }, { status: 400 });
  }

  try {
    if (emailData.email_action_type === "recovery") {
      await sendRecoveryEmail(user, emailData);
    } else {
      await sendOtpEmail(user, emailData);
    }
  } catch (err) {
    console.error("send-email hook: afsendelse fejlede", emailData.email_action_type, err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  // Tomt 200-svar er alt Supabase forventer af et vellykket hook-kald.
  return NextResponse.json({});
}

type HookUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type HookEmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  site_url: string;
  email_action_type: string;
};

async function sendOtpEmail(user: HookUser, emailData: HookEmailData) {
  const companyId = typeof user.user_metadata?.invited_company_id === "string" ? user.user_metadata.invited_company_id : null;

  if (companyId) {
    const sent = await trySendFreelancerInvitation(user, emailData, companyId);
    if (sent) return;
    // Firma/profil kunne ikke slås op — falder igennem til den simple
    // kode-email herunder frem for at fejle helt.
  }

  // Almindelig, tilbagevendende login-kode — freelancerens egen "Send
  // kode" på /login. Ingen invitations-kontekst, derfor ingen
  // firma-branding, bare selve koden.
  await sendEmail({
    to: user.email!,
    subject: "Din login-kode til Pepo",
    html: buildSimpleAuthEmailHtml({
      greeting: "Din login-kode",
      message: "Brug koden herunder for at logge ind i Pepo.",
      otpCode: emailData.token,
    }),
    text: buildSimpleAuthEmailText({
      greeting: "Din login-kode",
      message: "Brug koden herunder for at logge ind i Pepo.",
      otpCode: emailData.token,
    }),
  });
}

/** Returnerer true, hvis den fulde branded invitationsmail blev sendt.
 * Returnerer false (uden at kaste), hvis firma eller freelancerprofil ikke
 * kunne findes — kalderen falder da tilbage til den simple kode-email. */
async function trySendFreelancerInvitation(user: HookUser, emailData: HookEmailData, companyId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, contact_phone, contact_email, logo_url, freelancer_invitation_email_subject, freelancer_invitation_email_body")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("freelancer_profiles")
      .select("full_name, phone, email")
      .eq("auth_user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  if (!company || !profile) {
    console.error("send-email hook: kunne ikke slå firma/profil op til invitation", companyId, user.id);
    return false;
  }

  const values = {
    companyName: company.name ?? "",
    companyPhone: company.contact_phone ?? "",
    companyEmail: company.contact_email ?? "",
    freelancerFirstName: (profile.full_name ?? "").trim().split(/\s+/)[0] || "",
    freelancerFullName: profile.full_name ?? "",
    freelancerEmail: profile.email || user.email!,
  };

  const subjectTemplate = company.freelancer_invitation_email_subject || DEFAULT_FREELANCER_INVITATION_SUBJECT;
  const bodyTemplate = company.freelancer_invitation_email_body || DEFAULT_FREELANCER_INVITATION_BODY;

  const subject = renderInvitationTokens(subjectTemplate, values);
  const bodyText = renderInvitationTokens(bodyTemplate, values);

  await sendEmail({
    to: user.email!,
    subject,
    html: buildInvitationEmailHtml({ bodyText, companyLogoUrl: company.logo_url ?? null, otpCode: emailData.token }),
    text: buildInvitationEmailText(bodyText, emailData.token),
  });
  return true;
}

async function sendRecoveryEmail(user: HookUser, emailData: HookEmailData) {
  // Supabase's eget /auth/v1/verify-endpoint gør selve verifikationen af
  // token_hash og opretter sessionen, før det sender brugeren videre til
  // redirect_to — nøjagtig samme link Supabase's egen skabelon ellers ville
  // have brugt, vi bygger det bare selv.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(emailData.token_hash)}&type=recovery&redirect_to=${encodeURIComponent(emailData.redirect_to)}`;

  await sendEmail({
    to: user.email!,
    subject: "Sæt din adgangskode til Pepo Admin",
    html: buildSimpleAuthEmailHtml({
      greeting: "Velkommen til Pepo Admin",
      message: "Du er blevet oprettet som admin-bruger. Tryk på knappen herunder for at sætte din adgangskode og komme i gang.",
      cta: { label: "Sæt din adgangskode", url: verifyUrl },
    }),
    text: buildSimpleAuthEmailText({
      greeting: "Velkommen til Pepo Admin",
      message: "Du er blevet oprettet som admin-bruger. Sæt din adgangskode via linket herunder for at komme i gang.",
      cta: { label: "Sæt din adgangskode", url: verifyUrl },
    }),
  });
}

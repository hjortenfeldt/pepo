import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { sendEmail } from "@/lib/resend";
import { buildSimpleAuthEmailHtml, buildSimpleAuthEmailText } from "@/lib/email-templates";

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
 * der lå til grund for denne fil): "magiclink" (freelancerens login-kode,
 * UDELUKKENDE den selvbetjente "Send kode" på /login — en admins "Send
 * invitation" sender IKKE længere en kode, se doc-kommentaren på
 * sendFreelancerInvitation i app/tenant/(protected)/freelancers/actions.ts
 * for hvorfor de to er adskilt) og "recovery" (ny tenant-admins "sæt din
 * adgangskode"-link, udløst af inviteAdmin/inviteCompanyAdmin).
 * Tenant-admin/super-admin ROUTINE-login er password-baseret og rammer
 * aldrig denne hook. Ingen af de to grene her er pr. virksomhed
 * tilpasselige — det er kun selve invitationsmailen (sendt direkte, uden om
 * denne hook, se lib/email-templates.ts).
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
};

type HookEmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  site_url: string;
  email_action_type: string;
};

/** Altid den simple, ubrandede login-kode-email — den eneste "magiclink"
 * afsendelsesvej tilbage er freelancerens egen selvbetjente "Send kode" på
 * /login (se doc-kommentaren ovenfor). */
async function sendOtpEmail(user: HookUser, emailData: HookEmailData) {
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

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
// [[project_email_delivery_todo]]) — al e-mail herfra bruger dette faste
// afsendernavn/-adresse.
const FROM_ADDRESS = "Pepo <pepo@mail.pepo.team>";

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY mangler — kan ikke sende e-mail.");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend afviste e-mailen (${response.status}): ${body}`);
  }
}

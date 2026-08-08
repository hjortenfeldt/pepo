// Skabelon + rendering for e-mails Pepo selv sender (i modsætning til
// Supabase's generiske "Magic Link"-skabelon, som IKKE understøtter
// per-virksomhed tekst — se [[project_email_delivery_todo]]/den nye
// Send-Email-hook i app/api/auth/send-email/route.ts, som overtager selve
// afsendelsen fra Supabase for at gøre dette muligt).
//
// Første (og indtil videre eneste) skabelon: freelancer-invitationsmailen,
// redigerbar pr. virksomhed fra Indstillinger > Tekster
// (components/admin/InvitationTextSettings.tsx). Selve HTML-skallen
// (logo/footer/trin-boks-styling) er IKKE en del af den redigerbare tekst —
// kun brødteksten er fri tekst, skallen er fast kode her i filen.

// Kort-koderne skrives i firkantede parenteser og engelsk navngivning (som
// ønsket af Hjorth), men selve beskrivelserne til admin-UI'et er danske.
export const INVITATION_EMAIL_TOKENS: { token: string; description: string }[] = [
  { token: "[company-name]", description: "Virksomhedens navn" },
  { token: "[company-phone-number]", description: "Virksomhedens telefonnummer" },
  { token: "[company-email]", description: "Virksomhedens emailadresse" },
  { token: "[freelancer-first-name]", description: "Freelancerens fornavn" },
  { token: "[freelancer-full-name]", description: "Freelancerens fulde navn" },
  { token: "[freelancer-email]", description: "Freelancerens emailadresse (den, freelanceren selv skal logge ind med)" },
];

export const DEFAULT_FREELANCER_INVITATION_SUBJECT =
  "Invitation fra [company-name] til at blive en del af teamet";

export const DEFAULT_FREELANCER_INVITATION_BODY = `Kære [freelancer-first-name],
[company-name] har inviteret dig til at blive en del af deres team.

Som medarbejder/freelancer for [company-name] skal du bruge app'en Pepo (Personaleportalen). I app'en kan du se og anmode om de vagter, du kunne tænke dig at tage. Og app'en holder også styr på dine arbejdstimer og giver dig alle informationer, du skal bruge til hvert job.

Sådan gør du:
1) På din telefon, gå til hjemmeside-adressen app.pepo.team.
2) Indtast din email ([freelancer-email])
3) Indtast den kode, du nu modtager.
4) Følg vejledningen på skærmen for at installere appen på din telefon.

Velkommen ombord!
Vi glæder os til at arbejde sammen med dig ❤️

Kh,
[company-name] (og Personaleportalen)`;

export type InvitationTokenValues = {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  freelancerFirstName: string;
  freelancerFullName: string;
  freelancerEmail: string;
};

// Simpel find/erstat — ingen grund til en skabelon-motor for seks faste
// kort-koder. `replaceAll` er fint her, da ingen af kort-koderne kan
// forekomme som delstreng i en anden (alle er unikke, firkantede-parentes-
// indpakkede tokens).
export function renderInvitationTokens(text: string, values: InvitationTokenValues): string {
  return text
    .replaceAll("[company-name]", values.companyName)
    .replaceAll("[company-phone-number]", values.companyPhone)
    .replaceAll("[company-email]", values.companyEmail)
    .replaceAll("[freelancer-first-name]", values.freelancerFirstName)
    .replaceAll("[freelancer-full-name]", values.freelancerFullName)
    .replaceAll("[freelancer-email]", values.freelancerEmail);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pepoLogoUrl(): string {
  // Samme mønster som resten af koden bruger for roddomænet (fx
  // proxy.ts/lib/tenant.ts) — se NEXT_PUBLIC_ROOT_DOMAIN i .env.local.example.
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";
  return `https://${root}/pepo-logo-email.png`;
}

/** Den store, tydelige kode-boks — IKKE en del af den redigerbare tekst
 * (kan derfor ikke ved en fejl fjernes af en admin, der omskriver
 * brødteksten). Vist mellem selve teksten og "Åbn app.pepo.team"-knappen i
 * alle e-mails, der reelt indeholder en Supabase OTP-kode (invitation OG
 * almindelig "send login-kode"). */
function renderCodeBoxHtml(code: string): string {
  return `<div style="text-align:center;margin:0 0 26px;">
    <div style="font-size:11px;font-weight:500;color:#aeaeb2;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Din kode</div>
    <div style="display:inline-block;background:#f8f8fa;border:1px solid #e5e5ea;border-radius:12px;padding:14px 28px;font-size:26px;font-weight:700;letter-spacing:0.28em;color:#1d1d1f;font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;">${escapeHtml(code)}</div>
  </div>`;
}

/** Fælles HTML-skal (hvid boks, Pepo-footer) delt af alle skabeloner i
 * denne fil — kun det, der ligger MELLEM header og footer, varierer. */
function renderEmailShell({ headerHtml, bodyHtml, topPadding }: { headerHtml: string; bodyHtml: string; topPadding: string }): string {
  return `<!DOCTYPE html>
<html lang="da">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:40px 16px;background:#f0f0f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    ${headerHtml}
    <div style="padding:${topPadding} 48px 8px;">
      ${bodyHtml}
    </div>
    <div style="height:1px;background:#e5e5ea;margin:8px 48px 0;"></div>
    <div style="padding:20px 48px 30px;display:flex;align-items:center;gap:8px;">
      <img src="${pepoLogoUrl()}" alt="Pepo" width="22" height="22" style="width:22px;height:22px;border-radius:6px;display:block;" />
      <span style="font-size:11.5px;color:#aeaeb2;">Sendt via Pepo – Personaleportalen</span>
    </div>
  </div>
</body>
</html>`;
}

function ctaButtonHtml(label: string, url: string): string {
  return `<div style="text-align:center;margin:4px 0 30px;">
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#3e1f8a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:10px;">${escapeHtml(label)}</a>
  </div>`;
}

/**
 * Konverterer den (evt. admin-redigerede) fri-tekst brødtekst til HTML —
 * afsnit adskilt af en tom linje, og et afsnit hvor ALLE linjer starter med
 * "N)" gengives som den samme nummererede trin-boks som i det godkendte
 * mockup (Prototyper/Pepo – Freelancer invitation email.html), i stedet for
 * almindelige afsnit. Det allerførste afsnit får den lidt større/federe
 * "hilsen"-typografi (matcher altid "Kære ..."-linjen). Alt andet er
 * almindelige afsnit. HTML escapes alt input — brødteksten er fri tekst
 * skrevet af en tenant-admin, og skal aldrig kunne indsætte vilkårlig HTML.
 */
function renderBodyHtml(bodyText: string): string {
  const blocks = bodyText
    .trim()
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  let isFirstParagraph = true;

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const isStepList = lines.length > 0 && lines.every((l) => /^\d+\)\s*/.test(l));

      if (isStepList) {
        const items = lines
          .map((line, i) => {
            const match = line.match(/^(\d+)\)\s*(.*)$/);
            const num = match ? match[1] : String(i + 1);
            const text = escapeHtml(match ? match[2] : line);
            const borderStyle = i === lines.length - 1 ? "" : "border-bottom:1px solid #e5e5ea;";
            return `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 0;${borderStyle}">
              <div style="flex-shrink:0;width:24px;height:24px;border-radius:999px;background:#3e1f8a;color:#ffffff;font-size:12px;font-weight:600;line-height:24px;text-align:center;">${num}</div>
              <div style="font-size:14px;line-height:1.5;color:#1d1d1f;">${text}</div>
            </div>`;
          })
          .join("");
        return `<div style="background:#f8f8fa;border-radius:14px;padding:6px 22px;margin:0 0 26px;">${items}</div>`;
      }

      const inner = escapeHtml(block).replace(/\n/g, "<br/>");
      const isGreeting = isFirstParagraph;
      isFirstParagraph = false;
      return isGreeting
        ? `<p style="font-size:19px;font-weight:600;color:#1d1d1f;letter-spacing:-0.01em;margin:0 0 20px;">${inner}</p>`
        : `<p style="font-size:14.5px;line-height:1.65;color:#3a3a3d;margin:0 0 20px;">${inner}</p>`;
    })
    .join("\n");
}

/**
 * Selve HTML-skallen — logo/footer/branding er FAST kode, ikke en del af
 * den redigerbare tekst. `companyLogoUrl` er null, hvis virksomheden ikke
 * har uploadet et logo (se companies.logo_url) — headeren udelades da helt
 * (intet firmanavn som erstatning, som besluttet i mockup-godkendelsen).
 *
 * Ingen kode i denne mail — invitationen er bevidst adskilt fra selve
 * login-kode-flowet (se doc-kommentaren på sendFreelancerInvitation i
 * app/tenant/(protected)/freelancers/actions.ts for hvorfor): freelanceren
 * modtager sin faktiske kode først, når de selv indtaster deres email på
 * login-siden.
 */
export function buildInvitationEmailHtml({
  bodyText,
  companyLogoUrl,
}: {
  bodyText: string;
  companyLogoUrl: string | null;
}): string {
  const header = companyLogoUrl
    ? `<div style="padding:36px 48px 0;display:flex;align-items:center;justify-content:flex-end;">
        <img src="${escapeHtml(companyLogoUrl)}" alt="" height="34" style="height:34px;max-width:160px;object-fit:contain;display:block;" />
      </div>`
    : "";

  const body = `${renderBodyHtml(bodyText)}
    ${ctaButtonHtml("Åbn app.pepo.team", "https://app.pepo.team")}`;

  return renderEmailShell({ headerHtml: header, bodyHtml: body, topPadding: companyLogoUrl ? "28px" : "44px" });
}

/** Almindelig tekst-udgave (samme brødtekst, uden HTML) — sendes som
 * text/plain-alternativ ved siden af HTML-udgaven, god praksis for
 * leverbarhed og tilgængelighed. */
export function buildInvitationEmailText(bodyText: string): string {
  return `${bodyText.trim()}\n\nÅbn app.pepo.team: https://app.pepo.team`;
}

// ---------------------------------------------------------------------------
// Klient-mails (2026-08-09) — booking-godkendt og event-opfølgning. Begge
// deler samme kort-kode-sæt (samme kontekst: en kunde, ét event), se
// [[project_texts_settings_next_steps]]. IKKE forbundet til nogen reel
// afsendelse endnu — kun selve skabelonerne + Tekster-siden er bygget indtil
// videre; "godkend booking"-flowet og et post-event-cron-job, der rent
// faktisk KALDER disse render-funktioner, er et senere skridt.
// ---------------------------------------------------------------------------

export const EVENT_EMAIL_TOKENS: { token: string; description: string }[] = [
  { token: "[company-name]", description: "Virksomhedens navn" },
  { token: "[company-phone-number]", description: "Virksomhedens telefonnummer" },
  { token: "[company-email]", description: "Virksomhedens emailadresse" },
  { token: "[client-name]", description: "Kundens kontaktperson (fulde navn)" },
  { token: "[client-first-name]", description: "Kundens kontaktperson (kun fornavn)" },
  { token: "[event-name]", description: "Eventets titel" },
  { token: "[event-date]", description: "Eventets dato" },
  { token: "[event-venue]", description: "Eventstedets navn/adresse" },
  { token: "[booked-staff]", description: "Det bookede personale (jobfunktioner og antal)" },
  { token: "[event-status-url]", description: "Link til kundens egen status-/dialogside for eventet" },
  { token: "[approved-by-name]", description: "Navnet på den admin, der godkendte bookingen" },
  { token: "[google-review-link]", description: "Jeres Google-anmeldelseslink (indstilles under Vigtige URL'er)" },
  { token: "[company-website-url]", description: "Jeres hjemmeside-adresse (indstilles under Vigtige URL'er)" },
  { token: "[rental-terms-url]", description: "Link til jeres lejebestemmelser (indstilles under Vigtige URL'er)" },
  { token: "[faq-url]", description: "Link til jeres FAQ (indstilles under Vigtige URL'er)" },
];

export type EventEmailTokenValues = {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  clientName: string;
  clientFirstName: string;
  eventName: string;
  eventDate: string;
  eventVenue: string;
  bookedStaff: string;
  eventStatusUrl: string;
  approvedByName: string;
  googleReviewLink: string;
  companyWebsiteUrl: string;
  rentalTermsUrl: string;
  faqUrl: string;
};

/** Samme "simpel find/erstat"-tilgang som renderInvitationTokens — se dens
 * kommentar for hvorfor ingen skabelon-motor er nødvendig her. */
export function renderEventEmailTokens(text: string, values: EventEmailTokenValues): string {
  return text
    .replaceAll("[company-name]", values.companyName)
    .replaceAll("[company-phone-number]", values.companyPhone)
    .replaceAll("[company-email]", values.companyEmail)
    .replaceAll("[client-name]", values.clientName)
    .replaceAll("[client-first-name]", values.clientFirstName)
    .replaceAll("[event-name]", values.eventName)
    .replaceAll("[event-date]", values.eventDate)
    .replaceAll("[event-venue]", values.eventVenue)
    .replaceAll("[booked-staff]", values.bookedStaff)
    .replaceAll("[event-status-url]", values.eventStatusUrl)
    .replaceAll("[approved-by-name]", values.approvedByName)
    .replaceAll("[google-review-link]", values.googleReviewLink)
    .replaceAll("[company-website-url]", values.companyWebsiteUrl)
    .replaceAll("[rental-terms-url]", values.rentalTermsUrl)
    .replaceAll("[faq-url]", values.faqUrl);
}

/** Splitter et fuldt navn til fornavn — samme inline-mønster som
 * RegistrationForm.tsx bruger til freelancer-velkomsthilsenen. Ingen delt
 * util findes andetsteds i kodebasen; "kunde" er faldback-tiltale hvis
 * kontaktpersonen mangler et navn (fx en gammel klient uden udfyldt felt). */
export function firstNameOf(fullName: string | null | undefined, fallback = "kunde"): string {
  return fullName?.trim().split(/\s+/)[0] || fallback;
}

export const DEFAULT_BOOKING_APPROVED_SUBJECT = "Jeres booking hos [company-name] er bekræftet";

export const DEFAULT_BOOKING_APPROVED_BODY = `Kære [client-first-name]

Godt nyt!
Vi bekræfter hermed jeres booking af personale til "[event-name]" den [event-date] ([event-venue]).

Vi giver lyd igen, når vi har besat jeres ønskede vagter:
[booked-staff]

I kan følge status for bookingen her:
[event-status-url]

Via ovenstående URL kan I også løbende sende os beskeder eller spørgsmål, rette i bookingen eller tilføje yderligere personale.

Og har I brug for at afklare noget telefonisk, er I også velkomne til at ringe til os på [company-phone-number].

Vi glæder os til at hjælpe med at gøre jeres arrangement til en succes 🤗❤️

Kh,
[approved-by-name]
[company-name]`;

export const DEFAULT_EVENT_FOLLOWUP_SUBJECT = "Hvordan gik det med [event-name]?";

export const DEFAULT_EVENT_FOLLOWUP_BODY = `Kære [client-first-name]

Tusind tak fordi I valgte [company-name] til at hjælpe til jeres arrangement "[event-name]"!

Vi håber, at vores personale levede op til jeres forventninger og at både I og jeres gæster havde en god oplevelse.

Hvis I har et ledigt minut, vil vi blive vildt glade for at få en mini-bedømmelse på Google - det hjælper andre til at opdage, at vi gør os umage ☝️😃
Det direkte link til at bedømme os er:
[google-review-link].

Tak for denne gang - vi håber at se jer igen! ❤️

Kh,
[approved-by-name]
[company-name]
[company-website-url]`;

/** Samme HTML-skal/knap-mønster som invitationsmailen — ingen firmalogo-
 * header her (disse mails sendes til KUNDEN, ikke freelanceren, men skallen
 * er identisk; company-logo tilføjes hvis/når det bliver relevant). CTA'en
 * peger på selve status-siden i stedet for app.pepo.team. */
export function buildBookingApprovedEmailHtml({
  bodyText,
  companyLogoUrl,
  statusUrl,
}: {
  bodyText: string;
  companyLogoUrl: string | null;
  statusUrl: string;
}): string {
  const header = companyLogoUrl
    ? `<div style="padding:36px 48px 0;display:flex;align-items:center;justify-content:flex-end;">
        <img src="${escapeHtml(companyLogoUrl)}" alt="" height="34" style="height:34px;max-width:160px;object-fit:contain;display:block;" />
      </div>`
    : "";
  const body = `${renderBodyHtml(bodyText)}
    ${ctaButtonHtml("Se status for jeres booking", statusUrl)}`;
  return renderEmailShell({ headerHtml: header, bodyHtml: body, topPadding: companyLogoUrl ? "28px" : "44px" });
}

export function buildBookingApprovedEmailText(bodyText: string, statusUrl: string): string {
  return `${bodyText.trim()}\n\nSe status for jeres booking: ${statusUrl}`;
}

export function buildEventFollowupEmailHtml({
  bodyText,
  companyLogoUrl,
  statusUrl,
}: {
  bodyText: string;
  companyLogoUrl: string | null;
  statusUrl: string;
}): string {
  const header = companyLogoUrl
    ? `<div style="padding:36px 48px 0;display:flex;align-items:center;justify-content:flex-end;">
        <img src="${escapeHtml(companyLogoUrl)}" alt="" height="34" style="height:34px;max-width:160px;object-fit:contain;display:block;" />
      </div>`
    : "";
  const body = `${renderBodyHtml(bodyText)}
    ${ctaButtonHtml("Giv os din feedback", statusUrl)}`;
  return renderEmailShell({ headerHtml: header, bodyHtml: body, topPadding: companyLogoUrl ? "28px" : "44px" });
}

export function buildEventFollowupEmailText(bodyText: string, statusUrl: string): string {
  return `${bodyText.trim()}\n\nGiv os din feedback: ${statusUrl}`;
}

/**
 * Generisk, IKKE tenant-tilpasset skabelon — brugt til de to sjældnere
 * auth-mails der (endnu) ikke har nogen "Tekster"-side at hente egen
 * ordlyd fra: en almindelig freelancer-login-kode (selvbetjent "Send
 * kode" på /login, uden invitations-kontekst) og en ny tenant-admins
 * "sæt din adgangskode"-link (inviteAdmin/inviteCompanyAdmin). Samme
 * Pepo-skal (footer/branding), ingen firmalogo-header.
 */
export function buildSimpleAuthEmailHtml({
  greeting,
  message,
  otpCode,
  cta,
}: {
  greeting: string;
  message: string;
  otpCode?: string;
  cta?: { label: string; url: string };
}): string {
  const body = `<p style="font-size:19px;font-weight:600;color:#1d1d1f;letter-spacing:-0.01em;margin:0 0 20px;">${escapeHtml(greeting)}</p>
    <p style="font-size:14.5px;line-height:1.65;color:#3a3a3d;margin:0 0 20px;">${escapeHtml(message)}</p>
    ${otpCode ? renderCodeBoxHtml(otpCode) : ""}
    ${cta ? ctaButtonHtml(cta.label, cta.url) : ""}`;

  return renderEmailShell({ headerHtml: "", bodyHtml: body, topPadding: "44px" });
}

export function buildSimpleAuthEmailText({
  greeting,
  message,
  otpCode,
  cta,
}: {
  greeting: string;
  message: string;
  otpCode?: string;
  cta?: { label: string; url: string };
}): string {
  const parts = [greeting, message];
  if (otpCode) parts.push(`Din kode: ${otpCode}`);
  if (cta) parts.push(`${cta.label}: ${cta.url}`);
  return parts.join("\n\n");
}

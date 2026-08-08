import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { buildTenantUrl } from "@/lib/tenant";
import { formatDateDisplay, venueLabel } from "@/lib/format";
import {
  DEFAULT_EVENT_FOLLOWUP_SUBJECT,
  DEFAULT_EVENT_FOLLOWUP_BODY,
  renderEventEmailTokens,
  buildEventFollowupEmailHtml,
  buildEventFollowupEmailText,
  firstNameOf,
  type EventEmailTokenValues,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

type FollowupRow = {
  event_id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  company_logo_url: string | null;
  company_contact_phone: string | null;
  company_contact_email: string | null;
  event_followup_email_subject: string | null;
  event_followup_email_body: string | null;
  google_review_url: string | null;
  website_url: string | null;
  rental_terms_url: string | null;
  faq_url: string | null;
  client_contact_email: string;
  client_name: string | null;
  client_contact_person: string | null;
  event_title: string;
  event_date: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_postal_code: string | null;
  venue_city: string | null;
  correspondence_token: string;
};

/**
 * "Hvordan gik det med [event]?"-opfølgningsmailen — kaldes 1x i døgnet af
 * Supabase pg_cron (job "pepo-event-followup"), samme mønster som
 * unfilled-shifts-digest. get_events_needing_followup() (migration
 * "add_event_followup_infra") finder events med event_date i fortiden
 * (Europe/Copenhagen) der endnu ikke har fået deres opfølgningsmail — bevidst
 * dato-baseret, ikke et præcist "eventet er slut"-klokkeslæt, da events ikke
 * har noget sluttidspunkt registreret på selve eventet (kun pr. vagt). Se
 * [[project_client_emails_send_wiring_audit]] for hvorfor denne rute
 * overhovedet blev bygget, og [[project_texts_settings_next_steps]] for selve
 * skabelonen/kort-koderne (buildEventFollowupEmailHtml/Text, allerede bygget
 * — denne rute er blot den første ting der reelt KALDER dem).
 *
 * event_followup_sent_at markeres altid i `finally`, uanset om selve
 * afsendelsen lykkedes — samme "aldrig send to gange, heller ikke ved en
 * transient Resend-fejl" filosofi som shift-reminders-rutens
 * reminder_*_sent_at-kolonner.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let sent = 0;

  const { data, error } = await supabase.rpc("get_events_needing_followup");
  if (error) {
    console.error("event-followup: kunne ikke hente events", error);
    return NextResponse.json({ error: "Kunne ikke hente events" }, { status: 500 });
  }

  for (const row of (data ?? []) as FollowupRow[]) {
    try {
      const clientName = row.client_name || row.client_contact_person || "kunde";
      const statusUrl = buildTenantUrl(row.company_slug, `/status/${row.correspondence_token}`);

      const tokenValues: EventEmailTokenValues = {
        companyName: row.company_name,
        companyPhone: row.company_contact_phone || "",
        companyEmail: row.company_contact_email || "",
        clientName,
        clientFirstName: firstNameOf(clientName),
        eventName: row.event_title,
        eventDate: formatDateDisplay(row.event_date),
        eventVenue: venueLabel({
          name: row.venue_name,
          address: row.venue_address,
          postalCode: row.venue_postal_code,
          city: row.venue_city,
        }),
        bookedStaff: "",
        eventStatusUrl: statusUrl,
        // Ingen "godkendt af"-admin giver mening for en automatisk
        // opfølgningsmail (i modsætning til booking-godkendt-mailen) — tom
        // streng frem for at gentage firmanavnet to gange i signaturen.
        approvedByName: "",
        googleReviewLink: row.google_review_url || "",
        companyWebsiteUrl: row.website_url || "",
        rentalTermsUrl: row.rental_terms_url || "",
        faqUrl: row.faq_url || "",
      };

      const subject = renderEventEmailTokens(row.event_followup_email_subject || DEFAULT_EVENT_FOLLOWUP_SUBJECT, tokenValues);
      const bodyText = renderEventEmailTokens(row.event_followup_email_body || DEFAULT_EVENT_FOLLOWUP_BODY, tokenValues);

      await sendEmail({
        to: row.client_contact_email,
        subject,
        html: buildEventFollowupEmailHtml({ bodyText, companyLogoUrl: row.company_logo_url, statusUrl }),
        text: buildEventFollowupEmailText(bodyText, statusUrl),
        fromName: row.company_name,
        replyTo: row.company_contact_email || undefined,
      });
      sent++;
    } catch (err) {
      console.error("event-followup: afsendelse fejlede", row.event_id, err);
    } finally {
      await supabase.from("events").update({ event_followup_sent_at: new Date().toISOString() }).eq("id", row.event_id);
    }
  }

  return NextResponse.json({ sent });
}

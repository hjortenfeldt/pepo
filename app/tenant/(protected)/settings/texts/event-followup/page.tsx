import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import EventEmailTextSettings from "@/components/admin/EventEmailTextSettings";
import { DEFAULT_EVENT_FOLLOWUP_SUBJECT, DEFAULT_EVENT_FOLLOWUP_BODY } from "@/lib/email-templates";

export const metadata: Metadata = { title: "Opfølgningsmail efter event" };
export const dynamic = "force-dynamic";

export default async function EventFollowupTextPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("event_followup_email_subject, event_followup_email_body")
    .eq("id", company.id)
    .single();

  if (error || !data) {
    console.error("EventFollowupTextPage: kunne ikke hente tekster", error);
    redirect("/settings/texts");
  }

  return (
    <EventEmailTextSettings
      templateKind="event-followup"
      cardTitle="Opfølgningsmail efter event"
      cardDescription="Sendes automatisk til kunden, når et event er afviklet, og beder om en tilbagemelding. Emnelinjen og brødteksten herunder er jeres egen tekst — nulstil til Pepos standardtekst når som helst."
      initial={{
        subject: data.event_followup_email_subject ?? DEFAULT_EVENT_FOLLOWUP_SUBJECT,
        body: data.event_followup_email_body ?? DEFAULT_EVENT_FOLLOWUP_BODY,
      }}
      defaultSubject={DEFAULT_EVENT_FOLLOWUP_SUBJECT}
      defaultBody={DEFAULT_EVENT_FOLLOWUP_BODY}
    />
  );
}

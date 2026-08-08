import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import EventEmailTextSettings from "@/components/admin/EventEmailTextSettings";
import { DEFAULT_BOOKING_APPROVED_SUBJECT, DEFAULT_BOOKING_APPROVED_BODY } from "@/lib/email-templates";

export const metadata: Metadata = { title: "Email ved godkendt booking" };
export const dynamic = "force-dynamic";

export default async function BookingApprovedTextPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("booking_approved_email_subject, booking_approved_email_body")
    .eq("id", company.id)
    .single();

  if (error || !data) {
    console.error("BookingApprovedTextPage: kunne ikke hente tekster", error);
    redirect("/settings/texts");
  }

  return (
    <EventEmailTextSettings
      templateKind="booking-approved"
      cardTitle="Email ved godkendt booking"
      cardDescription={
        'Sendes til kunden når I godkender deres eventforespørgsel under "Eventforespørgsler". Emnelinjen og brødteksten herunder er jeres egen tekst — nulstil til Pepos standardtekst når som helst.'
      }
      initial={{
        subject: data.booking_approved_email_subject ?? DEFAULT_BOOKING_APPROVED_SUBJECT,
        body: data.booking_approved_email_body ?? DEFAULT_BOOKING_APPROVED_BODY,
      }}
      defaultSubject={DEFAULT_BOOKING_APPROVED_SUBJECT}
      defaultBody={DEFAULT_BOOKING_APPROVED_BODY}
    />
  );
}

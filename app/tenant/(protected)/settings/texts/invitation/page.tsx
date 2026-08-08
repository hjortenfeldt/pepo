import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import InvitationTextSettings from "@/components/admin/InvitationTextSettings";
import { DEFAULT_FREELANCER_INVITATION_SUBJECT, DEFAULT_FREELANCER_INVITATION_BODY } from "@/lib/email-templates";

export const metadata: Metadata = { title: "Email-invitation til freelancere" };
export const dynamic = "force-dynamic";

export default async function InvitationTextsPage() {
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  // Service role-klient, samme begrundelse som settings/variables/page.tsx:
  // siden er allerede beskyttet af layout.tsx.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("freelancer_invitation_email_subject, freelancer_invitation_email_body")
    .eq("id", company.id)
    .single();

  if (error || !data) {
    console.error("InvitationTextsPage: kunne ikke hente tekster", error);
    redirect("/settings/texts");
  }

  return (
    <InvitationTextSettings
      initial={{
        subject: data.freelancer_invitation_email_subject ?? DEFAULT_FREELANCER_INVITATION_SUBJECT,
        body: data.freelancer_invitation_email_body ?? DEFAULT_FREELANCER_INVITATION_BODY,
      }}
    />
  );
}

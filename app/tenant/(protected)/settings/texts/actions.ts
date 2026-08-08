"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

// companies kan kun opdateres af super-admins ifølge RLS ("Super admins can
// manage companies") — samme begrundelse som settings/variables/actions.ts,
// derfor service role-klienten her.

export type InvitationTextInput = {
  subject: string;
  body: string;
};

export async function updateFreelancerInvitationText(input: InvitationTextInput) {
  if (!input.subject.trim()) {
    return { success: false as const, error: "Emnelinjen må ikke være tom." };
  }
  if (!input.body.trim()) {
    return { success: false as const, error: "Brødteksten må ikke være tom." };
  }

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      freelancer_invitation_email_subject: input.subject,
      freelancer_invitation_email_body: input.body,
    })
    .eq("id", company.id);

  if (error) {
    console.error("updateFreelancerInvitationText fejlede", error);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/settings/texts/invitation");
  return { success: true as const };
}

/** Sætter begge felter til NULL igen — lib/email-templates.ts's
 * DEFAULT_FREELANCER_INVITATION_SUBJECT/BODY bruges da i stedet, både her
 * (via page.tsx's fallback ved næste load) og i selve afsendelsen (Send
 * Email-hooket, se app/api/auth/send-email/route.ts). */
export async function resetFreelancerInvitationText() {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      freelancer_invitation_email_subject: null,
      freelancer_invitation_email_body: null,
    })
    .eq("id", company.id);

  if (error) {
    console.error("resetFreelancerInvitationText fejlede", error);
    return { success: false as const, error: "Kunne ikke nulstille teksten. Prøv igen." };
  }

  revalidatePath("/settings/texts/invitation");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Booking-godkendt-mail og event-opfølgningsmail (2026-08-09) — se
// [[project_texts_settings_next_steps]]. Samme gem/nulstil-mønster som
// freelancer-invitationen ovenfor, blot på companies' fire nye kolonner.
// ---------------------------------------------------------------------------

export async function updateBookingApprovedText(input: InvitationTextInput) {
  if (!input.subject.trim()) {
    return { success: false as const, error: "Emnelinjen må ikke være tom." };
  }
  if (!input.body.trim()) {
    return { success: false as const, error: "Brødteksten må ikke være tom." };
  }

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      booking_approved_email_subject: input.subject,
      booking_approved_email_body: input.body,
    })
    .eq("id", company.id);

  if (error) {
    console.error("updateBookingApprovedText fejlede", error);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/settings/texts/booking-approved");
  return { success: true as const };
}

export async function resetBookingApprovedText() {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      booking_approved_email_subject: null,
      booking_approved_email_body: null,
    })
    .eq("id", company.id);

  if (error) {
    console.error("resetBookingApprovedText fejlede", error);
    return { success: false as const, error: "Kunne ikke nulstille teksten. Prøv igen." };
  }

  revalidatePath("/settings/texts/booking-approved");
  return { success: true as const };
}

export async function updateEventFollowupText(input: InvitationTextInput) {
  if (!input.subject.trim()) {
    return { success: false as const, error: "Emnelinjen må ikke være tom." };
  }
  if (!input.body.trim()) {
    return { success: false as const, error: "Brødteksten må ikke være tom." };
  }

  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      event_followup_email_subject: input.subject,
      event_followup_email_body: input.body,
    })
    .eq("id", company.id);

  if (error) {
    console.error("updateEventFollowupText fejlede", error);
    return { success: false as const, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/settings/texts/event-followup");
  return { success: true as const };
}

export async function resetEventFollowupText() {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      event_followup_email_subject: null,
      event_followup_email_body: null,
    })
    .eq("id", company.id);

  if (error) {
    console.error("resetEventFollowupText fejlede", error);
    return { success: false as const, error: "Kunne ikke nulstille teksten. Prøv igen." };
  }

  revalidatePath("/settings/texts/event-followup");
  return { success: true as const };
}

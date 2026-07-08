"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

/**
 * Genererer et nyt hemmeligt kalender-feed-token til virksomheden, så det
 * gamle abonnementslink holder op med at virke (fx hvis det er delt for
 * bredt ved en fejl). Kræver service role-klienten, da companies kun kan
 * opdateres af super-admins ifølge RLS — almindelige tenant-admins må
 * kun læse deres egen virksomheds række.
 */
export async function regenerateCalendarFeedToken() {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return { success: false as const, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ calendar_feed_token: crypto.randomUUID() })
    .eq("id", company.id)
    .select("calendar_feed_token")
    .single();

  if (error || !data) {
    console.error("regenerateCalendarFeedToken fejlede", error);
    return { success: false as const, error: "Kunne ikke generere et nyt link. Prøv igen." };
  }

  revalidatePath("/settings/calendar");
  return { success: true as const, token: data.calendar_feed_token as string };
}

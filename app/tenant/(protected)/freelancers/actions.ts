"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function setApplicationStatus(
  freelancerId: string,
  status: "approved" | "rejected"
) {
  const supabase = await createClient();
  const company = await getCompanyBySubdomain();

  if (!company) {
    return { success: false, error: "Kunne ikke afgøre virksomheden. Prøv igen." };
  }

  // RLS begrænser i forvejen til admins egen virksomhed, men company_id
  // sættes eksplicit her, da freelancer_companies har en sammensat
  // primærnøgle (freelancer_id, company_id) og ikke sit eget id-felt.
  const { error } = await supabase
    .from("freelancer_companies")
    .update({ application_status: status })
    .eq("freelancer_id", freelancerId)
    .eq("company_id", company.id);

  if (error) {
    console.error("setApplicationStatus fejlede", error);
    return { success: false, error: "Kunne ikke opdatere status. Prøv igen." };
  }

  revalidatePath("/freelancers");
  return { success: true };
}

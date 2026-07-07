"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setApplicationStatus(
  freelancerId: string,
  status: "approved" | "rejected"
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("freelancer_profiles")
    .update({ application_status: status, updated_at: new Date().toISOString() })
    .eq("id", freelancerId);

  if (error) {
    console.error("setApplicationStatus fejlede", error);
    return { success: false, error: "Kunne ikke opdatere status. Prøv igen." };
  }

  revalidatePath("/admin/freelancers");
  return { success: true };
}

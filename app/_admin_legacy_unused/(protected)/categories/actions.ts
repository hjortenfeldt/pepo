"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "Udfyld et navn." };

  const supabase = await createClient();
  const { error } = await supabase.from("work_categories").insert({ name: trimmed });

  if (error) {
    console.error("createCategory fejlede", error);
    if (error.code === "23505") {
      return { success: false, error: "Der findes allerede en kategori med det navn." };
    }
    return { success: false, error: "Kunne ikke oprette kategorien. Prøv igen." };
  }

  revalidatePath("/admin/categories");
  return { success: true };
}

export async function renameCategory(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "Navnet kan ikke være tomt." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) {
    console.error("renameCategory fejlede", error);
    if (error.code === "23505") {
      return { success: false, error: "Der findes allerede en kategori med det navn." };
    }
    return { success: false, error: "Kunne ikke omdøbe kategorien. Prøv igen." };
  }

  revalidatePath("/admin/categories");
  return { success: true };
}

export async function updateCategoryRates(
  id: string,
  clientRatePerHour: number,
  freelancerRatePerHour: number
) {
  if (clientRatePerHour < 0 || freelancerRatePerHour < 0) {
    return { success: false, error: "Takster kan ikke være negative." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .update({
      client_rate_per_hour: clientRatePerHour,
      freelancer_rate_per_hour: freelancerRatePerHour,
    })
    .eq("id", id);

  if (error) {
    console.error("updateCategoryRates fejlede", error);
    return { success: false, error: "Kunne ikke gemme taksterne. Prøv igen." };
  }

  revalidatePath("/admin/categories");
  return { success: true };
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("work_categories").delete().eq("id", id);

  if (error) {
    console.error("deleteCategory fejlede", error);
    if (error.code === "23503") {
      return {
        success: false,
        error: "Kategorien kan ikke slettes, da der findes vagter i den.",
      };
    }
    return { success: false, error: "Kunne ikke slette kategorien. Prøv igen." };
  }

  revalidatePath("/admin/categories");
  return { success: true };
}

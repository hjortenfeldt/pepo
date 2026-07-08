"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// --- Jobfunktioner ---

export async function createCategory(name: string, groupId: string | null) {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "Udfyld et navn." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .insert({ name: trimmed, group_id: groupId });

  if (error) {
    console.error("createCategory fejlede", error);
    if (error.code === "23505") {
      return { success: false, error: "Der findes allerede en jobfunktion med det navn." };
    }
    return { success: false, error: "Kunne ikke oprette jobfunktionen. Prøv igen." };
  }

  revalidatePath("/categories");
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
      return { success: false, error: "Der findes allerede en jobfunktion med det navn." };
    }
    return { success: false, error: "Kunne ikke omdøbe jobfunktionen. Prøv igen." };
  }

  revalidatePath("/categories");
  return { success: true };
}

// Flytter en jobfunktion til en anden priskategori — bruges både af
// drag & drop og kunne genbruges hvis vi senere tilføjer en dropdown.
// groupId === null betyder "Ikke tildelt priskategori".
export async function updateCategoryGroup(id: string, groupId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .update({ group_id: groupId })
    .eq("id", id);

  if (error) {
    console.error("updateCategoryGroup fejlede", error);
    return { success: false, error: "Kunne ikke flytte jobfunktionen. Prøv igen." };
  }

  revalidatePath("/categories");
  return { success: true };
}

export async function updateCategoryIcon(id: string, icon: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .update({ icon })
    .eq("id", id);

  if (error) {
    console.error("updateCategoryIcon fejlede", error);
    return { success: false, error: "Kunne ikke skifte ikon. Prøv igen." };
  }

  revalidatePath("/categories");
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
        error: "Jobfunktionen kan ikke slettes, da der findes vagter i den.",
      };
    }
    return { success: false, error: "Kunne ikke slette jobfunktionen. Prøv igen." };
  }

  revalidatePath("/categories");
  return { success: true };
}

// --- Priskategorier ---

export async function createGroup(name: string, clientRatePerHour: number, freelancerRatePerHour: number) {
  const trimmed = name.trim();
  if (!trimmed) return { success: false as const, error: "Udfyld et navn." };
  if (!(clientRatePerHour > 0)) {
    return { success: false as const, error: "Udfyld hvad kunden betaler." };
  }
  if (!(freelancerRatePerHour > 0)) {
    return { success: false as const, error: "Udfyld hvad freelanceren får." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_category_groups")
    .insert({
      name: trimmed,
      client_rate_per_hour: clientRatePerHour,
      freelancer_rate_per_hour: freelancerRatePerHour,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createGroup fejlede", error);
    if (error?.code === "23505") {
      return { success: false as const, error: "Der findes allerede en priskategori med det navn." };
    }
    return { success: false as const, error: "Kunne ikke oprette priskategorien. Prøv igen." };
  }

  revalidatePath("/categories");
  return { success: true as const, id: data.id as string };
}

export async function renameGroup(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "Navnet kan ikke være tomt." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_category_groups")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) {
    console.error("renameGroup fejlede", error);
    if (error.code === "23505") {
      return { success: false, error: "Der findes allerede en priskategori med det navn." };
    }
    return { success: false, error: "Kunne ikke omdøbe priskategorien. Prøv igen." };
  }

  revalidatePath("/categories");
  return { success: true };
}

export async function updateGroupRates(
  id: string,
  clientRatePerHour: number,
  freelancerRatePerHour: number
) {
  if (clientRatePerHour <= 0 || freelancerRatePerHour <= 0) {
    return { success: false, error: "Takster skal være større end 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_category_groups")
    .update({
      client_rate_per_hour: clientRatePerHour,
      freelancer_rate_per_hour: freelancerRatePerHour,
    })
    .eq("id", id);

  if (error) {
    console.error("updateGroupRates fejlede", error);
    return { success: false, error: "Kunne ikke gemme taksterne. Prøv igen." };
  }

  revalidatePath("/categories");
  return { success: true };
}

// Sletter priskategorien. Jobfunktioner i den mister IKKE sig selv — de
// flyttes til "Ikke tildelt priskategori" (group_id sættes til null via
// "on delete set null" på fremmednøglen), matcher prototypens adfærd.
export async function deleteGroup(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("work_category_groups").delete().eq("id", id);

  if (error) {
    console.error("deleteGroup fejlede", error);
    return { success: false, error: "Kunne ikke slette priskategorien. Prøv igen." };
  }

  revalidatePath("/categories");
  return { success: true };
}

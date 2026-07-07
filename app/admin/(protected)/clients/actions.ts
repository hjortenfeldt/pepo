"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { normalizePhone } from "@/lib/format";

export type ClientFormInput = {
  name: string;
  cvrNumber: string;
  address: string;
  postalCode: string;
  city: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
};

function toRow(input: ClientFormInput) {
  return {
    name: input.name.trim() || null,
    cvr_number: input.cvrNumber.trim() || null,
    address: input.address.trim() || null,
    postal_code: input.postalCode.trim() || null,
    city: input.city.trim() || null,
    contact_person: input.contactPerson.trim() || null,
    // Ingen mellemrum i telefonnumre, så søgning altid virker uanset
    // hvordan admin har tastet nummeret ind.
    contact_phone: input.contactPhone.trim()
      ? normalizePhone(input.contactPhone.trim())
      : null,
    contact_email: input.contactEmail.trim() || null,
    notes: input.notes.trim() || null,
  };
}

function validate(input: ClientFormInput) {
  if (!input.name.trim() && !input.contactPerson.trim()) {
    return "Udfyld enten firmanavn eller kontaktperson.";
  }
  return null;
}

export async function createClientRecord(input: ClientFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false as const, error: validationError };

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.from("clients").insert(toRow(input)).select("id").single();

  if (error || !data) {
    console.error("createClientRecord fejlede", error);
    return { success: false as const, error: "Kunne ikke oprette kunden. Prøv igen." };
  }

  revalidatePath("/admin/clients");
  return { success: true as const, id: data.id as string };
}

export async function updateClientRecord(id: string, input: ClientFormInput) {
  const validationError = validate(input);
  if (validationError) return { success: false, error: validationError };

  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("clients")
    .update(toRow(input))
    .eq("id", id);

  if (error) {
    console.error("updateClientRecord fejlede", error);
    return { success: false, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  revalidatePath("/admin/clients");
  return { success: true };
}

export async function deleteClientRecord(id: string) {
  const supabase = await createSupabaseClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) {
    console.error("deleteClientRecord fejlede", error);
    return { success: false, error: "Kunne ikke slette kunden. Prøv igen." };
  }

  revalidatePath("/admin/clients");
  return { success: true };
}

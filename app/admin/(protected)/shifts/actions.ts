"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { EventAttachment, ShiftStatus, VenueItem } from "@/lib/admin-types";

export type EventFormInput = {
  title: string;
  eventDate: string; // ISO-dato
  description: string;
  clientId: string;
  venueId: string | null;
};

export type ShiftRowInput = {
  id: string | null; // eksisterende vagt-id ved redigering, ellers null
  categoryId: string;
  startTime: string;
  endTime: string;
};

export type VenueFormInput = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
};

function validateEvent(input: EventFormInput) {
  if (!input.title.trim()) return "Titel/anledning mangler.";
  if (!input.eventDate) return "Dato mangler.";
  if (!input.clientId) return "Vælg en kunde.";
  return null;
}

function validateRows(rows: ShiftRowInput[]) {
  if (rows.length === 0) return "Tilføj mindst én vagt.";
  for (const r of rows) {
    if (!r.categoryId) return "Vælg jobfunktion for alle vagter.";
    if (!r.startTime || !r.endTime) return "Udfyld start- og sluttid for alle vagter.";
  }
  return null;
}

// Event-felterne (kunde, arbejdssted, titel, dato, beskrivelse) gemmes
// denormaliseret på hver vagt-række, så en enkelt vagt kan læses uden
// join — samme mønster som freelancer_profiles.email er en kopi af
// auth.users. Denne funktion holder duplikeringen samlet ét sted.
function eventFieldsForShift(input: EventFormInput) {
  return {
    title: input.title.trim(),
    description: input.description.trim() || null,
    shift_date: input.eventDate,
    client_id: input.clientId,
    venue_id: input.venueId,
  };
}

export async function createEventWithShifts(input: EventFormInput, rows: ShiftRowInput[]) {
  const validationError = validateEvent(input) || validateRows(rows);
  if (validationError) return { success: false as const, error: validationError };

  const supabase = await createSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      title: input.title.trim(),
      event_date: input.eventDate,
      description: input.description.trim() || null,
      client_id: input.clientId,
      venue_id: input.venueId,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    console.error("createEventWithShifts: kunne ikke oprette event", eventError);
    return { success: false as const, error: "Kunne ikke oprette event. Prøv igen." };
  }

  const shiftFields = eventFieldsForShift(input);
  const { error: shiftsError } = await supabase.from("shifts").insert(
    rows.map((r) => ({
      event_id: event.id,
      category_id: r.categoryId,
      start_time: r.startTime,
      end_time: r.endTime,
      status: "open" as ShiftStatus,
      ...shiftFields,
    }))
  );

  if (shiftsError) {
    console.error("createEventWithShifts: kunne ikke oprette vagter", shiftsError);
    // Eventet er allerede oprettet — ryd op, så vi ikke efterlader et event uden vagter.
    await supabase.from("events").delete().eq("id", event.id);
    return { success: false as const, error: "Kunne ikke oprette vagterne. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true as const, eventId: event.id as string };
}

export async function updateEvent(eventId: string, input: EventFormInput) {
  const validationError = validateEvent(input);
  if (validationError) return { success: false, error: validationError };

  const supabase = await createSupabaseClient();

  const { error: eventError } = await supabase
    .from("events")
    .update({
      title: input.title.trim(),
      event_date: input.eventDate,
      description: input.description.trim() || null,
      client_id: input.clientId,
      venue_id: input.venueId,
    })
    .eq("id", eventId);

  if (eventError) {
    console.error("updateEvent fejlede", eventError);
    return { success: false, error: "Kunne ikke gemme ændringerne. Prøv igen." };
  }

  // Propagér til alle vagter i gruppen, så de forbliver i sync med eventet.
  const { error: shiftsError } = await supabase
    .from("shifts")
    .update(eventFieldsForShift(input))
    .eq("event_id", eventId);

  if (shiftsError) {
    console.error("updateEvent: kunne ikke opdatere vagterne", shiftsError);
    return { success: false, error: "Event blev gemt, men vagterne kunne ikke opdateres." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function addShiftsToEvent(eventId: string, rows: ShiftRowInput[]) {
  const validationError = validateRows(rows);
  if (validationError) return { success: false, error: validationError };

  const supabase = await createSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("title, event_date, description, client_id, venue_id")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    console.error("addShiftsToEvent: kunne ikke finde eventet", eventError);
    return { success: false, error: "Kunne ikke finde eventet. Prøv igen." };
  }

  const { error } = await supabase.from("shifts").insert(
    rows.map((r) => ({
      event_id: eventId,
      category_id: r.categoryId,
      start_time: r.startTime,
      end_time: r.endTime,
      status: "open" as ShiftStatus,
      title: event.title,
      description: event.description,
      shift_date: event.event_date,
      client_id: event.client_id,
      venue_id: event.venue_id,
    }))
  );

  if (error) {
    console.error("addShiftsToEvent fejlede", error);
    return { success: false, error: "Kunne ikke tilføje vagterne. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function updateShift(shiftId: string, row: ShiftRowInput) {
  const validationError = validateRows([row]);
  if (validationError) return { success: false, error: validationError };

  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("shifts")
    .update({ category_id: row.categoryId, start_time: row.startTime, end_time: row.endTime })
    .eq("id", shiftId);

  if (error) {
    console.error("updateShift fejlede", error);
    return { success: false, error: "Kunne ikke gemme vagten. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function assignFreelancer(shiftId: string, freelancerId: string) {
  const supabase = await createSupabaseClient();

  const { error } = await supabase
    .from("shifts")
    .update({ assigned_freelancer_id: freelancerId, status: "assigned" as ShiftStatus })
    .eq("id", shiftId);

  if (error) {
    console.error("assignFreelancer fejlede", error);
    return { success: false, error: "Kunne ikke tildele vagten. Prøv igen." };
  }

  // Best-effort: markér en evt. tilkendegivelse fra denne freelancer som
  // accepteret. Fejler dette, blokerer det ikke selve tildelingen.
  await supabase
    .from("shift_interests")
    .update({ status: "accepted" })
    .eq("shift_id", shiftId)
    .eq("freelancer_id", freelancerId);

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function releaseShift(shiftId: string) {
  const supabase = await createSupabaseClient();
  const { error } = await supabase
    .from("shifts")
    .update({ assigned_freelancer_id: null, status: "open" as ShiftStatus })
    .eq("id", shiftId);

  if (error) {
    console.error("releaseShift fejlede", error);
    return { success: false, error: "Kunne ikke frigive vagten. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function deleteShift(shiftId: string) {
  const supabase = await createSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("shifts")
    .select("status")
    .eq("id", shiftId)
    .single();

  if (fetchError || !current) {
    console.error("deleteShift: kunne ikke finde vagten", fetchError);
    return { success: false, error: "Kunne ikke slette vagten. Prøv igen." };
  }

  const { error } = await supabase
    .from("shifts")
    .update({ status: "cancelled" as ShiftStatus, previous_status: current.status })
    .eq("id", shiftId);

  if (error) {
    console.error("deleteShift fejlede", error);
    return { success: false, error: "Kunne ikke slette vagten. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function undeleteShift(shiftId: string) {
  const supabase = await createSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("shifts")
    .select("previous_status")
    .eq("id", shiftId)
    .single();

  if (fetchError || !current) {
    console.error("undeleteShift: kunne ikke finde vagten", fetchError);
    return { success: false, error: "Kunne ikke fortryde sletningen. Prøv igen." };
  }

  const { error } = await supabase
    .from("shifts")
    .update({ status: (current.previous_status ?? "open") as ShiftStatus, previous_status: null })
    .eq("id", shiftId);

  if (error) {
    console.error("undeleteShift fejlede", error);
    return { success: false, error: "Kunne ikke fortryde sletningen. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function duplicateShift(shiftId: string) {
  const supabase = await createSupabaseClient();

  const { data: original, error: fetchError } = await supabase
    .from("shifts")
    .select("event_id, category_id, shift_date, start_time, end_time, client_id, venue_id, title, description")
    .eq("id", shiftId)
    .single();

  if (fetchError || !original) {
    console.error("duplicateShift: kunne ikke finde vagten", fetchError);
    return { success: false, error: "Kunne ikke duplikere vagten. Prøv igen." };
  }

  const { error } = await supabase.from("shifts").insert({
    ...original,
    status: "open" as ShiftStatus,
    assigned_freelancer_id: null,
    previous_status: null,
  });

  if (error) {
    console.error("duplicateShift fejlede", error);
    return { success: false, error: "Kunne ikke duplikere vagten. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function createVenue(clientId: string, input: VenueFormInput) {
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("client_venues")
    .insert({
      client_id: clientId,
      name: input.name.trim() || null,
      address: input.address.trim() || null,
      postal_code: input.postalCode.trim() || null,
      city: input.city.trim() || null,
    })
    .select("id, client_id, name, address, postal_code, city")
    .single();

  if (error || !data) {
    console.error("createVenue fejlede", error);
    return { success: false as const, error: "Kunne ikke oprette arbejdsstedet. Prøv igen." };
  }

  const venue: VenueItem = {
    id: data.id,
    clientId: data.client_id,
    name: data.name,
    address: data.address,
    postalCode: data.postal_code,
    city: data.city,
  };

  revalidatePath("/admin/shifts");
  return { success: true as const, venue };
}

export async function updateVenue(venueId: string, input: VenueFormInput) {
  const supabase = await createSupabaseClient();

  const { error } = await supabase
    .from("client_venues")
    .update({
      name: input.name.trim() || null,
      address: input.address.trim() || null,
      postal_code: input.postalCode.trim() || null,
      city: input.city.trim() || null,
    })
    .eq("id", venueId);

  if (error) {
    console.error("updateVenue fejlede", error);
    return { success: false, error: "Kunne ikke gemme arbejdsstedet. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function deleteVenue(venueId: string) {
  const supabase = await createSupabaseClient();
  const { error } = await supabase.from("client_venues").delete().eq("id", venueId);

  if (error) {
    console.error("deleteVenue fejlede", error);
    return { success: false, error: "Kunne ikke slette arbejdsstedet. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function uploadAttachment(eventId: string, file: File) {
  if (!(file instanceof File) || file.size === 0) {
    return { success: false as const, error: "Ingen fil valgt." };
  }

  const supabase = await createSupabaseClient();
  const path = `${eventId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("shift-attachments")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    console.error("uploadAttachment: upload fejlede", uploadError);
    return { success: false as const, error: "Kunne ikke uploade filen. Prøv igen." };
  }

  const { data: publicUrlData } = supabase.storage.from("shift-attachments").getPublicUrl(path);

  const { data, error } = await supabase
    .from("shift_attachments")
    .insert({
      event_id: eventId,
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      file_type: file.type || null,
    })
    .select("id, file_name, file_url, file_type")
    .single();

  if (error || !data) {
    console.error("uploadAttachment: kunne ikke gemme filreferencen", error);
    return { success: false as const, error: "Filen blev uploadet, men kunne ikke gemmes på eventet." };
  }

  const attachment: EventAttachment = {
    id: data.id,
    fileName: data.file_name,
    fileUrl: data.file_url,
    fileType: data.file_type,
  };

  revalidatePath("/admin/shifts");
  return { success: true as const, attachment };
}

export async function removeAttachment(attachmentId: string, fileUrl: string) {
  const supabase = await createSupabaseClient();

  const path = fileUrl.split("/shift-attachments/")[1];
  if (path) {
    await supabase.storage.from("shift-attachments").remove([path]);
  }

  const { error } = await supabase.from("shift_attachments").delete().eq("id", attachmentId);

  if (error) {
    console.error("removeAttachment fejlede", error);
    return { success: false, error: "Kunne ikke fjerne vedhæftningen. Prøv igen." };
  }

  revalidatePath("/admin/shifts");
  return { success: true };
}

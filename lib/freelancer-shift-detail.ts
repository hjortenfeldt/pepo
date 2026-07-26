import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpenShiftDetail, SiblingShift, ShiftAttachment } from "@/components/freelancer/ShiftRequestDetail";

type RawCategoryRef = { name: string; icon: string | null };
type RawVenueRef = { name: string | null; address: string | null; postal_code: string | null; city: string | null };
type RawEventRef = { id: string; title: string; description: string | null };

type RawShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
  event_id: string | null;
  assigned_freelancer_id: string | null;
  work_categories: RawCategoryRef | RawCategoryRef[] | null;
  client_venues: RawVenueRef | RawVenueRef[] | null;
  events: RawEventRef | RawEventRef[] | null;
};

type RawSiblingRow = {
  shift_id: string;
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
  category_name: string | null;
  assigned_freelancer_id: string | null;
  assigned_freelancer_name: string | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

/**
 * Delt datahentning til Vagtdetaljer — udtrukket herfra så BÅDE den fulde
 * side (app/freelancer/(protected)/vagt/[id]/page.tsx, brugt til direkte
 * links, fx fra push-notifikationer) OG overlay-panel-varianten, der åbnes
 * fra Overblik-siden (components/freelancer/ShiftDetailPanel.tsx, via
 * getShiftDetail-server-action'en i actions.ts), henter nøjagtig samme data
 * på nøjagtig samme måde — kun én forespørgsel at vedligeholde.
 *
 * Returnerer null hvis vagten ikke findes, eller RLS afviser den (fx en
 * kategori freelanceren ikke er godkendt i) — kalderne håndterer selv det
 * tilfælde forskelligt (siden redirecter til "/", panelet viser en "ikke
 * fundet"-besked).
 */
export async function loadOpenShiftDetail(
  supabase: SupabaseClient,
  userId: string,
  shiftId: string
): Promise<OpenShiftDetail | null> {
  const { data: shiftRow } = await supabase
    .from("shifts")
    .select(
      "id, shift_date, start_time, end_time, status, event_id, assigned_freelancer_id, work_categories(name, icon), client_venues(name, address, postal_code, city), events(id, title, description)"
    )
    .eq("id", shiftId)
    .maybeSingle();

  const shift = shiftRow as unknown as RawShiftRow | null;
  if (!shift) return null;

  const [{ data: interest }, { data: siblingRows }, { data: attachmentRows }] = await Promise.all([
    supabase
      .from("shift_interests")
      .select("id")
      .eq("shift_id", shiftId)
      .eq("freelancer_id", userId)
      .maybeSingle(),
    shift.event_id
      ? supabase.rpc("get_event_shift_summary", { p_event_id: shift.event_id })
      : Promise.resolve({ data: [] as RawSiblingRow[] }),
    shift.event_id
      ? supabase
          .from("shift_attachments")
          .select("id, file_name, file_url, file_type")
          .eq("event_id", shift.event_id)
      : Promise.resolve({ data: [] as { id: string; file_name: string; file_url: string; file_type: string | null }[] }),
  ]);

  const event = one(shift.events);
  const venue = one(shift.client_venues);

  const siblingShifts: SiblingShift[] = ((siblingRows ?? []) as unknown as RawSiblingRow[]).map((s) => ({
    id: s.shift_id,
    startTime: hhmm(s.start_time),
    endTime: hhmm(s.end_time),
    categoryName: s.category_name ?? "Ukendt kategori",
    status: s.status,
    isCurrent: s.shift_id === shift.id,
    isMine: s.assigned_freelancer_id === userId,
    assignedFreelancerName: s.assigned_freelancer_name,
  }));

  const attachments: ShiftAttachment[] = (attachmentRows ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    fileUrl: a.file_url,
  }));

  return {
    id: shift.id,
    date: shift.shift_date,
    startTime: hhmm(shift.start_time),
    endTime: hhmm(shift.end_time),
    status: shift.status,
    isMine: shift.assigned_freelancer_id === userId,
    categoryName: one(shift.work_categories)?.name ?? "Ukendt kategori",
    categoryIcon: one(shift.work_categories)?.icon ?? null,
    eventTitle: event?.title ?? "Vagt",
    briefing: event?.description ?? null,
    venueName: venue?.name ?? null,
    venueAddress: venue
      ? [venue.address, [venue.postal_code, venue.city].filter(Boolean).join(", ")].filter(Boolean).join(", ")
      : null,
    alreadyApplied: Boolean(interest),
    siblingShifts,
    attachments,
  };
}

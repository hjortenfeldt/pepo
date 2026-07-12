import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ShiftRequestDetail, {
  type OpenShiftDetail,
  type SiblingShift,
  type ShiftAttachment,
} from "@/components/freelancer/ShiftRequestDetail";

export const dynamic = "force-dynamic";

type RawCategoryRef = { name: string };
type RawVenueRef = { name: string | null; address: string | null; postal_code: string | null; city: string | null };
type RawEventRef = { id: string; title: string; description: string | null };

type RawShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "open" | "for_resale" | "assigned" | "completed" | "cancelled";
  event_id: string | null;
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
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

export default async function OpenShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: shiftRow } = await supabase
    .from("shifts")
    .select(
      "id, shift_date, start_time, end_time, status, event_id, work_categories(name), client_venues(name, address, postal_code, city), events(id, title, description)"
    )
    .eq("id", id)
    .maybeSingle();

  const shift = shiftRow as unknown as RawShiftRow | null;

  // Vagten findes ikke (forkert/gammelt link), eller RLS'en afviser den
  // (fx en kategori freelanceren ikke er godkendt i) — tilbage til Overblik
  // frem for en forvirrende tom side.
  if (!shift) {
    redirect("/");
  }

  const [{ data: interest }, { data: siblingRows }, { data: attachmentRows }] = await Promise.all([
    supabase
      .from("shift_interests")
      .select("id")
      .eq("shift_id", id)
      .eq("freelancer_id", user.id)
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
  }));

  const attachments: ShiftAttachment[] = (attachmentRows ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    fileUrl: a.file_url,
  }));

  const detail: OpenShiftDetail = {
    id: shift.id,
    date: shift.shift_date,
    startTime: hhmm(shift.start_time),
    endTime: hhmm(shift.end_time),
    status: shift.status,
    categoryName: one(shift.work_categories)?.name ?? "Ukendt kategori",
    eventTitle: event?.title ?? "Vagt",
    briefing: event?.description ?? null,
    venueName: venue?.name ?? null,
    venueAddress: venue ? [venue.address, [venue.postal_code, venue.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null,
    alreadyApplied: Boolean(interest),
    siblingShifts,
    attachments,
  };

  return <ShiftRequestDetail shift={detail} />;
}

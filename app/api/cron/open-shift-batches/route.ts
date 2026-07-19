import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToFreelancer } from "@/lib/push";
import { formatDateDisplay } from "@/lib/format";

export const dynamic = "force-dynamic";

const BATCH_WINDOW_MS = 5 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * Kaldes hvert minut af Supabase pg_cron (se migration
 * shift_notifications_infra og [[project_push_notification_types]]).
 * Sender ÉN samlet push pr. (freelancer, jobfunktion)-batch i
 * pending_shift_notifications, når batchens 5-minutters vindue (regnet fra
 * første vagt i batchen, se queueOpenShiftNotifications i
 * lib/shift-notifications.ts) er udløbet. Formålet er at undgå at spamme en
 * freelancer med 5 separate pushes, hvis en administrator bulk-opretter 5
 * tjenervagter inden for få minutter.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: batches, error } = await supabase
    .from("pending_shift_notifications")
    .select("id, freelancer_id, category_id, shift_ids")
    .lte("created_at", new Date(Date.now() - BATCH_WINDOW_MS).toISOString());

  if (error) {
    console.error("open-shift-batches: kunne ikke hente ventende batches", error);
    return NextResponse.json({ error: "db-error" }, { status: 500 });
  }

  let sent = 0;

  for (const batch of batches ?? []) {
    try {
      const { data: category } = await supabase
        .from("work_categories")
        .select("name")
        .eq("id", batch.category_id)
        .maybeSingle();
      const jobfunktion = category?.name ?? "en vagt";
      const shiftIds = (batch.shift_ids as string[]) ?? [];

      if (shiftIds.length === 1) {
        const { data: shift } = await supabase
          .from("shifts")
          .select("shift_date, client:clients(name)")
          .eq("id", shiftIds[0])
          .maybeSingle();
        const client = shift?.client as { name: string } | { name: string }[] | null;
        const kunde = Array.isArray(client) ? client[0]?.name : client?.name;
        const dato = shift ? formatDateDisplay(shift.shift_date as string) : "";

        await sendPushToFreelancer(batch.freelancer_id, {
          title: "Ny ledig vagt til dig",
          body: `Der er en ny ledig vagt som ${jobfunktion} hos ${kunde ?? "kunden"} d. ${dato}. Se detaljer og anmod nu.`,
          url: `/vagt/${shiftIds[0]}`,
        });
      } else if (shiftIds.length > 1) {
        await sendPushToFreelancer(batch.freelancer_id, {
          title: `${shiftIds.length} nye ledige vagter til dig`,
          body: `Der er ${shiftIds.length} nye ledige vagter som ${jobfunktion}, du kan byde ind på. Se detaljer og anmod nu.`,
          url: "/",
        });
      }
      sent++;
    } catch (err) {
      console.error("open-shift-batches: afsendelse fejlede for batch", batch.id, err);
    } finally {
      // Slettes uanset udfald — en fejlet afsendelse her er ikke kritisk nok
      // til at retry-forsøge for evigt (samme filosofi som lib/push.ts).
      await supabase.from("pending_shift_notifications").delete().eq("id", batch.id);
    }
  }

  return NextResponse.json({ sent, total: batches?.length ?? 0 });
}

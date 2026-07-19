import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToFreelancer } from "@/lib/push";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

type ReminderRow = {
  shift_id: string;
  freelancer_id: string;
  company_id: string;
  category_name: string;
  client_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
};

/**
 * Kaldes hvert 15. minut af Supabase pg_cron (se migration
 * shift_notifications_infra og [[project_push_notification_types]]).
 * Tre uafhængige tjek — vagt i morgen, glemt at stemple ind, glemt at
 * stemple ud — der alle bygger på SQL-funktioner som selv håndterer
 * Europe/Copenhagen-tidszonen korrekt (sommer-/vintertid inkl.), i stedet
 * for skrøbelig JS-dato-aritmetik i denne serverless-funktion (som kører i
 * UTC). Denne route holder sig bevidst til at læse resultater, sende push,
 * og markere som sendt — hver reminder_*_sent_at-kolonne på shifts sikrer
 * at samme påmindelse aldrig sendes to gange.
 *
 * POST (ikke GET) — Supabase pg_cron kalder via net.http_post(), som altid
 * sender POST.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let sent = 0;

  const dayBefore = await supabase.rpc("get_shifts_needing_day_before_reminder");
  if (dayBefore.error) console.error("shift-reminders: dagen-før-tjek fejlede", dayBefore.error);
  for (const row of (dayBefore.data ?? []) as ReminderRow[]) {
    try {
      await sendPushToFreelancer(row.freelancer_id, {
        title: "Du har vagt i morgen",
        body: `Husk din vagt som ${row.category_name} hos ${row.client_name} i morgen kl. ${row.start_time.slice(0, 5)}.`,
        url: `/vagt/${row.shift_id}`,
      });
      sent++;
    } catch (err) {
      console.error("shift-reminders: vagt-i-morgen fejlede", row.shift_id, err);
    } finally {
      await supabase
        .from("shifts")
        .update({ reminder_day_before_sent_at: new Date().toISOString() })
        .eq("id", row.shift_id);
    }
  }

  const clockIn = await supabase.rpc("get_shifts_needing_clock_in_reminder");
  if (clockIn.error) console.error("shift-reminders: glemt-stemple-ind-tjek fejlede", clockIn.error);
  for (const row of (clockIn.data ?? []) as ReminderRow[]) {
    try {
      await sendPushToFreelancer(row.freelancer_id, {
        title: "Er du startet på din vagt?",
        body: `Din vagt som ${row.category_name} hos ${row.client_name} skulle være startet kl. ${row.start_time.slice(0, 5)}. Husk at stemple ind.`,
        url: `/vagt/${row.shift_id}`,
      });
      sent++;
    } catch (err) {
      console.error("shift-reminders: glemt-stemple-ind fejlede", row.shift_id, err);
    } finally {
      await supabase
        .from("shifts")
        .update({ reminder_clock_in_sent_at: new Date().toISOString() })
        .eq("id", row.shift_id);
    }
  }

  const clockOut = await supabase.rpc("get_shifts_needing_clock_out_reminder");
  if (clockOut.error) console.error("shift-reminders: glemt-stemple-ud-tjek fejlede", clockOut.error);
  for (const row of (clockOut.data ?? []) as ReminderRow[]) {
    try {
      await sendPushToFreelancer(row.freelancer_id, {
        title: "Husk at stemple ud",
        body: `Din vagt som ${row.category_name} hos ${row.client_name} sluttede kl. ${row.end_time.slice(0, 5)} — husk at stemple ud.`,
        url: `/vagt/${row.shift_id}`,
      });
      sent++;
    } catch (err) {
      console.error("shift-reminders: glemt-stemple-ud fejlede", row.shift_id, err);
    } finally {
      await supabase
        .from("shifts")
        .update({ reminder_clock_out_sent_at: new Date().toISOString() })
        .eq("id", row.shift_id);
    }
  }

  return NextResponse.json({ sent });
}

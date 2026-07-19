import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToFreelancer } from "@/lib/push";
import { formatDateDisplay } from "@/lib/format";

/**
 * Event-drevne push-notifikationer for vagter (tildelt/frigivet/aflyst/
 * ændret), samt kø-lægning til den grupperede "nye ledige vagter"-
 * notifikation. Se Pepo – Notifikationstyper.xlsx for den fulde liste og
 * aftalte ordlyd. De tidsstyrede påmindelser (vagt i morgen, glemt at
 * stemple ind/ud) sendes IKKE herfra — de køres af Supabase pg_cron via
 * app/api/cron/shift-reminders/route.ts, som selv henter sine kandidater
 * via SQL-funktioner (se migrationen shift_notifications_infra).
 *
 * Alle funktioner her fejler aldrig hårdt for den kaldende server action —
 * push er en ekstra service, ikke en forudsætning for at selve
 * vagt-handlingen lykkes (samme filosofi som lib/push.ts).
 */

type ShiftDisplayFields = {
  jobfunktion: string;
  kunde: string;
  dato: string;
  start: string;
  slut: string;
};

async function loadShiftDisplayFields(
  supabase: ReturnType<typeof createAdminClient>,
  shiftId: string
): Promise<ShiftDisplayFields | null> {
  const { data } = await supabase
    .from("shifts")
    .select("shift_date, start_time, end_time, category:work_categories(name), client:clients(name)")
    .eq("id", shiftId)
    .maybeSingle();

  if (!data) return null;

  const category = data.category as { name: string } | { name: string }[] | null;
  const client = data.client as { name: string } | { name: string }[] | null;
  const categoryName = Array.isArray(category) ? category[0]?.name : category?.name;
  const clientName = Array.isArray(client) ? client[0]?.name : client?.name;

  return {
    jobfunktion: categoryName ?? "vagten",
    kunde: clientName ?? "kunden",
    dato: formatDateDisplay(data.shift_date as string),
    start: (data.start_time as string).slice(0, 5),
    slut: (data.end_time as string).slice(0, 5),
  };
}

async function safePush(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`${label}: push-afsendelse fejlede`, err);
  }
}

/** #1 Vagt tildelt — kaldes EFTER assignFreelancer() er lykkedes. */
export async function pushShiftAssigned(shiftId: string, freelancerId: string) {
  await safePush("pushShiftAssigned", async () => {
    const supabase = createAdminClient();
    const f = await loadShiftDisplayFields(supabase, shiftId);
    if (!f) return;
    await sendPushToFreelancer(freelancerId, {
      title: "Ny vagt tildelt",
      body: `Du er tildelt vagten som ${f.jobfunktion} hos ${f.kunde} d. ${f.dato} kl. ${f.start}-${f.slut}.`,
      url: `/vagt/${shiftId}`,
    });
  });
}

/**
 * #2 Vagt frigivet — freelancerId skal være den TIDLIGERE tildelte
 * freelancer, hentet af kalderen FØR releaseShift()'s update rydder
 * assigned_freelancer_id (ellers ved vi ikke længere hvem der skal have besked).
 */
export async function pushShiftReleased(shiftId: string, freelancerId: string) {
  await safePush("pushShiftReleased", async () => {
    const supabase = createAdminClient();
    const f = await loadShiftDisplayFields(supabase, shiftId);
    if (!f) return;
    await sendPushToFreelancer(freelancerId, {
      title: "Din vagt er frigivet",
      body: `Din vagt som ${f.jobfunktion} hos ${f.kunde} d. ${f.dato} er blevet frigivet.`,
      url: "/",
    });
  });
}

/** #3 Vagt aflyst — kaldes efter deleteShift() har sat status til cancelled. */
export async function pushShiftCancelled(shiftId: string, freelancerId: string) {
  await safePush("pushShiftCancelled", async () => {
    const supabase = createAdminClient();
    const f = await loadShiftDisplayFields(supabase, shiftId);
    if (!f) return;
    await sendPushToFreelancer(freelancerId, {
      title: "Din vagt er aflyst",
      body: `Din vagt som ${f.jobfunktion} hos ${f.kunde} d. ${f.dato} kl. ${f.start} er blevet aflyst.`,
      url: "/",
    });
  });
}

/**
 * #4 Vagtdetaljer ændret — kaldes EFTER opdateringen er gemt, så teksten
 * bruger de NYE værdier. Kalderen afgør selv om ændringen er "reel" nok til
 * at sende (se updateShift/updateEvent i shifts/actions.ts).
 */
export async function pushShiftChanged(shiftId: string, freelancerId: string) {
  await safePush("pushShiftChanged", async () => {
    const supabase = createAdminClient();
    const f = await loadShiftDisplayFields(supabase, shiftId);
    if (!f) return;
    await sendPushToFreelancer(freelancerId, {
      title: "Din vagt er blevet ændret",
      body: `Der er ændringer i din vagt som ${f.jobfunktion} hos ${f.kunde} d. ${f.dato} — tjek de nye detaljer.`,
      url: `/vagt/${shiftId}`,
    });
  });
}

/**
 * #5 Ny(e) ledig(e) vagt(er) — lægger IKKE selv en push i kø til afsendelse.
 * Sætter i stedet (freelancer, jobfunktion)-parret i
 * pending_shift_notifications, hvor et 5-minutters vindue (regnet fra
 * første vagt i batchen) samler evt. flere vagter oprettet kort efter
 * hinanden til én samlet notifikation — se
 * app/api/cron/open-shift-batches/route.ts, som rent faktisk sender den,
 * samt [[feedback_batch_open_shift_notifications]] for baggrunden
 * (bulk-oprettelse af fx 5 tjenervagter på én gang må ikke give 5 pushes).
 *
 * Kaldes når en vagt bliver (eller igen bliver) "open": ved oprettelse
 * (createEventWithShifts, addShiftsToEvent, duplicateShift), og når en
 * tildelt vagt frigives (releaseShift) eller en slettet vagt fortrydes til
 * "open" (undeleteShift).
 */
export async function queueOpenShiftNotifications(companyId: string, categoryId: string, shiftId: string) {
  try {
    const supabase = createAdminClient();

    const { data: profiles } = await supabase
      .from("freelancer_profiles")
      .select("auth_user_id")
      .eq("company_id", companyId)
      .eq("application_status", "approved");

    const authIds = (profiles ?? []).map((p) => p.auth_user_id as string);
    if (authIds.length === 0) return;

    const { data: catRows } = await supabase
      .from("freelancer_categories")
      .select("freelancer_id")
      .eq("category_id", categoryId)
      .in("freelancer_id", authIds);

    const matchingFreelancerIds = (catRows ?? []).map((r) => r.freelancer_id as string);

    for (const freelancerId of matchingFreelancerIds) {
      const { data: existing } = await supabase
        .from("pending_shift_notifications")
        .select("id, shift_ids")
        .eq("freelancer_id", freelancerId)
        .eq("category_id", categoryId)
        .maybeSingle();

      if (existing) {
        const shiftIds = (existing.shift_ids as string[]) ?? [];
        if (!shiftIds.includes(shiftId)) {
          await supabase
            .from("pending_shift_notifications")
            .update({ shift_ids: [...shiftIds, shiftId] })
            .eq("id", existing.id);
        }
      } else {
        await supabase.from("pending_shift_notifications").insert({
          company_id: companyId,
          freelancer_id: freelancerId,
          category_id: categoryId,
          shift_ids: [shiftId],
        });
      }
    }
  } catch (err) {
    console.error("queueOpenShiftNotifications: kunne ikke sætte i kø", err);
  }
}

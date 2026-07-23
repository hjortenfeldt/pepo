import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToCompanyAdmins } from "@/lib/admin-push";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

type UnfilledRow = { company_id: string; unfilled_count: number };

/**
 * "Ubesat(te) vagt(er) om få dage" — kaldes 1x i døgnet af Supabase pg_cron
 * (job "pepo-unfilled-shifts-digest", 06:00 UTC = 07:00/08:00 dansk tid
 * afhængigt af sommer-/vintertid). I modsætning til de øvrige cron-ruter
 * (som kører hvert 15. min. og derfor selv skal styre PRÆCIS hvornår noget
 * sendes) kører denne kun én gang om dagen, så der er ikke brug for en
 * sent_at-kolonne til at undgå dubletter — selve skemaets sjældenhed er nok.
 *
 * get_companies_with_unfilled_shifts_next_7_days() tæller ubesatte
 * ("open"/"for_resale") vagter pr. virksomhed med shift_date inden for de
 * næste 7 dage (Europe/Copenhagen). Titlen er ental/flertal afhængig af
 * ANTAL VAGTER (ikke antal events) — se Pepo – Notifikationstyper.xlsx,
 * fane "Notifikationstyper (Admin)", række 2, for den aftalte ordlyd.
 * Linker til /shifts/ubesatte (samme filtrering som selve tallet her).
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let sent = 0;

  const { data, error } = await supabase.rpc("get_companies_with_unfilled_shifts_next_7_days");
  if (error) {
    console.error("unfilled-shifts-digest: kunne ikke hente ubesatte vagter", error);
    return NextResponse.json({ error: "Kunne ikke hente ubesatte vagter" }, { status: 500 });
  }

  for (const row of (data ?? []) as UnfilledRow[]) {
    const count = Number(row.unfilled_count);
    if (count <= 0) continue;

    try {
      await sendPushToCompanyAdmins(row.company_id, {
        title: count === 1 ? "Ubesat vagt om få dage" : "Ubesatte vagter om få dage",
        body: "Se de kommende events med ubesatte vagter.",
        url: "/shifts/ubesatte",
      });
      sent++;
    } catch (err) {
      console.error("unfilled-shifts-digest: afsendelse fejlede", row.company_id, err);
    }
  }

  return NextResponse.json({ sent });
}

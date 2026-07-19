import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Simpelt versions-endpoint til UpdateChecker.tsx — den installerede PWA
 * poller dette for at opdage, at der er deployet en ny version, mens appen
 * har stået åben/i baggrunden (en installeret standalone-PWA genindlæser
 * IKKE sig selv automatisk, når man vender tilbage til den — den holder
 * bare den gamle, allerede indlæste side i live i baggrunden). Ingen auth
 * påkrævet ud over den almindelige login-check i proxy.ts (app.pepo.team
 * kræver login for alt undtagen /login og kalender-feedet) — versionsnummeret
 * er ikke følsomt, så vi bruger bare den almindelige rewrite/login-flow i
 * stedet for endnu en offentlig undtagelse dér.
 */
export async function GET() {
  return NextResponse.json({ version: APP_VERSION }, { headers: { "Cache-Control": "no-store" } });
}

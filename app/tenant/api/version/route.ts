import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Admin Appens udgave af app/freelancer/api/version/route.ts — se den for
 * begrundelsen. Bruges af components/admin/AdminUpdateChecker.tsx til at
 * opdage, at der er deployet en ny version, mens en admins fane har stået
 * åben/i baggrunden.
 */
export async function GET() {
  return NextResponse.json({ version: APP_VERSION }, { headers: { "Cache-Control": "no-store" } });
}

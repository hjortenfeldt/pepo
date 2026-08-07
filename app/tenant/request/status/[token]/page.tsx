import { redirect } from "next/navigation";

/**
 * Flyttet til app/tenant/status/[token] (se dens page.tsx og
 * lib/event-status.ts for hvorfor — den nye rute dækker også events uden
 * nogen forespørgsel bag sig). Denne rute beholdes udelukkende som en
 * redirect, så allerede udsendte/bogmærkede /request/status/[token]-links
 * (fx i en klients tidligere modtagne kvitterings-email) fortsætter med at
 * virke uændret.
 */
export default async function LegacyEventRequestStatusRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/status/${token}`);
}

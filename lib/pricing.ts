import { hoursBetween } from "@/lib/format";

/**
 * Ren prisberegning til /request-siden (klientens eget pris-estimat, se
 * [[project_event_request_feature]]) — INGEN "server-only"/"use server" her,
 * bevidst, da samme funktioner både kaldes fra serveren (endelig pris ved
 * indsendelse, gemt på event_requests) OG direkte i browseren (RequestForm.tsx
 * genberegner et løbende overslag, mens klienten tilføjer/redigerer jobrækker
 * på Trin 1, uden en server-tur pr. tastetryk).
 *
 * Genbruger de PRÆCIS samme formler som resten af systemet:
 * - Arbejdsløn: hoursBetween(start, slut) × jobfunktionens priskategoris
 *   client_rate_per_hour (se lib/dashboard.ts's eventFinancials/monthlyFinancials).
 * - Transporttillæg: afstand × 2 (tur/retur) × virksomhedens kr./km-takst ×
 *   antal personale (se lib/shifts-data.ts:244-247).
 */

export type RequestJobLine = {
  categoryId: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

/** categoryId -> jobfunktionens priskategoris kunde-timepris (kr./time). */
export type CategoryRateMap = Map<string, number>;

/**
 * Arbejdsløn-delsummen (uden transporttillæg) for alle jobrækker på Trin 1.
 * En jobfunktion uden priskategori (groupId null, se [[project_categories]])
 * har ingen kendt timepris — den linje bidrager da 0 kr., i stedet for at
 * kaste en fejl, så klienten stadig kan se et (ufuldstændigt, men ikke
 * fejlende) overslag mens de udfylder formularen.
 */
export function calculateLabourSubtotal(rows: RequestJobLine[], rates: CategoryRateMap): number {
  let subtotal = 0;
  for (const row of rows) {
    if (!row.categoryId || !row.startTime || !row.endTime) continue;
    const rate = rates.get(row.categoryId) ?? 0;
    const hours = hoursBetween(row.startTime, row.endTime);
    subtotal += hours * rate;
  }
  return Math.round(subtotal * 100) / 100;
}

/**
 * Transporttillægget — samme formel som events-oversigten (lib/shifts-data.ts),
 * blot med `freelancerCount` = antal jobrækker klienten selv har tilføjet på
 * Trin 1 (én linje = ét stykke personale, der senere skal transporteres til
 * eventet). `null` hvis afstanden endnu ikke er kendt (adressen er endnu
 * ikke valgt/geokodet, fx før Trin 3 er udfyldt) — vis intet beløb i stedet
 * for et forkert 0 kr., ligesom det eksisterende mønster.
 */
export function calculateTransportSurcharge(
  distanceKm: number | null,
  transportRatePerKm: number,
  freelancerCount: number
): number | null {
  if (distanceKm == null) return null;
  return Math.round(distanceKm * 2 * transportRatePerKm * freelancerCount * 100) / 100;
}

/** 25% — hverken konfigurerbar pr. tenant eller pr. jobfunktion (endnu), se calculateVat. */
export const VAT_RATE = 0.25;

/**
 * Moms — 25% af (arbejdsløn + transporttillæg), men KUN for firmakunder.
 * Privatkunder får bevidst intet momstillæg lagt på (Hjorth 2026-08-08:
 * "Private people effectively get a discount, at least for now" — en
 * fremtidig pr.-tenant indstilling kan ændre dette senere). `null` for
 * privatkunder betyder både "ingen moms lagt på totalen" OG "vis slet ikke
 * linjen" i UI'en, se Step4/EventRequestStatusClient/EventRequestDetailClient.
 */
export function calculateVat(
  labourSubtotalKr: number,
  transportSurchargeKr: number | null,
  customerType: "company" | "private"
): number | null {
  if (customerType === "private") return null;
  const subtotal = labourSubtotalKr + (transportSurchargeKr ?? 0);
  return Math.round(subtotal * VAT_RATE * 100) / 100;
}

export function calculateTotal(labourSubtotalKr: number, transportSurchargeKr: number | null, vatKr: number | null): number {
  return Math.round((labourSubtotalKr + (transportSurchargeKr ?? 0) + (vatKr ?? 0)) * 100) / 100;
}

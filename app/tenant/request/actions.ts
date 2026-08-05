"use server";

import { getCompanyBySubdomain } from "@/lib/tenant";
import {
  getWorkCategoriesWithRatesForCompany,
  estimateTransportForCompany,
  submitEventRequestForCompany,
  type EventRequestSubmission,
} from "@/lib/event-requests";

/**
 * Offentlig eventforespørgsel pr. virksomhed, tilgået via deres eget
 * subdomæne (fx kulturbyen.pepo.team/request) — virksomheden afgøres altid
 * af subdomænet, ligesom /apply (se app/tenant/apply/actions.ts). Selve
 * kernelogikken bor i lib/event-requests.ts, denne fil er kun tynde
 * "use server"-wrappere der binder den til DENNE virksomhed.
 */

export async function getCategoriesForRequest() {
  const company = await getCompanyBySubdomain();
  if (!company) return [];
  return getWorkCategoriesWithRatesForCompany(company.id);
}

/** Kaldes fra Trin 3/4, når klienten har valgt eventstedets adresse fra Google-listen. */
export async function getTransportEstimateForRequest(lat: number, lng: number) {
  const company = await getCompanyBySubdomain();
  if (!company) return { distanceKm: null, transportRatePerKm: 5 };
  return estimateTransportForCompany(company.id, lat, lng);
}

export async function submitEventRequest(input: EventRequestSubmission) {
  const company = await getCompanyBySubdomain();
  if (!company) {
    return {
      success: false as const,
      error: "Kunne ikke afgøre hvilken virksomhed forespørgslen gælder for. Prøv igen om lidt.",
    };
  }
  return submitEventRequestForCompany(company.id, input);
}

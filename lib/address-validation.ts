"use server";

import { geocodeAddress } from "@/lib/maps";

/**
 * Tjekker om en adresse/lokation kan slås op hos Google Maps — kaldes fra
 * klient-komponenter via useAddressCheck() (components/useAddressCheck.ts)
 * for at vise en blød advarsel ved siden af adressefelter, FØR en slåfejl
 * ender i databasen og først opdages, når transporttillæg/afstand aldrig
 * dukker op på et event.
 *
 * Bevidst egen "use server"-fil i stedet for at markere hele lib/maps.ts
 * som "use server": lib/maps.ts er markeret "server-only" og bruges af
 * almindelig server-kode (actions.ts-filerne), og skal ikke automatisk
 * gøre ALLE dens eksporter (fx getDrivingDistanceKm) kaldbare direkte fra
 * klienten — kun dette ene, snævre tjek skal være det.
 *
 * Ingen auth-tjek her med vilje: kaldes også fra den offentlige
 * ansøgningsside (<slug>.pepo.team/apply), hvor en ny freelancer endnu
 * ikke er logget ind. Funktionen foretager ikke noget databasekald og
 * afslører intet virksomhedsspecifikt — den er en ren proxy til Googles
 * geokodning, ligeså ufarlig at eksponere offentligt som selve
 * Geocoding-nøglen allerede er (server-only, aldrig sendt til browseren).
 *
 * BLOKERER ALDRIG en gemning — kaldende kode skal altid lade brugeren
 * gemme, uanset resultatet her. Dette er kun en hjælp til at fange
 * slåfejl, ikke en hård validering.
 */
export async function checkAddressResolves(
  address: string,
  postalCode: string | null = null,
  city: string | null = null
): Promise<boolean> {
  if (!address.trim()) return true; // tomt felt er ikke en "forkert adresse" — intet at advare om
  const location = await geocodeAddress(address, postalCode, city);
  return location !== null;
}

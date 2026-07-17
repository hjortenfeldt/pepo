"use server";

import { geocodeAddress, autocompleteAddress, getPlaceDetails, type AddressSuggestion, type ResolvedAddress } from "@/lib/maps";

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

/**
 * Narrow "use server"-wrappere om Places API (New)-funktionerne i
 * lib/maps.ts, til den rigtige adresse-søgning med dropdown (se
 * AddressAutocompleteInput.tsx). Erstatter det bløde
 * checkAddressResolves-tjek ovenfor, som Google kunne omgå ved at falde
 * tilbage til kun at matche landet — se
 * [[project_address_soft_validation_feature]] for hele historikken. Samme
 * ingen-auth-begrundelse gælder her: kaldes også fra den offentlige
 * ansøgningsside, og er en ren proxy til Google uden noget
 * virksomhedsspecifikt.
 */
export async function searchAddressSuggestions(
  input: string,
  sessionToken: string,
  includedPrimaryTypes?: string[]
): Promise<AddressSuggestion[]> {
  return autocompleteAddress(input, sessionToken, includedPrimaryTypes);
}

export async function resolveSelectedAddress(
  placeId: string,
  sessionToken: string
): Promise<ResolvedAddress | null> {
  return getPlaceDetails(placeId, sessionToken);
}

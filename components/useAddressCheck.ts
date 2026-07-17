"use client";

import { useRef, useState } from "react";
import { checkAddressResolves } from "@/lib/address-validation";

const WARNING_TEXT = "Denne adresse kunne ikke bekræftes hos Google Maps — tjek for stavefejl.";

/**
 * Blød adresse-validering til brug ved siden af et adressefelt. `check()`
 * kaldes typisk i onBlur — slår adressen op hos Google og sætter en
 * advarsel, hvis den ikke kan genkendes. Brugt alle steder i appen, hvor
 * en adresse eller lokation kan indtastes: virksomhedens egen adresse
 * (CompanyProfileSettings), arbejdssteder/venues (VenueAddressFields,
 * delt af ClientBoard og ClientQuickAddPanel), freelancer-lokation
 * (FreelancerBoard, admin-siden), og den offentlige ansøgningsside
 * (RegistrationForm).
 *
 * BLOKERER ALDRIG en gemning — advarslen er kun vejledende. Kaldende kode
 * skal ikke undlade at gemme, bare fordi `warning` er sat.
 *
 * Ignorerer selv "forældede" svar: hvis feltet ændres (eller nulstilles
 * via `clear()`) mens et opslag er undervejs, kasseres det gamle svar når
 * det til sidst kommer tilbage, så en advarsel ikke pludselig dukker op
 * for en adresse, brugeren allerede har rettet.
 */
export function useAddressCheck() {
  const [warning, setWarning] = useState<string | null>(null);
  const requestId = useRef(0);

  // Returnerer et Promise<boolean> (true = OK/intet at advare om), så
  // kaldende gem-flows kan `await`e et definitivt svar FØR de beslutter om
  // der skal gemmes med det samme eller pauses og vises en advarsel —
  // uden det ville et hurtigt klik på "Gem" nå at gemme og lukke panelet,
  // før Googles svar overhovedet var kommet tilbage (se
  // [[feedback_await_address_check_before_save]] for hvorfor dette blev
  // rettet). Almindelig onBlur-brug kalder stadig bare `check(...)` uden at
  // afvente den — så opdateres advarslen bare, når svaret kommer.
  async function check(address: string, postalCode?: string | null, city?: string | null): Promise<boolean> {
    const id = ++requestId.current;
    if (!address.trim()) {
      setWarning(null);
      return true;
    }
    const ok = await checkAddressResolves(address, postalCode ?? null, city ?? null);
    if (id !== requestId.current) return true; // et nyere kald/reset er startet siden — kasser dette svar, og bloker ikke for noget
    setWarning(ok ? null : WARNING_TEXT);
    return ok;
  }

  // Kaldes fra onChange, så en advarsel fra den FORRIGE værdi ikke bliver
  // stående og ser ud som om den gælder den nye tekst, brugeren er i gang
  // med at skrive.
  function clear() {
    requestId.current++;
    setWarning(null);
  }

  return { warning, check, clear };
}

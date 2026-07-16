"use client";

import { useRef, useState, useTransition } from "react";
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
  const [, startTransition] = useTransition();
  const requestId = useRef(0);

  function check(address: string, postalCode?: string | null, city?: string | null) {
    const id = ++requestId.current;
    if (!address.trim()) {
      setWarning(null);
      return;
    }
    startTransition(async () => {
      const ok = await checkAddressResolves(address, postalCode ?? null, city ?? null);
      if (id !== requestId.current) return; // et nyere kald/reset er startet siden — kasser dette svar
      setWarning(ok ? null : WARNING_TEXT);
    });
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

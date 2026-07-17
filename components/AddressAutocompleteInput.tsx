"use client";

import { useRef, useState } from "react";
import { searchAddressSuggestions, resolveSelectedAddress } from "@/lib/address-validation";

export type ResolvedAddressResult = {
  formatted: string;
  address: string;
  postalCode: string;
  city: string;
  lat: number;
  lng: number;
};

function newSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Google Places-adressesøgning med dropdown — brugeren SKAL vælge et
 * forslag fra listen (kaldende kode gør typisk Gem/Fortsæt disabled indtil
 * `onSelect` er blevet kaldt for den aktuelle tekst). Afløser det tidligere
 * bløde advarsel-tjek (useAddressCheck/useAddressCheckList), som Google
 * kunne omgå ved at falde tilbage til kun at matche landet for ren
 * gibberish-tekst — se [[project_address_soft_validation_feature]] for hele
 * historikken bag hvorfor vi gik denne vej.
 *
 * Kontrolleret udefra: kaldende kode ejer selv den viste tekst (`value`) og
 * om feltet er "valideret" — denne komponent rapporterer bare tekst-ændring
 * (`onChangeText`, kald denne for at nulstille valideret-status) og et
 * konkret Google-valg (`onSelect`).
 *
 * `includedPrimaryTypes` kan bruges til at bede Google om kun grovere
 * forslag (by/postnummer-niveau) — se brug i FreelancerBoard/RegistrationForm
 * hvor en fuld gadeadresse ikke er nødvendig.
 */
export function AddressAutocompleteInput({
  value,
  onChangeText,
  onSelect,
  includedPrimaryTypes,
  placeholder,
  className,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (result: ResolvedAddressResult) => void;
  includedPrimaryTypes?: string[];
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<{ placeId: string; mainText: string; secondaryText: string }[]>([]);
  const [open, setOpen] = useState(false);
  const sessionToken = useRef(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  function handleChange(text: string) {
    onChangeText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const id = ++requestId.current;
    debounceRef.current = setTimeout(async () => {
      const results = await searchAddressSuggestions(text, sessionToken.current, includedPrimaryTypes);
      if (id !== requestId.current) return; // forældet svar (ny tekst indtastet siden) — kasseret
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 300);
  }

  async function handleSelect(placeId: string, label: string) {
    setOpen(false);
    onChangeText(label);
    const resolved = await resolveSelectedAddress(placeId, sessionToken.current);
    // Sessionen er brugt op efter dette opslag — ny søgning skal starte en
    // ny session, ellers faktureres fremtidige opslag ikke korrekt som en
    // ny gratis autocomplete-session (se prisliste-kommentar i lib/maps.ts).
    sessionToken.current = newSessionToken();
    if (!resolved) return; // opslaget fejlede — feltet forbliver "ikke valideret" hos kaldende kode
    onSelect({
      formatted: resolved.formatted,
      address: resolved.address,
      postalCode: resolved.postalCode,
      city: resolved.city,
      lat: resolved.location.lat,
      lng: resolved.location.lng,
    });
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-pepo-wh border border-pepo-bd rounded-[9px] shadow-[0_6px_18px_rgba(0,0,0,0.1)] max-h-[220px] overflow-y-auto z-20">
          {suggestions.map((s) => (
            <div
              key={s.placeId}
              onMouseDown={() => handleSelect(s.placeId, [s.mainText, s.secondaryText].filter(Boolean).join(", "))}
              className="px-3 py-2.5 text-[13px] text-pepo-t1 cursor-pointer hover:bg-pepo-su border-b border-pepo-bd last:border-none"
            >
              <div className="font-medium">{s.mainText}</div>
              {s.secondaryText && <div className="text-[11.5px] text-pepo-t3 mt-px">{s.secondaryText}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

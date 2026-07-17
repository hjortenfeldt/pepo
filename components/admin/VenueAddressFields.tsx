"use client";

import Icon from "@/components/Icon";
import { AddressAutocompleteInput, type ResolvedAddressResult } from "@/components/AddressAutocompleteInput";

const inputClass =
  "w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"mb-4 " + className}>
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/**
 * Navn + adresse-felterne for ét arbejdssted (venue). Delt mellem
 * ClientBoard.tsx (kundesidens fulde redigeringspanel) og
 * ClientQuickAddPanel.tsx (hurtig opret/redigér-panel, brugt bl.a. fra
 * ClientVenueField i vagt-guiden).
 *
 * Adresse-feltet er en Google Places-søgning (AddressAutocompleteInput) —
 * brugeren SKAL vælge et forslag fra dropdown'en, ikke bare skrive frit.
 * Dette afløste et blødt "advarsel men bloker aldrig"-tjek, som viste sig
 * virkningsløst: Google returnerede "OK" for ren gibberish-tekst ved at
 * falde tilbage til kun at matche landet (se
 * [[project_address_soft_validation_feature]]). Nu er det slet ikke muligt
 * at gemme en adresse, Google ikke selv har foreslået.
 *
 * Kontrolleret udefra (addressText + validated som props) i stedet for at
 * holde egen state internt: begge kaldere har en DYNAMISK LISTE af
 * venue-blokke, og deres Gem-knap skal vide om ALLE rækker er valideret
 * samlet, før den kan aktiveres — det kræver at valideret-status ejes af
 * listen i den overordnede komponent, ikke af hver enkelt
 * VenueAddressFields-instans.
 */
export function VenueAddressFields({
  name,
  addressText,
  validated,
  onNameChange,
  onAddressTextChange,
  onAddressSelected,
}: {
  name: string;
  addressText: string;
  validated: boolean;
  onNameChange: (value: string) => void;
  onAddressTextChange: (text: string) => void;
  onAddressSelected: (result: ResolvedAddressResult) => void;
}) {
  const needsSelection = addressText.trim().length > 0 && !validated;

  return (
    <>
      <Field label="Navn på arbejdssted/venue">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Fx Kanal 4 Havnelokale"
          className={inputClass}
        />
      </Field>
      <Field label="Adresse">
        <AddressAutocompleteInput
          value={addressText}
          onChangeText={onAddressTextChange}
          onSelect={onAddressSelected}
          placeholder="Søg adresse, fx Nyhavn 4, 1051 København K"
          className={inputClass}
        />
      </Field>
      {needsSelection && (
        <p className="-mt-2 mb-3.5 text-[12px] text-[#9A6B00] bg-[#FFF7E6] border border-[#F5D889] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
          <Icon name="alert-triangle" size={14} className="flex-shrink-0 mt-px" />
          Vælg adressen fra listen, der dukker op, mens du skriver — den skal bekræftes hos Google, før den kan gemmes.
        </p>
      )}
    </>
  );
}

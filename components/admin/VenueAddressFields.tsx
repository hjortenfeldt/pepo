"use client";

import Icon from "@/components/Icon";

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
 * Navn + adresse/postnr./by-felterne for ét arbejdssted (venue). Delt
 * mellem ClientBoard.tsx (kundesidens fulde redigeringspanel) og
 * ClientQuickAddPanel.tsx (hurtig opret/redigér-panel, brugt bl.a. fra
 * ClientVenueField i vagt-guiden) — de to havde tidligere identisk,
 * duplikeret markup for disse felter; samlet ét sted, så adresse-tjekket
 * (useAddressCheck) og selve feltlayoutet kun skal vedligeholdes ét sted.
 *
 * Adresse-tjekket sker ved blur af ethvert af de tre felter (adresse,
 * postnr., by) med de aktuelle værdier af alle tre — så en slåfejl fanges
 * uanset hvilket felt brugeren forlader sidst. Blokerer aldrig gemning.
 *
 * Kontrolleret udefra (warning + onBlurCheck som props) i stedet for at
 * holde sin egen useAddressCheck-hook internt: begge kaldere har en
 * DYNAMISK LISTE af venue-blokke, og deres save()-flow skal kunne afvente
 * et definitivt svar for ALLE rækker samlet, før det besluttes om der skal
 * gemmes eller pauses og advarslen vises først — det kræver at
 * tjekket/warning-state ejes af listen i den overordnede komponent (via
 * useAddressCheckList), ikke af hver enkelt VenueAddressFields-instans.
 */
export function VenueAddressFields({
  name,
  address,
  postalCode,
  city,
  onChange,
  warning,
  onBlurCheck,
}: {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  onChange: (field: "name" | "address" | "postalCode" | "city", value: string) => void;
  warning: string | null;
  onBlurCheck: () => void;
}) {
  return (
    <>
      <Field label="Navn på arbejdssted/venue">
        <input
          type="text"
          value={name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Fx Kanal 4 Havnelokale"
          className={inputClass}
        />
      </Field>
      <Field label="Adresse">
        <input
          type="text"
          value={address}
          onChange={(e) => onChange("address", e.target.value)}
          onBlur={onBlurCheck}
          placeholder="Fx Nyhavn 4"
          className={inputClass}
        />
      </Field>
      <div className="flex gap-2.5">
        <Field label="Postnr." className="flex-1">
          <input
            type="text"
            value={postalCode}
            onChange={(e) => onChange("postalCode", e.target.value)}
            onBlur={onBlurCheck}
            placeholder="1051"
            className={inputClass}
          />
        </Field>
        <Field label="By" className="flex-[2]">
          <input
            type="text"
            value={city}
            onChange={(e) => onChange("city", e.target.value)}
            onBlur={onBlurCheck}
            placeholder="København K"
            className={inputClass}
          />
        </Field>
      </div>
      {warning && (
        <p className="-mt-2 mb-3.5 text-[12px] text-[#9A6B00] bg-[#FFF7E6] border border-[#F5D889] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
          <Icon name="alert-triangle" size={14} className="flex-shrink-0 mt-px" />
          {warning}
        </p>
      )}
    </>
  );
}

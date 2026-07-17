"use client";

import { useRef, useState } from "react";
import { checkAddressResolves } from "@/lib/address-validation";

const WARNING_TEXT = "Denne adresse kunne ikke bekræftes hos Google Maps — tjek for stavefejl.";

type Row = { address: string; postalCode?: string | null; city?: string | null };

/**
 * Samme formål som useAddressCheck.ts, men til en DYNAMISK LISTE af rækker
 * (flere arbejdssted/venue-blokke i samme panel) i stedet for ét felt.
 * Bruges af ClientQuickAddPanel og ClientBoard. Warnings holdes i et map
 * nøglet på række-index — matcher de to kalderes eksisterende brug af index
 * som React key i deres `venues.map((v, i) => ...)`.
 */
export function useAddressCheckList() {
  const [warnings, setWarnings] = useState<Record<number, string | null>>({});
  const requestIds = useRef<Record<number, number>>({});

  async function check(
    index: number,
    address: string,
    postalCode?: string | null,
    city?: string | null
  ): Promise<boolean> {
    const id = (requestIds.current[index] ?? 0) + 1;
    requestIds.current[index] = id;
    if (!address.trim()) {
      setWarnings((w) => ({ ...w, [index]: null }));
      return true;
    }
    const ok = await checkAddressResolves(address, postalCode ?? null, city ?? null);
    if (requestIds.current[index] !== id) return true; // forældet svar — kasseret
    setWarnings((w) => ({ ...w, [index]: ok ? null : WARNING_TEXT }));
    return ok;
  }

  function clear(index: number) {
    requestIds.current[index] = (requestIds.current[index] ?? 0) + 1;
    setWarnings((w) => ({ ...w, [index]: null }));
  }

  /**
   * Tjekker ALLE givne rækker parallelt og opdaterer warnings for dem alle.
   * Bruges af save() lige før en gemning, som SKAL have et definitivt svar
   * for hver udfyldt adresse (i stedet for at stole på at onBlur allerede
   * er nået at afsluttes) for at afgøre om der skal gemmes med det samme
   * eller pauses og advarslen vises først.
   */
  async function checkAllNow(rows: Row[]): Promise<boolean> {
    const results = await Promise.all(
      rows.map(async (r, i) => {
        if (!r.address.trim()) return { i, ok: true };
        const ok = await checkAddressResolves(r.address, r.postalCode ?? null, r.city ?? null);
        return { i, ok };
      })
    );
    let allOk = true;
    setWarnings((w) => {
      const next = { ...w };
      for (const { i, ok } of results) {
        next[i] = ok ? null : WARNING_TEXT;
        if (!ok) allOk = false;
      }
      return next;
    });
    return allOk;
  }

  function reset() {
    setWarnings({});
    requestIds.current = {};
  }

  return { warnings, check, clear, checkAllNow, reset };
}

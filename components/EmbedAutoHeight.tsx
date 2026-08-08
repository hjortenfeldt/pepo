"use client";

import { useEffect } from "react";

/**
 * Sættes på /apply og /request (se de to page.tsx-filer) — gør INGENTING når
 * siden besøges direkte (window.self === window.top), men når siden ligger i
 * en <iframe> på en tenants egen hjemmeside (se indlejringskoden på
 * Indstillinger → Vigtige URL'er,
 * components/admin/ImportantUrlsSettings.tsx), overvåger den sidens egen
 * højde og sender den til parent-vinduet via postMessage, så det lille
 * resize-script i indlejringskoden kan tilpasse iframe'ens højde løbende
 * (formularen skifter højde undervejs — flere trin, valideringsfejl,
 * prisberegning i eventforespørgslen osv.).
 *
 * Bruger ikke targetOrigin (kun "*") i postMessage herfra, fordi vi ikke på
 * forhånd kender tenants domæne (kan være hvad som helst). Det er trygt her,
 * fordi den eneste information der sendes er et højde-tal — selve
 * sikkerheden sidder i den ANDEN ende (resize-scriptet i indlejringskoden
 * tjekker event.origin, så kun beskeder fra den rigtige Pepo-side bliver
 * brugt til at ændre iframe-højden).
 */
export default function EmbedAutoHeight() {
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;

    let lastHeight = 0;
    const postHeight = () => {
      const height = document.documentElement.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ type: "pepo:resize", height }, "*");
      }
    };

    postHeight();
    const observer = new ResizeObserver(postHeight);
    observer.observe(document.documentElement);

    // Ekstra sikkerhedsnet med jævne mellemrum — ResizeObserver fanger ikke
    // altid sene ændringer (fx billeder/skrifttyper der lander efter mount,
    // eller layoutskift der ikke ændrer selve document-elementets størrelse
    // et øjeblik). Lav frekvens, så det ikke belaster noget.
    const interval = window.setInterval(postHeight, 1000);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/version";
import Icon from "@/components/Icon";

// Hvor tit vi tjekker, mens appen er åben og synlig (foreslået af Hjorth:
// "en gang i minuttet"). Vi tjekker DESUDEN med det samme, hver gang appen
// bliver synlig igen (visibilitychange) — det fanger det almindelige
// tilfælde: freelanceren har haft appen i baggrunden i timevis og åbner den
// igen, uden at skulle vente på næste 60-sekunders-tik.
const CHECK_INTERVAL_MS = 60_000;

/**
 * Viser en lille, vedvarende bjælke, hvis en nyere version af appen er
 * blevet deployet, mens denne fane/PWA-instans stod åben. Nødvendig fordi en
 * installeret standalone-PWA (hjemmeskærm-genvej) ikke selv genindlæser sig,
 * når man vender tilbage til den — den fryser bare den side, der allerede var
 * indlæst, i baggrunden, indtil man rent faktisk genindlæser eller lukker
 * appen helt (swipe væk i app-switcheren) og åbner den igen. Der findes ingen
 * måde at "genstarte" en installeret PWA fra JavaScript — men det er heller
 * ikke nødvendigt her: sw.js laver ingen offline-caching af selve siden, så
 * et almindeligt location.reload() henter frisk HTML/JS, præcis som et koldt
 * app-genstart ville gøre.
 */
export default function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    async function check() {
      if (checkingRef.current || document.hidden) return;
      checkingRef.current = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { version?: string };
          if (data.version && data.version !== APP_VERSION) {
            setUpdateAvailable(true);
          }
        }
      } catch {
        // Netværksfejl her er ikke kritisk — vi prøver bare igen ved næste tjek.
      } finally {
        checkingRef.current = false;
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="flex-shrink-0 bg-pepo-p text-white px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[12.5px] font-medium">
        <Icon name="refresh" size={16} />
        Der er en ny version af appen klar
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex-shrink-0 bg-white text-pepo-p rounded-[16px] px-3 py-1 text-[12px] font-semibold"
      >
        Opdater nu
      </button>
    </div>
  );
}

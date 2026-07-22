"use client";

import { useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/version";
import Icon from "@/components/Icon";

// Samme interval som components/freelancer/UpdateChecker.tsx — se den for
// begrundelsen (60 sek. + tjek ved visibilitychange).
const CHECK_INTERVAL_MS = 60_000;

/**
 * Admin Appens udgave af components/freelancer/UpdateChecker.tsx. Bevidst
 * IKKE mobil-gate'et (i modsætning til AdminSplashScreen/AdminInstallGate) —
 * en tenant-admin har typisk flere faner/browservinduer åbne gennem hele
 * arbejdsdagen på desktop, og kan derfor sagtens sidde på gammel JS længe
 * efter et nyt deploy, ligesom på mobil. Bjælken vises desuden kun i det
 * sjældne tilfælde at der faktisk ER deployet en ny version, så den er ikke
 * en "føles-som-en-app"-effekt, der forstyrrer den almindelige desktop-brug.
 */
export default function AdminUpdateChecker() {
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
        Der er en ny version af Admin Appen klar
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

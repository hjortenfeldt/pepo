"use client";

import { useEffect, useRef, useState } from "react";
import { isMobileDevice } from "@/lib/device-detection";

const MIN_VISIBLE_MS = 2000;
const FADE_MS = 300;

// Matcher markøren i AdminPageSkeleton.tsx — egen markør (ikke
// data-pepo-splash-fallback, som freelancer-appens SplashScreen.tsx bruger),
// så de to splash-skærme aldrig kan forveksle hinandens loading.tsx-sider,
// selvom begge apps skulle blive åbnet i samme browser.
const FALLBACK_SELECTOR = "[data-pepo-admin-splash-fallback]";

/**
 * Admin Appens udgave af components/freelancer/SplashScreen.tsx — samme
 * MutationObserver-baserede "vent til destinationssiden er klar"-mønster,
 * men KUN vist på mobil/tablet (se lib/device-detection.ts). Tenant-admin
 * bruges primært på desktop i dagligdagen, med mange sidegenindlæsninger —
 * en 2-sekunders splash ved hver eneste genindlæsning ville være en alvorlig
 * regression der, i modsætning til freelancer-appen (kun nogensinde brugt
 * som mobil-app, hvor splash-skærmen giver mening hver gang).
 *
 * Starter bevidst i "unknown" (ikke "animating") og venter til effekten har
 * afgjort enhed, FØR noget som helst tegnes — undgår et enkelt frames glimt
 * af den lilla skærm på desktop, inden den øjeblikkeligt ville skjule sig
 * igen. Mountes i app/tenant/layout.tsx, som (ligesom app/freelancer/
 * layout.tsx) er synkront uden server-awaits, så den — når den rent faktisk
 * vises — males på skærmen øjeblikkeligt, uafhængigt af hvor lang tid siden
 * bagved bruger på sine databasekald.
 */
export default function AdminSplashScreen() {
  const [phase, setPhase] = useState<"unknown" | "animating" | "waiting" | "fading" | "hidden">(
    "unknown"
  );

  const contentReadyRef = useRef(false);
  const minTimeElapsedRef = useRef(false);

  useEffect(() => {
    // Oprydningsfunktionerne sættes asynkront (se Promise.resolve().then()
    // nedenfor — samme mønster som AdminInstallGate.tsx, for at undgå
    // react-hooks/set-state-in-effect), så vi samler dem i en ref i stedet
    // for at returnere dem direkte fra effektens synkrone body.
    const cleanupRef = { current: null as (() => void) | null };
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;

      if (!isMobileDevice()) {
        setPhase("hidden");
        return;
      }
      setPhase("animating");

      function tryHide() {
        if (contentReadyRef.current && minTimeElapsedRef.current) {
          setPhase("fading");
          setTimeout(() => setPhase("hidden"), FADE_MS);
        }
      }

      function checkContentReady() {
        if (contentReadyRef.current) return;
        if (!document.querySelector(FALLBACK_SELECTOR)) {
          contentReadyRef.current = true;
          tryHide();
        }
      }

      // Tjek med det samme — dækker fx login-siden, som slet ikke bruger en
      // loading.tsx-fallback og derfor er "klar" fra første færd.
      checkContentReady();

      const observer = new MutationObserver(checkContentReady);
      observer.observe(document.body, { childList: true, subtree: true });

      const minTimer = setTimeout(() => {
        minTimeElapsedRef.current = true;
        if (contentReadyRef.current) {
          tryHide();
        } else {
          setPhase("waiting");
        }
      }, MIN_VISIBLE_MS);

      cleanupRef.current = () => {
        observer.disconnect();
        clearTimeout(minTimer);
      };
    });

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, []);

  if (phase === "hidden" || phase === "unknown") return null;

  return (
    <div
      className={
        "fixed inset-0 z-[100] transition-opacity duration-300 " +
        (phase === "fading" ? "opacity-0 pointer-events-none" : "opacity-100")
      }
      style={{ backgroundColor: "#6500B3" }}
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
        <div className="w-40 h-40 pepo-splash-logo">
          {/* Samme logo som Freelancer Appens splash-skærm (SplashScreen.tsx)
              — Hjorth vurderede den admin-specifikke variant
              (pepo-admin-logo-inverted.svg) til ikke at fungere optimalt på
              opstartsskærmen, så begge apps' splash-skærme viser nu det
              samme /pepo-logo-inverted.svg. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pepo-logo-inverted.svg" alt="" className="w-full h-full" draggable={false} />
        </div>

        {phase === "waiting" && (
          <div className="w-24 h-[1px] bg-white/25 overflow-hidden rounded-full">
            <div className="h-full w-1/3 bg-white pepo-splash-bar" />
          </div>
        )}
      </div>
    </div>
  );
}

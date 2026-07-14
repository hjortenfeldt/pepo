"use client";

import { useEffect, useRef, useState } from "react";

const MIN_VISIBLE_MS = 2000;
const FADE_MS = 300;

// Matcher markøren i PageSkeleton.tsx. Findes den i DOM'en, viser Next.js'
// loading.tsx-fallback (route-Suspense) sig stadig — dvs. destinationssiden
// (typisk Overblik) er ikke færdig-indlæst i baggrunden endnu. Findes den
// IKKE (fx på login-siden, som ikke bruger nogen loading.tsx), betragtes
// indholdet som klart med det samme.
const FALLBACK_SELECTOR = "[data-pepo-splash-fallback]";

/**
 * Brandet splash-skærm, vist ÉN gang pr. app-session med det samme
 * stand-alone-appen åbnes. Mountes i app/freelancer/layout.tsx — det
 * synkrone rod-layout uden nogen server-awaits — så den males på skærmen
 * øjeblikkeligt, uafhængigt af hvor lang tid (protected)-layoutet og
 * Overblik-siden selv bruger på deres data-kald. Uden dette ser brugeren en
 * helt hvid/blank skærm i de sekunder det tager Next.js at streame den
 * første rigtige side (se project_pull_to_refresh_freelancer_pwa-erfaringen
 * om force-dynamic-sider med flere sekventielle databasekald).
 *
 * Bevidst afkoblet fra selve Next.js' loading.tsx/Suspense-swap (som sker
 * øjeblikkeligt og ikke kan "forsinkes" deklarativt) — i stedet observerer
 * denne komponent selv DOM'en for om PageSkeleton-markøren er til stede, og
 * styrer logo-animation/loading-bar/nedtoning helt selvstændigt. Det sikrer
 * at logo-animationen altid når at spille færdig (2 sek.), uanset hvor
 * hurtigt det rigtige indhold bliver klar i baggrunden — og at der først
 * vises en load-bar hvis indholdet STADIG ikke er klar, når de 2 sek. er gået.
 *
 * Mountes kun once (komponenten selv genmountes ikke ved klientside-
 * navigation mellem faner, da app/freelancer/layout.tsx ikke gør det), så
 * splash-skærmen af sig selv aldrig dukker op igen efter første visning,
 * selvom PageSkeleton-markøren dukker op og forsvinder igen ved senere
 * fane-skift (se PageSkeleton.tsx).
 */
export default function SplashScreen() {
  const [phase, setPhase] = useState<"animating" | "waiting" | "fading" | "hidden">("animating");

  const contentReadyRef = useRef(false);
  const minTimeElapsedRef = useRef(false);

  useEffect(() => {
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

    return () => {
      observer.disconnect();
      clearTimeout(minTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={
        "fixed inset-0 z-[100] transition-opacity duration-300 " +
        (phase === "fading" ? "opacity-0 pointer-events-none" : "opacity-100")
      }
      style={{ backgroundColor: "#6500B3" }}
      aria-hidden="true"
    >
      {/* Placeret med sit lodrette midtpunkt 1/3 nede på skærmen (dvs. 1/3
          luft ovenover, 2/3 under) i stedet for centreret midt på skærmen —
          absolut positionering bruges her fremfor flex+justify-center,
          præcis for at kunne styre dette forhold uafhængigt af skærmhøjde. */}
      <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
        <div className="w-40 h-40 pepo-splash-logo">
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

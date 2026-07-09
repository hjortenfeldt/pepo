"use client";

import { useEffect, useState } from "react";
import InstallGuide, { type Platform } from "./InstallGuide";

// Eksporteret så "Installér Pepo App'en"-rækken under Mere (se
// InstallAppMenuRow.tsx) kan nulstille valget og fremtvinge guiden igen —
// uden denne skal man rydde Safaris webstedsdata for at se guiden igen efter
// at have trykket "Fortsæt uden at installere".
export const DISMISS_KEY = "pepo-install-guide-dismissed";

// Chrome/Edge/Samsung Internet fyrer dette event i stedet for et almindeligt
// "Tilføj til hjemmeskærm"-menupunkt, når browseren selv vurderer at siden
// kan installeres — typen findes ikke i standard lib.dom.d.ts endnu.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function detectPlatform(): Platform {
  const ua = window.navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  if (isIOS) {
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isSafari ? "ios-safari" : "ios-other";
  }
  if (isAndroid) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (/Chrome/.test(ua) && !/Firefox/.test(ua)) return "android-chrome";
    return "android-other";
  }
  if (/Chrome|Edg/.test(ua)) return "desktop-chrome";
  return "desktop-other";
}

/**
 * Gate'er hele freelancer-appen bag en "installér som app"-guide, når
 * brugeren besøger app.pepo.team i en almindelig browserfane frem for som
 * installeret PWA. Formålet er at få freelancere væk fra Safari/Chrome-fanen
 * og over på hjemmeskærm-ikonet, hvor push-beskeder og fuldskærmsvisning
 * faktisk virker.
 *
 * Detektion (standalone-status, platform, browserens eget install-prompt)
 * kan kun ske client-side — der findes ingen server/middleware-signaler for
 * det — så vi viser et blankt øjeblik mens useEffect afgør det, for at undgå
 * et flash af app-indhold før guiden vises.
 *
 * "Fortsæt uden at installere" gemmes i localStorage, så vi ikke nagger ved
 * hver eneste session — men den nulstilles hvis brugeren rydder browserdata,
 * hvilket er fint (så ser de bare guiden igen).
 */
export default function InstallGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "guide" | "app">("checking");
  const [platform, setPlatform] = useState<Platform>("desktop-other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Sat i et resolved promise fremfor direkte i effekten, så React ikke ser
    // det som en synkron setState-kædning (matcher mønstret fra PushToggle.tsx).
    Promise.resolve().then(() => {
      const dismissed = window.localStorage.getItem(DISMISS_KEY) === "true";
      if (isStandalone() || dismissed) {
        setState("app");
      } else {
        setPlatform(detectPlatform());
        setState("guide");
      }
    });

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function skip() {
    window.localStorage.setItem(DISMISS_KEY, "true");
    setState("app");
  }

  async function triggerNativeInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(DISMISS_KEY, "true");
      setState("app");
    }
  }

  if (state === "checking") {
    // Kort, tomt øjeblik mens vi afgør standalone-status — undgår flash af
    // enten app-indhold eller guide, hvis det ender med at være forkert.
    return <div className="min-h-screen bg-pepo-su" />;
  }

  if (state === "guide") {
    return (
      <InstallGuide
        platform={platform}
        onSkip={skip}
        nativeInstall={platform === "android-chrome" && deferredPrompt ? triggerNativeInstall : undefined}
      />
    );
  }

  return <>{children}</>;
}

"use client";

import { useEffect, useState } from "react";
import { isMobileDevice } from "@/lib/device-detection";
import AdminInstallGuide, { type Platform } from "./AdminInstallGuide";

// Eksporteret så "Installér Admin Appen"-rækken (på Profil-siden) kan
// nulstille valget og fremtvinge guiden igen — samme mønster som
// components/freelancer/InstallAppMenuRow.tsx/InstallGate.tsx's DISMISS_KEY,
// blot sin egen nøgle så de to apps' "spring over"-valg ikke deler state,
// hvis en admin også selv bruger freelancer-appen i samme browser.
export const ADMIN_DISMISS_KEY = "pepo-admin-install-guide-dismissed";

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
  // Kaldes kun når isMobileDevice() allerede har sagt ja (se nedenfor), så
  // dette burde reelt aldrig rammes — en defensiv fallback frem for et crash.
  return "android-other";
}

/**
 * Admin Appens udgave af components/freelancer/InstallGate.tsx — gate'er
 * tenant-admin-sitet bag en "installér som app"-guide, men KUN når en admin
 * besøger [slug].pepo.team fra en telefon/tablet i en almindelig browserfane
 * (se lib/device-detection.ts) — IKKE på desktop, hvor admin-systemet bruges
 * i dagligdagen, og hvor denne guide bare ville være i vejen. Dette er den
 * ene store forskel til freelancer-appens InstallGate, som viser en guide
 * (med desktop-specifikt indhold) uanset enhed, fordi app.pepo.team kun
 * nogensinde bruges som mobil-app.
 *
 * Mountes i app/tenant/layout.tsx, ligesom InstallGate.tsx mountes i
 * app/freelancer/layout.tsx — dvs. FØR (protected)/layout.tsx's sidebar/
 * topbar, så guiden (når den vises) dækker hele skærmen inkl. sidebaren, se
 * [[project_admin_appen_pwa_parity]] for Hjorths eksplicitte valg om dette.
 */
export default function AdminInstallGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "guide" | "app">("checking");
  const [platform, setPlatform] = useState<Platform>("ios-safari");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    Promise.resolve().then(() => {
      if (!isMobileDevice()) {
        setState("app");
        return;
      }
      const dismissed = window.localStorage.getItem(ADMIN_DISMISS_KEY) === "true";
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
    window.localStorage.setItem(ADMIN_DISMISS_KEY, "true");
    setState("app");
  }

  async function triggerNativeInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(ADMIN_DISMISS_KEY, "true");
      setState("app");
    }
  }

  if (state === "checking") {
    // Kort, tomt øjeblik mens vi afgør enhed/standalone-status — undgår
    // flash af enten dashboard eller guide, hvis det ender med at være forkert.
    return <div className="min-h-dvh bg-pepo-su" />;
  }

  if (state === "guide") {
    return (
      <AdminInstallGuide
        platform={platform}
        onSkip={skip}
        nativeInstall={platform === "android-chrome" && deferredPrompt ? triggerNativeInstall : undefined}
      />
    );
  }

  return <>{children}</>;
}

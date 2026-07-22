"use client";

/**
 * Afgør om Admin Appens bruger er på en telefon/tablet (iOS/Android), til at
 * gate'e de mobil-specifikke "føles-som-en-app"-effekter (splash-skærm,
 * pull-to-refresh, installér-guide, push-prompt) — tenant-admin-systemet
 * bruges primært på desktop i dagligdagen (mange sidegenindlæsninger gennem
 * arbejdsdagen), så disse effekter må IKKE ramme desktop-brugere, i
 * modsætning til freelancer-appen (som altid viser dem uanset enhed, da den
 * kun nogensinde bruges som mobil-app). Se [[project_admin_appen_pwa_parity]]
 * for hele baggrunden, herunder Hjorths eksplicitte valg om denne gating.
 *
 * Ægte enhedsdetektion (userAgent/touch-points), IKKE kun viewport-bredde —
 * et smalt desktop-browservindue skal stadig opføre sig som desktop.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  return isIOS || isAndroid;
}

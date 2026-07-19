// Delt mellem PushToggle.tsx (indstillinger under "Mere") og PushGate.tsx
// (opstarts-prompt) — begge skal afgøre samme push-status og bruge samme
// VAPID-nøgle-dekodning, så det er samlet ét sted i stedet for duplikeret.

export type PushStatus = "unsupported" | "off" | "on" | "denied";

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Afgør nuværende push-status uden at kalde setState direkte i en effekt
 * (kaldes altid via .then(setStatus) hos kalderne, ikke synkront i effekt-
 * kroppen) — undgår cascading renders og matcher react-hooks/set-state-in-effect.
 */
export async function detectPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  return existing ? "on" : "off";
}

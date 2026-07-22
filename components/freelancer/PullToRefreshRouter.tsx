"use client";

import { usePathname } from "next/navigation";
import PullToRefresh from "@/components/freelancer/PullToRefresh";

/**
 * MIDLERTIDIG A/B-TEST-WRAPPER (bedt om af Hjorth 2026-07-22) — ikke en
 * permanent del af arkitekturen. Formålet er udelukkende at give Hjorth
 * mulighed for at sammenligne vores egen genopbyggede bounce-effekt
 * (PullToRefresh.tsx) side om side med browserens NATIVE rubber-band-scroll,
 * uden at skulle ændre kode mellem hver test: Kontakter-siden (/kontakter)
 * kører med `nativeBounce` slået til (browserens egen fysik, ingen
 * træk-for-at-genindlæse), alle andre sider kører uændret med vores eget
 * flow. Når Hjorth har besluttet sig for hvilken model der skal bruges
 * fremadrettet, skal denne fil enten fjernes igen (tilbage til at
 * (protected)/layout.tsx importerer PullToRefresh direkte) eller opdateres
 * til at afspejle den endelige beslutning for alle sider.
 */
export default function PullToRefreshRouter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const nativeBounce = pathname === "/kontakter";

  return <PullToRefresh nativeBounce={nativeBounce}>{children}</PullToRefresh>;
}

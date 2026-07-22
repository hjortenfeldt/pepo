"use client";

import { usePathname } from "next/navigation";
import PullToRefresh from "@/components/freelancer/PullToRefresh";

/**
 * MIDLERTIDIG A/B-TEST-WRAPPER (bedt om af Hjorth 2026-07-22, opdateret til
 * hybrid-tilstand 2026-07-23) — ikke en permanent del af arkitekturen.
 * Formålet er at give Hjorth mulighed for at teste én bounce-model ad gangen
 * uden at skulle ændre kode mellem hver test: Kontakter-siden (/kontakter)
 * kører lige nu med `bounceMode="hybrid"` (browserens native bounce i bund +
 * ved momentum-ankomst, men vores eget aktive træk-i-toppen bevaret, så
 * træk-for-at-genindlæse stadig virker — se PullToRefresh.tsx's
 * `bounceMode`-doc for hvorfor). Alle andre sider kører uændret med
 * `bounceMode="custom"` (standard, ingen prop nødvendig). Når Hjorth har
 * besluttet sig for hvilken model der skal bruges fremadrettet, skal denne
 * fil enten fjernes igen (tilbage til at (protected)/layout.tsx importerer
 * PullToRefresh direkte) eller opdateres til at afspejle den endelige
 * beslutning for alle sider.
 */
export default function PullToRefreshRouter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bounceMode = pathname === "/kontakter" ? "hybrid" : "custom";

  return <PullToRefresh bounceMode={bounceMode}>{children}</PullToRefresh>;
}

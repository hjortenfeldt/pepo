"use client";

import { useEffect, useState } from "react";
import { isMobileDevice } from "@/lib/device-detection";
import PullToRefresh from "@/components/freelancer/PullToRefresh";

/**
 * Admin Appens tynde wrapper omkring components/freelancer/PullToRefresh.tsx
 * — genbruger den fælles komponent (inkl. dens top-træk-for-at-genindlæse OG
 * bund-elastik-bounce) i stedet for at vedligeholde en egen kopi, efter en
 * tidligere fejl hvor to parallelle kopier af samme UI-idiom (søgefeltet i
 * MessageBoard/ShiftBoard/ClientBoard/FreelancerBoard) drev fra hinanden og
 * gav et bug der skulle rettes to gange (se ExpandingSearchButton.tsx).
 * Tværs-import fra freelancer-mappen er et etableret mønster i denne
 * kodebase (se fx AdminInstallGuide.tsx's brug af ShareIosIcon).
 *
 * Erstatter (protected)/layout.tsx's indholds-scrollpanel (se
 * [[feedback_admin_layout_single_scroll_panel]]) — `enabled` er KUN sand på
 * mobil/tablet (se lib/device-detection.ts): en desktop-admin bruger
 * mus/scrollhjul, ikke touch, så der er reelt aldrig touch-events at style
 * på, men vi styrer det eksplicit for at matche den samme mobil-only-
 * arkitektur som AdminSplashScreen/AdminInstallGate/AdminPushGate. DOM-
 * strukturen er identisk uanset mobil/desktop (se PullToRefresh.tsx's
 * `enabled`-prop), så der sker intet layout-hop når enheden afgøres
 * asynkront efter mount.
 */
export default function AdminPullToRefresh({ children }: { children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setMobile(isMobileDevice()));
  }, []);

  return <PullToRefresh enabled={mobile}>{children}</PullToRefresh>;
}

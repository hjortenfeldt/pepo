import type { Metadata, Viewport } from "next";
import AdminInstallGate from "@/components/admin/AdminInstallGate";
import AdminSplashScreen from "@/components/admin/AdminSplashScreen";

/**
 * Sætter PWA-identitet (manifest/hjemmeskærm-ikon/app-navn) for HELE
 * tenant-admin-sitet ([slug].pepo.team) — login- og ansøgningssiden
 * (app/tenant/login, app/tenant/apply) OG det beskyttede dashboard
 * ((protected)/layout.tsx, som kun tilføjer sin egen title-template
 * ovenpå denne). Uden dette lag ville "Tilføj til hjemmeskærm" på en
 * tenant-admins telefon arve root-layoutets metadata (app/layout.tsx),
 * som er skrevet til det offentlige "bliv freelancer"-site, ikke admin.
 *
 * Samme mønster som app/freelancer/layout.tsx overskriver root-metadata
 * for app.pepo.team — blot med et helt andet ikon (Design/pepo-admin-
 * logo.svg, en dedikeret admin-variant af logoet) og "Pepo Admin" som
 * navn, så en admin kan se forskel på de to installerede apps på sin
 * telefon, selv hvis de (som Hjorth) også selv bruger freelancer-appen.
 */
export const metadata: Metadata = {
  manifest: "/tenant-admin-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pepo Admin",
  },
  icons: {
    apple: "/icons/admin-apple-touch-icon.png",
  },
};

// viewportFit/maximumScale/userScalable påvirker KUN mobile browseres eget
// pinch-to-zoom/dobbelttryk-zoom — desktopbrowseres egen zoom (ctrl+scroll)
// styres ikke af viewport-metaen, så dette er trygt at sætte globalt uden at
// gate'e det til mobil (i modsætning til AdminInstallGate/AdminSplashScreen
// nedenfor, som rent faktisk ÆNDRER hvad der vises/opleves på desktop, og
// derfor skal forblive mobil-only — se lib/device-detection.ts).
export const viewport: Viewport = {
  // Appens rigtige baggrundsfarve (--pepo-wh, matcher AdminTopBar), IKKE
  // splash-lilla — se samme forklaring i app/freelancer/layout.tsx og
  // lib/theme-color.ts. AdminSplashScreen.tsx overskriver den midlertidigt,
  // KUN på mobil (hvor splash-skærmen overhovedet vises).
  themeColor: "#ffffff",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// AdminInstallGate/AdminSplashScreen sidder her (øverst for HELE tenant-
// admin-sitet, dvs. også /login og /apply), ikke i (protected)/layout.tsx —
// samme begrundelse som freelancer-appens InstallGate/SplashScreen i
// app/freelancer/layout.tsx. Begge er internt mobil-only-gate'ede (se
// lib/device-detection.ts) og gør derfor INGENTING på desktop — hverken
// synligt eller mærkbart — hvilket var Hjorths eksplicitte krav, da
// tenant-admin (i modsætning til freelancer-appen) primært bruges på
// desktop i dagligdagen. Se [[project_admin_appen_pwa_parity]].
export default function TenantRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminInstallGate>{children}</AdminInstallGate>
      {/* Uden for AdminInstallGate (samme mønster som SplashScreen/InstallGate
          i app/freelancer/layout.tsx) — så splash-overlayet dækker BÅDE
          AdminInstallGate's egen korte "checking"-tilstand og en evt.
          installér-guide, ikke kun det færdige dashboard-indhold. */}
      <AdminSplashScreen />
    </>
  );
}

import type { Metadata } from "next";

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

export default function TenantRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata, Viewport } from "next";
import InstallGate from "@/components/freelancer/InstallGate";

/**
 * Overskriver root-metadata (app/layout.tsx) for hele freelancer-appen,
 * så "Tilføj til hjemmeskærm" på app.pepo.team installerer freelancer-
 * appens eget manifest/ikon — ikke det offentlige registrerings-sites.
 * Next.js's Metadata API slår automatisk denne op i <head> uden at vi
 * selv skal skrive HTML, hvilket er nødvendigt her, da root-layoutet
 * (app/layout.tsx) allerede ejer <html>/<body> for alle subdomæner.
 */
export const metadata: Metadata = {
  title: "Pepo",
  description: "Se dine vagter, stempel ind/ud, og få besked om nye vagter der passer til dig.",
  manifest: "/freelancer-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pepo",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#3e1f8a",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// InstallGate sidder her (øverst for HELE freelancer-appen, dvs. også
// /login), ikke i (protected)/layout.tsx — brugeren skal se "installér som
// app"-guiden allerede FØR login-prompten, med det samme de rammer
// app.pepo.team i en almindelig browserfane. Se komponenten for hvorfor
// detektionen kun kan ske client-side.
export default function FreelancerRootLayout({ children }: { children: React.ReactNode }) {
  return <InstallGate>{children}</InstallGate>;
}

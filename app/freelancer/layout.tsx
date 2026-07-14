import type { Metadata, Viewport } from "next";
import InstallGate from "@/components/freelancer/InstallGate";
import SplashScreen from "@/components/freelancer/SplashScreen";

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
  // Slår pinch-to-zoom helt fra i freelancer-appen — den skal opføres som
  // en "rigtig" app, ikke en zoombar hjemmeside. maximumScale:1 alene
  // blokerer det ikke konsekvent på tværs af browsere/OS-versioner.
  userScalable: false,
};

// InstallGate sidder her (øverst for HELE freelancer-appen, dvs. også
// /login), ikke i (protected)/layout.tsx — brugeren skal se "installér som
// app"-guiden allerede FØR login-prompten, med det samme de rammer
// app.pepo.team i en almindelig browserfane. Se komponenten for hvorfor
// detektionen kun kan ske client-side.
export default function FreelancerRootLayout({ children }: { children: React.ReactNode }) {
  return (
    // "fixed inset-0" tager hele freelancer-appen ud af dokument-flowet, så
    // <body> selv aldrig kan scrolle/bounce på mobil Safari — al scroll skal
    // ske i et bevidst udpeget indre element (fx (protected)/layout.tsx's
    // egen overflow-y-auto-container). Uden dette kunne hele siden, inkl.
    // bundnavigationen, rykke sig ved swipe, fordi <body> selv fungerede som
    // en (uønsket) scroll-container ved siden af den indre.
    //
    // Baggrundsfarven her er bevidst splash-skærmens lilla (#6500B3), IKKE
    // bg-pepo-su — <body> i det fælles rod-layout (app/layout.tsx) er hvid
    // som standard, og der går et øjeblik fra browseren maler den hvide
    // <body> til SplashScreen (og alt herunder) selv har nået at male oven
    // på den. I det øjeblik er DETTE elements baggrund det eneste der reelt
    // ses, så den skal matche splash-skærmen, ikke det senere sideindhold
    // (som alligevel altid maler sin egen baggrund ovenpå, fx InstallGate,
    // login-siden og (protected)-indholdet).
    <div className="fixed inset-0 overflow-y-auto overscroll-none bg-[#6500B3]">
      <InstallGate>{children}</InstallGate>
      {/* SplashScreen sidder bevidst her og ikke længere nede i træet: dette
          layout er synkront (ingen server-awaits), så Next.js kan streame
          det med det samme uden at vente på (protected)-layoutets/Overblik-
          sidens egne databasekald. Overlayet dækker dermed InstallGate og
          alt derunder, uanset hvor lang tid den rigtige side er om at blive
          klar i baggrunden — se SplashScreen.tsx for hvordan den selv
          registrerer hvornår indholdet er klar. */}
      <SplashScreen />
    </div>
  );
}

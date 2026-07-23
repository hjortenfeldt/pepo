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
  // Appens rigtige, lyse baggrundsfarve (--pepo-su) — bevidst FAST hele tiden,
  // også mens SplashScreen vises ovenpå. Vi forsøgte tidligere at farve OS-
  // chromet (Safaris URL-felt/status-bar) splash-lilla og skifte det tilbage
  // igen dynamisk via JS, men iOS Safari var upålidelig til at reagere på
  // ændringer efter første load, og et forsøg på en "sikrere" workaround
  // (fjerne/genskabe selve <meta>-elementet) endte med at forårsage en reel
  // regression (se project_splash_screen_freelancer_pwa-memory, v0.28.4).
  // Konklusion: den kortvarige (under et par sekunder) farve-mismatch mens
  // splashen vises er en acceptabel kosmetisk detalje, ikke noget værd at
  // jagte videre — stabilitet og enkel kode vejer tungere.
  themeColor: "#f8f8fa",
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
    // v0.28.7: baggrunden her var tidligere hardkodet til splash-lilla
    // (#6500B3) for at undgå et kort glimt af hvid <body>-baggrund før
    // SplashScreen selv malede sig ovenpå. Det viste sig at have en langt
    // værre bivirkning: da DETTE element dækker HELE skærmen (også ind under
    // Safaris gennemsigtige top/bund-bjælker) og forbliver monteret i hele
    // appens levetid (ikke kun mens splashen vises), var det rent faktisk
    // dette elements permanente lilla baggrund — ikke <meta name=theme-color>
    // — Safari viste igennem i status-bar/URL-felt, permanent, også længe
    // efter splashen selv var væk. bg-pepo-su matcher nu appens rigtige,
    // lyse baggrund permanent i stedet; SplashScreen.tsx's egen overlay
    // (som har sin egen eksplicitte lilla baggrund) dækker stadig hele
    // skærmen i splash-vinduet, så det visuelle splash-udtryk er uændret —
    // kun det (meget korte) øjeblik FØR SplashScreen når at montere skifter
    // fra "lilla" til "lys" i baggrunden, hvilket er et langt mindre problem
    // end en fastfrosset forkert chrome-farve resten af sessionen.
    <div className="fixed inset-0 overflow-y-auto overscroll-none bg-pepo-su">
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

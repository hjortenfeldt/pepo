/**
 * Opdaterer <meta name="theme-color">, som styrer OS-browserchrome — Safaris
 * URL-felt (bund af skærmen, ikke-standalone browserfane) og, på visse iOS-
 * versioner, status-bar-baggrunden (top af skærmen, klokkeslæt/batteri) i en
 * installeret PWA. Next.js's `viewport`-export (app/freelancer/layout.tsx,
 * app/tenant/layout.tsx) sætter kun en STATISK standardværdi — appens
 * rigtige, lyse baggrundsfarve. Splash-skærmene (SplashScreen.tsx /
 * AdminSplashScreen.tsx) kalder denne funktion for MIDLERTIDIGT at farve
 * begge chrome-områder lilla mens splash-overlayet er synligt, og sætter dem
 * tilbage til appens rigtige farve, så snart splash forsvinder.
 *
 * v0.28.4-fix: Hjorth testede v0.28.3 grundigt (frisk Safari-session, OG en
 * fuld afinstallation+geninstallation af appen) og så stadig fastfrosset
 * lilla i Freelancer Appen — men IKKE i Admin Appen. Det viste sig ikke være
 * en reel forskel i logikken (begge splash-skærme kalder denne funktion på
 * nøjagtig samme måde), men at Admin Appens test aldrig reelt afprøvede den
 * dynamiske "skift tilbage"-kode: Admin Appen er desktop-først, og
 * AdminSplashScreen viser sig slet ikke på desktop (isMobileDevice() falsk),
 * så theme-color rørte den aldrig — kun den STATISKE standardværdi (allerede
 * korrekt hvid) blev reelt testet der. Freelancer Appen er derimod altid
 * mobil, så den ramte den dynamiske kode hver gang, og AFSLØREDE dermed en
 * kendt, veldokumenteret Safari/WebKit-kvirk: at ændre en EKSISTERENDE
 * `<meta name="theme-color">`-tags `content`-attribut via `setAttribute()`
 * bliver ofte ikke opfanget pålideligt af iOS' egen chrome-farvelægning —
 * hverken i almindelig Safari eller i en installeret standalone-app. Den
 * almindeligt anbefalede løsning (brugt her) er i stedet at FJERNE hele
 * meta-elementet og indsætte et helt NYT et med den ønskede farve — det
 * tvinger Safari til at opdage ændringen, hvor en simpel attribut-mutation
 * på det samme element ikke gjorde.
 */
export function setThemeColor(color: string) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
  const meta = document.createElement("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", color);
  document.head.appendChild(meta);
}

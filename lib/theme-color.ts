/**
 * Opdaterer <meta name="theme-color">, som styrer OS-browserchrome — Safaris
 * URL-felt (bund af skærmen, ikke-standalone browserfane) og, på visse iOS-
 * versioner, status-bar-baggrunden (top af skærmen, klokkeslæt/batteri) i en
 * installeret PWA. Next.js's `viewport`-export (app/freelancer/layout.tsx,
 * app/tenant/layout.tsx) sætter kun en STATISK standardværdi — appens
 * rigtige, lyse baggrundsfarve. Splash-skærmene (SplashScreen.tsx /
 * AdminSplashScreen.tsx) kalder denne funktion for MIDLERTIDIGT at farve
 * begge chrome-områder lilla mens splash-overlayet er synligt, og sætter dem
 * tilbage til appens rigtige farve, så snart splash forsvinder — ellers
 * "hænger" browserchromet fast i splash-farven resten af besøget, hvilket
 * var Hjorths rapporterede fejl (v0.28.3).
 */
export function setThemeColor(color: string) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
}

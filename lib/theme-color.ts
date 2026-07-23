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
 * v0.28.5 — TILBAGERULLET fra v0.28.4's forsøg. Den version fjernede hele
 * meta-elementet fra DOM'en og indsatte et helt nyt et (et almindeligt
 * foreslået trick mod en formodet Safari-kvirk) — men det element hører til
 * i <head>, som Next.js' App Router selv styrer via React (viewport/metadata-
 * systemet). At fjerne/genskabe det UDENOM React kan efterlade Reacts interne
 * bogføring af det stykke DOM i en tilstand der ikke matcher virkeligheden,
 * hvilket meget sandsynligt var årsagen til at BÅDE login (Freelancer Appen)
 * og pull-to-refresh (Admin Appen, router.refresh()-transitionen hang for
 * evigt med spinneren stående) gik i stå bagefter — begge involverer en
 * React-transition/routing-opdatering, som kan crashe/hænge hvis React
 * støder på en uventet DOM-tilstand i <head> under reconciliation.
 * Prioritet: grundlæggende funktion (login, genindlæsning) er langt
 * vigtigere end en kosmetisk status-bar-farve — gået tilbage til den
 * simple, React-sikre attribut-mutation (som IKKE fjerner noget DOM-element),
 * selvom den ikke nødvendigvis løser Freelancer Appens fastfrosne lilla
 * status-bar fuldt ud. Den kosmetiske fejl kan tages op igen separat, mere
 * forsigtigt, uden at røre <head>-DOM'en direkte.
 */
export function setThemeColor(color: string) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
}

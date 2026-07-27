"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageScrollLock } from "@/components/freelancer/PullToRefresh";

// Slide-ind/ud-animation til højrepaneler, der monteres/afmonteres betinget
// af forælderen (fx `{wizard && <Panel />}`) — i modsætning til paneler som
// altid er i DOM'en og bare skifter en translate-x-klasse (fx ClientBoard),
// har disse paneler ingen "lukket" tilstand at animere ud fra/til, medmindre
// vi selv holder komponenten i live et kort øjeblik efter luk-klik.
//
// Brug: `const { visible, close } = useSlidePanel(onClose);` — brug `close`
// i stedet for `onClose` alle steder i komponenten (luk-knap, overlay-klik,
// og efter et vellykket gem), og brug `visible` til at style panelet:
// `(visible ? "opacity-100" : "translate-x-full opacity-0")`.
//
// VIGTIGT: brug ALDRIG "translate-x-0" i den synlige gren, kun fravær af
// transform-klasse. translate-x-0 sætter stadig transform !== none, hvilket
// laver en ny stacking context/containing block og kan blokere native
// popups (fx <input type="date">'s kalendervælger) i Chrome — se
// [[feedback_slide_panel_native_picker_bug]].
//
// HISTORIK-BASERET LUKNING (swipe-fra-kant-fejl): et panel her har ingen
// egen URL — det er bare React-state hos forælderen. Uden mere ville iOS/
// WKWebView's indbyggede "swipe fra venstre kant"-tilbage-gestus (som en
// bruger naturligt prøver på et fuldskærms- eller næsten-fuldskærmspanel,
// fx freelancer-appens Vagtdetaljer) falde helt igennem til browserens
// RIGTIGE navigationshistorik i stedet for at lukke panelet — første swipe
// kunne dermed lande på en helt anden, tidligere besøgt side, og først et
// ANDET swipe ramte den forventede "luk panel"-effekt (se
// [[feedback_slide_panel_edge_swipe_back]]).
//
// Løsningen: hvert kald af useSlidePanel skubber sin EGEN historik-post ind
// ved mount (uden at ændre URL'en), mærket med en dybde ét højere end den
// historik-post der allerede var aktiv. Både et klik på en luk-knap OG et
// swipe/hardware-tilbage-tryk går derfor gennem PRÆCIS samme vej: et
// history.back()-kald, som udløser ét `popstate`. Panelets egen lytter
// sammenligner den NYE dybde (efter tilbage-navigationen) med sin egen —
// er den nye dybde lavere, er DEN blevet "poppet", og lukker sig selv.
// Dette virker også korrekt ved indlejrede paneler (fx ClientQuickAddPanel
// åbnet inde fra ShiftWizardPanel): kun det inderste panel har en højere
// dybde end den nye aktuelle, så kun det lukker ved ét swipe/back-tryk.
export function useSlidePanel(onClose: () => void, duration = 200) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  // Låser side-scrollen bag panelet, mens det er synligt — se
  // usePageScrollLock's egen doc-kommentar i PullToRefresh.tsx for hvorfor
  // (opdaget efter overscroll-behavior:contain alene ikke løste alt).
  usePageScrollLock(visible);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Sat af close()/closeWith() lige inden history.back() kaldes, og læst af
  // popstate-lytteren nedenfor, når den rent faktisk skal lukke — så en
  // closeWith(andenCallback) (se ClientQuickAddPanel.tsx's gem-og-luk) kører
  // DEN callback efter animationen, ikke bare altid den oprindelige onClose.
  const pendingCallbackRef = useRef(onClose);
  // Denne instans' egen historik-dybde — sat én gang ved ægte første mount.
  // null indtil da, så vi kan skelne "endnu ikke sat" fra dybde 0.
  const depthRef = useRef<number | null>(null);

  useEffect(() => {
    if (depthRef.current === null) {
      const currentDepth = (window.history.state as { pepoPanelDepth?: number } | null)?.pepoPanelDepth ?? 0;
      depthRef.current = currentDepth + 1;
      window.history.pushState({ pepoPanelDepth: depthRef.current }, "");
    }

    function handlePopState() {
      const newDepth = (window.history.state as { pepoPanelDepth?: number } | null)?.pepoPanelDepth ?? 0;
      if (depthRef.current !== null && newDepth < depthRef.current) {
        setVisible(false);
        // En panel-lukning (både via luk-knap-klik og via history.back()
        // ovenfor) udløser DENNE popstate — men Next.js' egen router lytter
        // også globalt efter popstate for at understøtte browserens
        // frem/tilbage-navigation, og kan nå at gen-anvende sin klient-side
        // router-cache for den historik-post vi lige er "gået tilbage til"
        // FØR vi selv når hertil (listener-rækkefølge). Er den cachede
        // udgave ældre end et `router.refresh()` kaldt lige inden panelet
        // blev lukket (fx efter en gemt tildeling/frigivelse), overskriver
        // Next stiltiende det friske data igen med den forældede cache —
        // observeret som "Utilgængelig"-mærkatet i FreelancerAssignDropdown
        // der aldrig forsvinder efter en frigivelse, selvom frigivelsen er
        // gemt korrekt. Et ekstra `router.refresh()` HER (efter selve
        // tilbage-navigationen er anvendt) tvinger en frisk hentning af den
        // nu aktuelle rute igen, uanset hvad Next lige gjorde.
        router.refresh();
        const callback = pendingCallbackRef.current;
        setTimeout(callback, duration);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
    // Kører bevidst kun ved mount/unmount. depthRef-guarden ovenfor holder
    // pushet idempotent (også under React Strict Modes dobbelte
    // effect-kørsel i dev), og en frisk onClose fanges alligevel via
    // pendingCallbackRef i close()/closeWith() nedenfor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    closeWith(onClose);
  }

  // Til paneler med flere "luk"-årsager (fx annullér vs. gem-og-luk), hvor
  // det er en anden callback end `onClose`, der skal køres efter animationen.
  function closeWith(callback: () => void) {
    pendingCallbackRef.current = callback;
    // Går "tilbage" for at forbruge denne instans' egen historik-post —
    // udløser selv popstate-lytteren ovenfor, som herefter står for både
    // luk-animationen og selve callback-kaldet. Vi sætter IKKE
    // visible/timeout her direkte, for at undgå at gøre det dobbelt (swipe/
    // back-tryk og et UI-luk-klik skal opføre sig 100% ens).
    window.history.back();
  }

  return { visible, close, closeWith };
}

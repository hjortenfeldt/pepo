"use client";

import { useEffect, useState } from "react";
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
export function useSlidePanel(onClose: () => void, duration = 200) {
  const [visible, setVisible] = useState(false);

  // Låser side-scrollen bag panelet, mens det er synligt — se
  // usePageScrollLock's egen doc-kommentar i PullToRefresh.tsx for hvorfor
  // (opdaget efter overscroll-behavior:contain alene ikke løste alt).
  usePageScrollLock(visible);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function close() {
    closeWith(onClose);
  }

  // Til paneler med flere "luk"-årsager (fx annullér vs. gem-og-luk), hvor
  // det er en anden callback end `onClose`, der skal køres efter animationen.
  function closeWith(callback: () => void) {
    setVisible(false);
    setTimeout(callback, duration);
  }

  return { visible, close, closeWith };
}

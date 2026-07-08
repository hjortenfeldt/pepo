"use client";

import { useEffect, useState } from "react";

// Slide-ind/ud-animation til højrepaneler, der monteres/afmonteres betinget
// af forælderen (fx `{wizard && <Panel />}`) — i modsætning til paneler som
// altid er i DOM'en og bare skifter en translate-x-klasse (fx ClientBoard),
// har disse paneler ingen "lukket" tilstand at animere ud fra/til, medmindre
// vi selv holder komponenten i live et kort øjeblik efter luk-klik.
//
// Brug: `const { visible, close } = useSlidePanel(onClose);` — brug `close`
// i stedet for `onClose` alle steder i komponenten (luk-knap, overlay-klik,
// og efter et vellykket gem), og brug `visible` til at style panelet:
// `(visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0")`.
export function useSlidePanel(onClose: () => void, duration = 200) {
  const [visible, setVisible] = useState(false);

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

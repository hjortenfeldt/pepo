"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// Tærskler i CSS-pixel, valgt til at matche følelsen af iOS/Androids egne
// indbyggede pull-to-refresh-gestus (typisk 60-80px for at udløse, med et
// elastisk "rubber band"-loft så man ikke kan trække i det uendelige).
const TRIGGER_DISTANCE = 68;
const MAX_DISTANCE = 120;
const DAMPING = 0.5;
const SPINNER_HEIGHT = 52;
// Så spinneren ikke bare blinker forbi ved et lynhurtigt genindlæs — de
// fleste apps (Mail, Twitter/X m.fl.) holder den synlig i et minimum af tid.
const MIN_REFRESH_VISIBLE_MS = 500;

/**
 * Native-app-agtig "træk ned for at genindlæse" på selve sidens indhold —
 * ikke på hele PWA-shell'en. Bundnavigationen (BottomNav) ligger uden for
 * denne komponent i layout.tsx og påvirkes derfor slet ikke af trækket.
 *
 * Erstatter browserens egen overscroll-bounce (som var slået fra med
 * overscroll-none, da den så akavet ud sammen med adresselinje/PWA-chrome)
 * med en selvbygget, kontrolleret elastisk effekt + spinner — CSS/
 * overscroll-behavior alene giver ingen måde at hooke en genindlæsnings-
 * handling på selve bounce-bevægelsen.
 *
 * Selve trækket manipulerer DOM'en direkte via refs (IKKE React state) for
 * at holde det flydende på 60fps — kun de "faste" tilstande (genindlæser
 * eller ej) går gennem React state, da de alligevel altid animeres med en
 * CSS-transition og derfor ikke skal opdatere på hver eneste touchmove.
 *
 * touchmove-lytteren tilføjes manuelt med { passive: false } (ikke som et
 * almindeligt React onTouchMove-prop) — React's syntetiske touch-lyttere er
 * passive som standard, hvilket ville gøre e.preventDefault() til en no-op
 * og lade siden bounce/scrolle native SAMTIDIG med vores eget træk.
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const spinnerIconRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const draggingRef = useRef(false);
  const refreshStartedAtRef = useRef(0);

  const [refreshing, setRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function setVisualPull(distance: number, animated: boolean) {
    const scrollEl = scrollRef.current;
    const spinnerEl = spinnerWrapRef.current;
    if (!scrollEl || !spinnerEl) return;

    const transform = `transform ${animated ? "280ms cubic-bezier(0.34, 1.56, 0.64, 1)" : "0ms"}`;
    const height = `height ${animated ? "280ms cubic-bezier(0.34, 1.56, 0.64, 1)" : "0ms"}`;
    scrollEl.style.transition = transform;
    spinnerEl.style.transition = height;
    scrollEl.style.transform = `translateY(${distance}px)`;
    spinnerEl.style.height = `${distance}px`;

    if (spinnerIconRef.current) {
      const progress = Math.min(distance / TRIGGER_DISTANCE, 1);
      spinnerIconRef.current.style.opacity = String(progress);
      if (!refreshing) {
        spinnerIconRef.current.style.transform = `rotate(${progress * 360}deg)`;
      }
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (refreshing || el!.scrollTop > 0) {
        draggingRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      draggingRef.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!draggingRef.current || startYRef.current === null) return;
      if (el!.scrollTop > 0) {
        // Brugeren er begyndt at scrolle almindeligt i stedet for at trække
        // — giv slip på vores eget træk og lad browserens normale scroll
        // overtage resten af gestussen.
        draggingRef.current = false;
        pullDistanceRef.current = 0;
        setVisualPull(0, true);
        return;
      }

      const rawDelta = e.touches[0].clientY - startYRef.current;
      if (rawDelta <= 0) {
        pullDistanceRef.current = 0;
        setVisualPull(0, false);
        return;
      }

      // Forhindrer siden i samtidig at scrolle/native-bounce mens vi selv
      // styrer trækket — kræver { passive: false }, se forklaring ovenfor.
      e.preventDefault();
      const damped = Math.min(rawDelta * DAMPING, MAX_DISTANCE);
      pullDistanceRef.current = damped;
      setVisualPull(damped, false);
    }

    function onTouchEnd() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      startYRef.current = null;

      if (pullDistanceRef.current >= TRIGGER_DISTANCE) {
        setVisualPull(SPINNER_HEIGHT, true);
        setRefreshing(true);
        refreshStartedAtRef.current = Date.now();
        startTransition(() => {
          router.refresh();
        });
      } else {
        setVisualPull(0, true);
      }
      pullDistanceRef.current = 0;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  // Så snart selve genindlæsningen (router.refresh()) er færdig — men
  // tidligst efter MIN_REFRESH_VISIBLE_MS — glider indholdet op på plads
  // igen, og spinneren stopper.
  useEffect(() => {
    if (!refreshing || isPending) return;
    const elapsed = Date.now() - refreshStartedAtRef.current;
    const remaining = Math.max(MIN_REFRESH_VISIBLE_MS - elapsed, 0);
    const timer = setTimeout(() => {
      setRefreshing(false);
      setVisualPull(0, true);
    }, remaining);
    return () => clearTimeout(timer);
  }, [refreshing, isPending]);

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div
        ref={spinnerWrapRef}
        className="absolute top-0 left-0 right-0 z-0 flex items-center justify-center overflow-hidden"
        style={{ height: 0 }}
      >
        <div ref={spinnerIconRef} className={refreshing ? "animate-spin" : ""} style={{ opacity: 0 }}>
          <Icon name="loader-2" size={22} className="text-pepo-p" />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="relative z-[1] h-full overflow-y-auto overscroll-none bg-pepo-su"
      >
        {children}
      </div>
    </div>
  );
}

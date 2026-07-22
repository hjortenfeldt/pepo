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
// Ved bunden af indholdet betragtes man som "ved bunden" selv med en anelse
// sub-pixel-afrunding fra scrollHeight/clientHeight — uden denne margen ville
// bounce-effekten aldrig udløses på visse skærme/zoom-niveauer.
const BOTTOM_EPSILON = 1;

/**
 * Native-app-agtig scrolloplevelse for selve sidens indhold — ikke hele
 * PWA-shell'en. Bruges af BÅDE Freelancer Appen (altid aktiv) og Admin Appen
 * (kun aktiv på mobil, se components/admin/AdminPullToRefresh.tsx's tynde
 * wrapper omkring denne komponent — importeres bevidst på tværs af app-mapper,
 * samme etablerede mønster som fx ShareIosIcon.tsx).
 *
 * To uafhængige elastiske "træk for langt"-effekter, begge med samme
 * dæmpning/loft/ease-out-kurve som iOS/Androids egne indbyggede gestus:
 * 1. Øverst: træk ned udløser "genindlæs" hvis man trækker forbi
 *    TRIGGER_DISTANCE, ellers glider indholdet elastisk tilbage på plads.
 * 2. Nederst: træk op forbi bunden af indholdet giver en tilsvarende
 *    elastisk "bounce", der altid blot glider tilbage på plads igen — rent
 *    kosmetisk, udløser ingen handling. Tilføjet fordi overscroll-none
 *    (se nedenfor) ellers gør at siden stopper helt brat i begge ender,
 *    hvilket ikke føles app-agtigt.
 *
 * Erstatter browserens egen overscroll-bounce (som var slået fra med
 * overscroll-none, da den så akavet ud sammen med adresselinje/PWA-chrome,
 * og fordi CSS/overscroll-behavior alene ikke giver nogen måde at hooke en
 * genindlæsnings-handling på selve bounce-bevægelsen) med disse to
 * selvbyggede, kontrollerede elastiske effekter.
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
export default function PullToRefresh({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  /**
   * Admin Appen sætter denne til false på desktop (se AdminPullToRefresh.tsx)
   * — DOM-strukturen forbliver identisk uanset enabled, kun selve
   * touch-lytterne (og dermed al elastisk adfærd) slås fra, så der ikke sker
   * noget layout-hop når enheden afgøres asynkront efter mount.
   */
  enabled?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const spinnerIconRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const modeRef = useRef<"none" | "top" | "bottom">("none");
  const draggingRef = useRef(false);
  const refreshStartedAtRef = useRef(0);

  const [refreshing, setRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function setVisualPull(distance: number, animated: boolean) {
    const scrollEl = scrollRef.current;
    const spinnerEl = spinnerWrapRef.current;
    if (!scrollEl || !spinnerEl) return;

    const transition = `280ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
    scrollEl.style.transition = `transform ${animated ? transition : "0ms"}`;
    spinnerEl.style.transition = `height ${animated ? transition : "0ms"}`;
    scrollEl.style.transform = `translateY(${distance}px)`;

    // Spinneren hører kun til den ØVERSTE træk-retning (positiv distance) —
    // ved en negativ (nederste bounce) forbliver den skjult/0 i højden.
    const positiveDistance = Math.max(distance, 0);
    spinnerEl.style.height = `${positiveDistance}px`;

    if (spinnerIconRef.current) {
      const progress = Math.min(positiveDistance / TRIGGER_DISTANCE, 1);
      spinnerIconRef.current.style.opacity = String(progress);
      if (!refreshing) {
        spinnerIconRef.current.style.transform = `rotate(${progress * 360}deg)`;
      }
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    function atTop() {
      return el!.scrollTop <= 0;
    }
    function atBottom() {
      return el!.scrollTop + el!.clientHeight >= el!.scrollHeight - BOTTOM_EPSILON;
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshing) {
        draggingRef.current = false;
        modeRef.current = "none";
        return;
      }
      // Prioriterer "top", hvis indholdet er kortere end selve
      // scroll-panelet (scrollTop er så altid 0 OG "ved bunden" samtidig) —
      // matcher den oprindelige pull-to-refresh-adfærd i det tilfælde.
      modeRef.current = atTop() ? "top" : atBottom() ? "bottom" : "none";
      if (modeRef.current === "none") {
        draggingRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      draggingRef.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!draggingRef.current || startYRef.current === null) return;
      const rawDelta = e.touches[0].clientY - startYRef.current;

      if (modeRef.current === "top") {
        if (!atTop()) {
          // Brugeren er begyndt at scrolle almindeligt i stedet for at
          // trække — giv slip på vores eget træk og lad browserens normale
          // scroll overtage resten af gestussen.
          draggingRef.current = false;
          pullDistanceRef.current = 0;
          setVisualPull(0, true);
          return;
        }
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
      } else if (modeRef.current === "bottom") {
        if (!atBottom()) {
          draggingRef.current = false;
          pullDistanceRef.current = 0;
          setVisualPull(0, true);
          return;
        }
        if (rawDelta >= 0) {
          // Fingeren bevæger sig nedad ved bunden — det er en almindelig
          // scroll tilbage op i indholdet, ikke et forsøg på at trække
          // forbi bunden.
          pullDistanceRef.current = 0;
          setVisualPull(0, false);
          return;
        }
        e.preventDefault();
        const damped = Math.max(rawDelta * DAMPING, -MAX_DISTANCE);
        pullDistanceRef.current = damped;
        setVisualPull(damped, false);
      }
    }

    function onTouchEnd() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      startYRef.current = null;

      if (modeRef.current === "top" && pullDistanceRef.current >= TRIGGER_DISTANCE) {
        setVisualPull(SPINNER_HEIGHT, true);
        setRefreshing(true);
        refreshStartedAtRef.current = Date.now();
        startTransition(() => {
          router.refresh();
        });
      } else {
        // Gælder både et for-kort top-træk (glider ned på plads igen) og
        // ethvert bund-bounce (glider altid bare tilbage — udløser aldrig
        // noget).
        setVisualPull(0, true);
      }
      pullDistanceRef.current = 0;
      modeRef.current = "none";
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
  }, [enabled, refreshing]);

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
    // min-w-0 (ikke kun min-h-0): harmløst i Freelancer Appens flex-col-
    // sammenhæng, men nødvendigt i Admin Appen, hvor denne komponent sidder
    // som flex-item ved siden af AdminSidebar i en flex-row (se
    // [[feedback_admin_layout_single_scroll_panel]]) — samlet ét sted i
    // stedet for at have to divergerende varianter af denne klasse.
    <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
      <div
        ref={spinnerWrapRef}
        className="absolute top-0 left-0 right-0 z-0 flex items-center justify-center overflow-hidden"
        style={{ height: 0 }}
      >
        <div ref={spinnerIconRef} className={refreshing ? "animate-spin" : ""} style={{ opacity: 0 }}>
          <Icon name="loader-2" size={22} className="text-pepo-p" />
        </div>
      </div>
      <div ref={scrollRef} className="relative z-[1] h-full overflow-y-auto overscroll-none bg-pepo-su">
        {children}
      </div>
    </div>
  );
}

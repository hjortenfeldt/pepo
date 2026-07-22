"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// RUBBER_BAND_COEFFICIENT: WebKit's own historical rubber-band constant
// (0.55) — well-documented, widely reproduced in native-scroll-feel
// reimplementations (no live web search tool was available in the sandbox
// session that first wrote this to re-verify against a fresh source, so it's
// drawn from established public documentation of WebKit's ScrollController
// rather than a fresh lookup — flagged to Hjorth at the time). The formula
// f(x) = (x·d·c)/(d + c·x) gives a fast, near-linear response for small
// drags that progressively stiffens and asymptotically approaches `d` — the
// actual "give more the harder you pull, but never past a firm limit" feel.
const RUBBER_BAND_COEFFICIENT = 0.55;
// The asymptote `d` in the formula above — kept at UI scale (not the full
// scroll-panel height, which is what WebKit itself uses) so the visual
// travel stays appropriate for a compact pull-affordance instead of letting
// you drag hundreds of pixels before feeling real resistance.
const MAX_DISTANCE = 120;
const TRIGGER_DISTANCE = 68;
const SPINNER_HEIGHT = 52;
// Så spinneren ikke bare blinker forbi ved et lynhurtigt genindlæs — de
// fleste apps (Mail, Twitter/X m.fl.) holder den synlig i et minimum af tid.
const MIN_REFRESH_VISIBLE_MS = 500;

const SPRING_BACK_TRANSITION = "300ms cubic-bezier(0.34, 1.56, 0.64, 1)";
const INSTANT = "0ms";

function rubberBand(delta: number) {
  return (delta * MAX_DISTANCE * RUBBER_BAND_COEFFICIENT) / (MAX_DISTANCE + RUBBER_BAND_COEFFICIENT * delta);
}

type PullToRefreshSlots = { header: HTMLDivElement | null; footer: HTMLDivElement | null };
const PullToRefreshSlotContext = createContext<PullToRefreshSlots>({ header: null, footer: null });

/**
 * Portalerer children ind i den faste top-bar-plads ved siden af (uden for)
 * scrollRef — se doc-kommentaren på selve PullToRefresh.tsx for hvorfor.
 * Erstatter det gamle mønster med en `sticky top-0`-div som første barn af
 * sidens indhold. Returnerer null indtil slottet er monteret (kortvarigt ved
 * allerførste render, før layout-effekten når at sætte det) — ingen synlig
 * flimren i praksis, da det sker før browserens første maling.
 */
export function PullToRefreshHeader({ children }: { children: React.ReactNode }) {
  const { header } = useContext(PullToRefreshSlotContext);
  if (!header) return null;
  return createPortal(children, header);
}

/** Samme som PullToRefreshHeader, men for en fast bund-knap/handlingsbar. */
export function PullToRefreshFooter({ children }: { children: React.ReactNode }) {
  const { footer } = useContext(PullToRefreshSlotContext);
  if (!footer) return null;
  return createPortal(children, footer);
}

/**
 * Native-app-agtig scrolloplevelse for selve sidens indhold — ikke hele
 * PWA-shell'en. Bruges af BÅDE Freelancer Appen (altid aktiv) og Admin Appen
 * (kun aktiv på mobil, se components/admin/AdminPullToRefresh.tsx's tynde
 * wrapper omkring denne komponent — importeres bevidst på tværs af app-mapper,
 * samme etablerede mønster som fx ShareIosIcon.tsx).
 *
 * HYBRID-MODEL (v0.27.4, gjort permanent og universel i v0.28.0 efter at
 * Hjorth testede den på Kontakter-siden og godkendte følelsen ubetinget):
 * browseren styrer ALT scroll-relateret bounce selv (bund-elastik OG et
 * hurtigt swipe der ankommer via momentum, finger allerede løftet) via
 * `overscroll-behavior: auto` — det var derfor Hjorths oprindelige idé om
 * "kan vi ikke bare bruge browserens egen model" var rigtig, for netop de to
 * dele. Den ENESTE del vi selv står for er det AKTIVE træk i toppen af
 * indholdet, fordi det er den eneste del der reelt kræver et JS-hook: der
 * findes ingen browser-API til at hooke en "genindlæs"-handling på native
 * overscroll. Det aktiveres udelukkende når `scrollTop <= 0` OG brugeren
 * rent faktisk trækker nedad der — et hurtigt momentum-swipe der ankommer
 * til toppen (finger allerede løftet) rammer ALDRIG denne kode, da der ikke
 * er noget aktivt touchmove at opsnappe, og falder derfor automatisk
 * tilbage til browserens egen native bounce i toppen, ligesom i bunden.
 *
 * (Ældre historik: v0.27.0–v0.27.1 byggede en fuld genimplementering af
 * bund-bounce + momentum-bounce ovenpå `overscroll-none`, fordi den
 * oprindelige antagelse var at ALT skulle bygges selv for at få en app-agtig
 * følelse. v0.27.3 testede ren native scrolling på én side for at
 * sammenligne, hvilket bekræftede at kun toppens genindlæsnings-gestus
 * reelt havde brug for eget JS — se project-memory for den fulde forløb,
 * hvis den historik bliver relevant igen.)
 *
 * VIGTIGT — kun selve INDHOLDET må bounce', ikke sidernes top-bar/bund-knap:
 * en CSS `transform` på et element gør det til et nyt "containing block" for
 * alle `position: fixed`-efterkommere (så de flytter sig med i stedet for at
 * blive hængende i viewporten), og enhver `position: sticky`-efterkommer
 * flytter uundgåeligt med som en del af hele den transformerede boks — også
 * selvom den KUN er "sticky" og ikke selv "fixed". Løsning: to ægte
 * DOM-SØSKENDE til scrollRef — `headerSlotRef`/`footerSlotRef` — der slet
 * ikke er en del af den scrollende/transformerede boks. Sider der har en
 * fast top-bar eller bund-knap (OverviewClient.tsx, KontakterClient.tsx,
 * ShiftRequestDetail.tsx, ColleagueDetail.tsx, ProfileEditForm.tsx) bruger de
 * eksporterede `<PullToRefreshHeader>`/`<PullToRefreshFooter>` i stedet for
 * en `sticky top-0`/`sticky bottom-0`-div — de portalerer (via React's
 * `createPortal`) deres indhold ind i disse slots. Contexten
 * (`PullToRefreshSlotContext`) gør slottets DOM-node tilgængelig for enhver
 * efterkommer i React-træet, uanset hvor dybt nede i `{children}` den sider —
 * portalering flytter kun selve DOM-outputtet, ikke React-konteksten.
 *
 * En modsat transform på `.sticky`/`.fixed`-efterkommere (Tailwinds egne,
 * bogstavelige klassenavne) er bevaret som et defensivt fallback for ægte
 * `position: fixed`-elementer der IKKE bruger disse slots (fx slide-in-
 * panelerne i ShiftWizardPanel.tsx m.fl., som bruger `fixed inset-0` direkte
 * i sidens markup) — kun relevant mens toppens aktive træk rent faktisk
 * kører (den eneste del af flowet der stadig sætter en transform).
 *
 * Selve trækket manipulerer DOM'en direkte via refs (IKKE React state) for
 * at holde det flydende på 60fps — kun de "faste" tilstande (genindlæser
 * eller ej) går gennem React state, da de alligevel altid animeres med en
 * CSS-transition og derfor ikke skal opdatere på hver eneste touchmove.
 *
 * touchmove-lytteren tilføjes manuelt med { passive: false } (ikke som et
 * almindeligt React onTouchMove-prop) — React's syntetiske touch-lyttere er
 * passive som standard, hvilket ville gøre e.preventDefault() til en no-op
 * og lade siden scrolle native SAMTIDIG med vores eget træk.
 */
export default function PullToRefresh({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  /**
   * Admin Appen sætter denne til false på desktop (se AdminPullToRefresh.tsx)
   * — DOM-strukturen forbliver identisk uanset enabled, kun selve
   * touch-lytterne (og dermed træk-for-at-genindlæse) slås fra, så der ikke
   * sker noget layout-hop når enheden afgøres asynkront efter mount.
   */
  enabled?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerSlotRef = useRef<HTMLDivElement>(null);
  const footerSlotRef = useRef<HTMLDivElement>(null);
  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const spinnerIconRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const draggingRef = useRef(false);
  const refreshStartedAtRef = useRef(0);
  // Cachet ved touchstart i stedet for at forespørge DOM'en på hver eneste
  // touchmove-frame.
  const fixedOrStickyElsRef = useRef<HTMLElement[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [slots, setSlots] = useState<PullToRefreshSlots>({ header: null, footer: null });
  const router = useRouter();

  // useLayoutEffect (ikke useEffect): sætter slot-noderne synkront FØR
  // browseren når at male, så en side der bruger <PullToRefreshHeader> ikke
  // først viser et hul og derefter popper ind.
  useLayoutEffect(() => {
    setSlots({ header: headerSlotRef.current, footer: footerSlotRef.current });
  }, []);

  function setVisualPull(distance: number, transition: string) {
    const scrollEl = scrollRef.current;
    const spinnerEl = spinnerWrapRef.current;
    if (!scrollEl || !spinnerEl) return;

    scrollEl.style.transition = `transform ${transition}`;
    scrollEl.style.transform = `translateY(${distance}px)`;

    // Modsat transform på enhver .sticky/.fixed-efterkommer — se doc-kommentar
    // ovenfor for hvorfor dette er nødvendigt for at holde dem visuelt i ro.
    for (const el of fixedOrStickyElsRef.current) {
      el.style.transition = `transform ${transition}`;
      el.style.transform = `translateY(${-distance}px)`;
    }

    const positiveDistance = Math.max(distance, 0);
    spinnerEl.style.transition = `height ${transition}`;
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
    function captureFixedOrSticky() {
      fixedOrStickyElsRef.current = Array.from(el!.querySelectorAll<HTMLElement>(".sticky, .fixed"));
    }

    // Det eneste vi selv styrer: et aktivt træk ned, mens indholdet allerede
    // står helt i toppen. Alt andet (bund-elastik, momentum-ankomst i begge
    // ender) er browserens eget native overscroll — se doc-kommentaren
    // ovenfor for hvorfor.
    function onTouchStart(e: TouchEvent) {
      if (refreshing || !atTop()) {
        draggingRef.current = false;
        return;
      }
      captureFixedOrSticky();
      startYRef.current = e.touches[0].clientY;
      draggingRef.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!draggingRef.current || startYRef.current === null) return;
      const rawDelta = e.touches[0].clientY - startYRef.current;

      if (!atTop()) {
        // Brugeren er begyndt at scrolle almindeligt i stedet for at
        // trække — giv slip på vores eget træk og lad browserens normale
        // scroll overtage resten af gestussen.
        draggingRef.current = false;
        pullDistanceRef.current = 0;
        setVisualPull(0, SPRING_BACK_TRANSITION);
        return;
      }
      if (rawDelta <= 0) {
        pullDistanceRef.current = 0;
        setVisualPull(0, INSTANT);
        return;
      }
      // Forhindrer siden i samtidig at scrolle/native-bounce mens vi selv
      // styrer trækket — kræver { passive: false }, se forklaring ovenfor.
      e.preventDefault();
      const damped = rubberBand(rawDelta);
      pullDistanceRef.current = damped;
      setVisualPull(damped, INSTANT);
    }

    function onTouchEnd() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      startYRef.current = null;

      if (pullDistanceRef.current >= TRIGGER_DISTANCE) {
        setVisualPull(SPINNER_HEIGHT, SPRING_BACK_TRANSITION);
        setRefreshing(true);
        refreshStartedAtRef.current = Date.now();
        startTransition(() => {
          router.refresh();
        });
      } else {
        setVisualPull(0, SPRING_BACK_TRANSITION);
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
      setVisualPull(0, SPRING_BACK_TRANSITION);
    }, remaining);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing, isPending]);

  return (
    <PullToRefreshSlotContext.Provider value={slots}>
      {/* min-w-0 (ikke kun min-h-0): harmløst i Freelancer Appens flex-col-
          sammenhæng, men nødvendigt i Admin Appen, hvor denne komponent
          sidder som flex-item ved siden af AdminSidebar i en flex-row (se
          [[feedback_admin_layout_single_scroll_panel]]) — samlet ét sted i
          stedet for at have to divergerende varianter af denne klasse. */}
      <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        {/* Header-slot: ægte DOM-søskende til scrollRef, uden for den
            transformerede/bounce'ende boks — se PullToRefreshHeader. Tom når
            en side ikke bruger den (fx sider uden fast top-bar). */}
        <div ref={headerSlotRef} className="relative z-[2] flex-shrink-0" />
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
          {/* overscroll-auto (ikke -none): lader browserens egen native
              rubber-band styre bund-elastik og momentum-ankomst i begge
              ender — se doc-kommentaren for hele modellen. */}
          <div ref={scrollRef} className="relative z-[1] h-full overflow-y-auto overscroll-auto bg-pepo-su">
            {children}
          </div>
        </div>
        {/* Bund-slot: samme idé, for en fast bund-knap/handlingsbar — se
            PullToRefreshFooter. */}
        <div ref={footerSlotRef} className="relative z-[2] flex-shrink-0" />
      </div>
    </PullToRefreshSlotContext.Provider>
  );
}

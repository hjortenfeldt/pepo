"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// RUBBER_BAND_COEFFICIENT: WebKit's own historical rubber-band constant
// (0.55) — well-documented, widely reproduced in native-scroll-feel
// reimplementations (this session had no live web search tool available in
// the sandbox to re-verify against a fresh source, so this is drawn from
// established public documentation of WebKit's ScrollController rather than
// a fresh lookup — flagged to Hjorth). The formula f(x) = (x·d·c)/(d + c·x)
// gives a fast, near-linear response for small drags that progressively
// stiffens and asymptotically approaches `d` — the actual "give more the
// harder you pull, but never past a firm limit" feel, replacing our old
// linear-then-hard-clip approximation.
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
// Ved bunden af indholdet betragtes man som "ved bunden" selv med en anelse
// sub-pixel-afrunding fra scrollHeight/clientHeight.
const BOTTOM_EPSILON = 1;

const SPRING_BACK_TRANSITION = "300ms cubic-bezier(0.34, 1.56, 0.64, 1)";
const MOMENTUM_OUT_TRANSITION = "120ms cubic-bezier(0.22, 0.61, 0.36, 1)";
const INSTANT = "0ms";

// Momentum-bounce (afsnit 2 nedenfor): hvor hurtig en native-scroll skal
// være ved ankomst til kanten, før vi overhovedet gider vise en bounce —
// under denne er farten så lav, at et rigtigt fysisk apparat heller ikke
// ville vise noget mærkbart.
const MOMENTUM_VELOCITY_FLOOR = 0.05; // px/ms
// Skalerer den observerede hastighed om til en "virtuel" trækafstand, som
// derefter køres gennem samme rubber-band-formel som selve trækket, så et
// hurtigt fingerslip giver en større bounce end et langsomt.
const VELOCITY_TO_DISTANCE_SCALE = 110;
const MOMENTUM_BOUNCE_MIN_PX = 4;

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
 * Tre dele, alle med samme rubber-band-kurve og samme spring-tilbage-kurve:
 * 1. Øverst, AKTIVT TRÆK: træk ned udløser "genindlæs" hvis man trækker
 *    forbi TRIGGER_DISTANCE, ellers glider indholdet elastisk tilbage.
 * 2. Nederst, AKTIVT TRÆK: samme elastiske "bounce" ved bunden, men rent
 *    kosmetisk — udløser aldrig noget, glider bare tilbage.
 * 3. MOMENTUM-ANKOMST (finger allerede løftet): hvis en almindelig,
 *    hurtig scroll-bevægelse (browserens egen momentum/inerti) ankommer til
 *    top eller bund, mens der IKKE trækkes aktivt, vises en kort, hastigheds-
 *    proportional bounce der altid bare glider tilbage — ellers stopper
 *    scrollet brat, uanset hvor hurtigt man swipede, hvilket var Hjorths
 *    konkrete klage. Kan ikke opsnappe selve WebKits interne fysik direkte
 *    (ingen offentlig API for det) — observerer i stedet native `scroll`-
 *    events og udleder fart/retning selv.
 *
 * VIGTIGT — kun selve INDHOLDET må bounce', ikke sidernes top-bar/bund-knap:
 * en CSS `transform` på et element gør det til et nyt "containing block" for
 * alle `position: fixed`-efterkommere (så de flytter sig med i stedet for at
 * blive hængende i viewporten), og enhver `position: sticky`-efterkommer
 * flytter uundgåeligt med som en del af hele den transformerede boks — også
 * selvom den KUN er "sticky" og ikke selv "fixed". Første forsøg (v0.27.1)
 * modvirkede dette med en modsat transform på alle `.sticky`/`.fixed`-
 * elementer, men det løste ikke det underliggende problem Hjorth faktisk så:
 * fordi header/bund-bar stadig lå SOM BØRN AF scrollRef (bare `sticky` i
 * stedet for løst placeret), talte de stadig med i scrollRef's egen
 * `scrollHeight`, så browserens NATIVE scrollbar i højre side dækkede både
 * indhold og header — det var synligt forkert, uanset transform-modvirkningen.
 *
 * Rigtig løsning (v0.27.2): to ægte DOM-SØSKENDE til scrollRef —
 * `headerSlotRef`/`footerSlotRef` — der slet ikke er en del af den
 * scrollende/transformerede boks. Sider der har en fast top-bar eller
 * bund-knap (OverviewClient.tsx, KontakterClient.tsx, ShiftRequestDetail.tsx,
 * ColleagueDetail.tsx, ProfileEditForm.tsx) bruger nu de eksporterede
 * `<PullToRefreshHeader>`/`<PullToRefreshFooter>` i stedet for en
 * `sticky top-0`/`sticky bottom-0`-div — de portalerer (via React's
 * `createPortal`) deres indhold ind i disse slots. Contexten
 * (`PullToRefreshSlotContext`) gør slottets DOM-node tilgængelig for enhver
 * efterkommer i React-træet, uanset hvor dybt nede i `{children}` den sider —
 * portalering flytter kun selve DOM-outputtet, ikke React-konteksten. Fordel
 * frem for v0.27.1's modvirkende transform: header/footer er nu strukturelt
 * uden for scrollRef, så de hverken kan bounce ELLER tælle med i scrollbaren.
 *
 * `.sticky`/`.fixed`-modvirkningen fra v0.27.1 er bevaret som et defensivt
 * fallback for ægte `position: fixed`-elementer der IKKE bruger disse slots
 * (fx slide-in-panelerne i ShiftWizardPanel.tsx m.fl., som bruger
 * `fixed inset-0` direkte i sidens markup) — de har intet scrollbar-problem
 * (fixed elementer tæller aldrig med i en forfaders scrollHeight), men ville
 * stadig visuelt bounce med uden modvirkningen.
 *
 * Erstatter browserens egen overscroll-bounce (som var slået fra med
 * overscroll-none, da den så akavet ud sammen med adresselinje/PWA-chrome,
 * og fordi CSS/overscroll-behavior alene ikke giver nogen måde at hooke en
 * genindlæsnings-handling på selve bounce-bevægelsen).
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
   * touch-/scroll-lytterne (og dermed al elastisk adfærd) slås fra, så der
   * ikke sker noget layout-hop når enheden afgøres asynkront efter mount.
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
  const modeRef = useRef<"none" | "top" | "bottom">("none");
  const draggingRef = useRef(false);
  const refreshStartedAtRef = useRef(0);
  // Cachet ved touchstart/momentum-ankomst i stedet for at forespørge DOM'en
  // på hver eneste touchmove-frame.
  const fixedOrStickyElsRef = useRef<HTMLElement[]>([]);
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  const wasAtTopRef = useRef(true);
  const wasAtBottomRef = useRef(false);
  const momentumBounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Spinneren hører kun til den ØVERSTE træk-retning (positiv distance) —
    // ved en negativ (nederste bounce) forbliver den skjult/0 i højden.
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
    function atBottom() {
      return el!.scrollTop + el!.clientHeight >= el!.scrollHeight - BOTTOM_EPSILON;
    }
    function captureFixedOrSticky() {
      fixedOrStickyElsRef.current = Array.from(el!.querySelectorAll<HTMLElement>(".sticky, .fixed"));
    }

    // --- Del 1 & 2: aktivt træk (top-genindlæs / bund-bounce) ---

    function onTouchStart(e: TouchEvent) {
      if (refreshing) {
        draggingRef.current = false;
        modeRef.current = "none";
        return;
      }
      modeRef.current = atTop() ? "top" : atBottom() ? "bottom" : "none";
      if (modeRef.current === "none") {
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

      if (modeRef.current === "top") {
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
      } else if (modeRef.current === "bottom") {
        if (!atBottom()) {
          draggingRef.current = false;
          pullDistanceRef.current = 0;
          setVisualPull(0, SPRING_BACK_TRANSITION);
          return;
        }
        if (rawDelta >= 0) {
          // Fingeren bevæger sig nedad ved bunden — det er en almindelig
          // scroll tilbage op i indholdet, ikke et forsøg på at trække
          // forbi bunden.
          pullDistanceRef.current = 0;
          setVisualPull(0, INSTANT);
          return;
        }
        e.preventDefault();
        const damped = -rubberBand(-rawDelta);
        pullDistanceRef.current = damped;
        setVisualPull(damped, INSTANT);
      }
    }

    function onTouchEnd() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      startYRef.current = null;

      if (modeRef.current === "top" && pullDistanceRef.current >= TRIGGER_DISTANCE) {
        setVisualPull(SPINNER_HEIGHT, SPRING_BACK_TRANSITION);
        setRefreshing(true);
        refreshStartedAtRef.current = Date.now();
        startTransition(() => {
          router.refresh();
        });
      } else {
        // Gælder både et for-kort top-træk (glider ned på plads igen) og
        // ethvert bund-bounce (glider altid bare tilbage — udløser aldrig
        // noget).
        setVisualPull(0, SPRING_BACK_TRANSITION);
      }
      pullDistanceRef.current = 0;
      modeRef.current = "none";
    }

    // --- Del 3: momentum-ankomst (finger allerede løftet) ---
    //
    // Vi kan ikke opsnappe selve WebKits interne momentum-fysik (ingen
    // offentlig API), men almindelige `scroll`-events bliver ved med at
    // fyre løbende, mens momentum-scrollet ruller — også efter fingeren er
    // løftet. Ved at tidsstemple scrollTop kan vi udlede farten, og reagere
    // når scrollTop for første gang rammer 0 eller max MENS farten stadig
    // var mærkbar (dvs. det var et momentum-stop, ikke bare et langsomt,
    // helt naturligt ophør ved kanten, som ikke skal bounce synligt).
    function onScroll() {
      const now = performance.now();
      const currentTop = el!.scrollTop;
      const dt = now - lastScrollTimeRef.current;
      const velocity = dt > 0 ? (currentTop - lastScrollTopRef.current) / dt : 0;

      const isAtTop = atTop();
      const isAtBottom = atBottom();

      // Kun relevant mens vi IKKE selv styrer et aktivt træk — under et
      // aktivt træk ændrer scrollTop sig slet ikke (vi transformerer kun
      // visuelt), så denne funktion griber naturligt ikke forstyrrende ind
      // i den brugerstyrede gestus.
      if (!draggingRef.current && !refreshing) {
        if (isAtTop && !wasAtTopRef.current && velocity < -MOMENTUM_VELOCITY_FLOOR) {
          triggerMomentumBounce(1, -velocity);
        } else if (isAtBottom && !wasAtBottomRef.current && velocity > MOMENTUM_VELOCITY_FLOOR) {
          triggerMomentumBounce(-1, velocity);
        }
      }

      wasAtTopRef.current = isAtTop;
      wasAtBottomRef.current = isAtBottom;
      lastScrollTopRef.current = currentTop;
      lastScrollTimeRef.current = now;
    }

    function triggerMomentumBounce(direction: 1 | -1, velocityMagnitude: number) {
      if (momentumBounceTimerRef.current) clearTimeout(momentumBounceTimerRef.current);
      captureFixedOrSticky();
      const virtualDelta = velocityMagnitude * VELOCITY_TO_DISTANCE_SCALE;
      const peak = rubberBand(virtualDelta) * direction;
      if (Math.abs(peak) < MOMENTUM_BOUNCE_MIN_PX) return;

      setVisualPull(peak, MOMENTUM_OUT_TRANSITION);
      momentumBounceTimerRef.current = setTimeout(() => {
        setVisualPull(0, SPRING_BACK_TRANSITION);
        momentumBounceTimerRef.current = null;
      }, 120);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("scroll", onScroll);
      if (momentumBounceTimerRef.current) clearTimeout(momentumBounceTimerRef.current);
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
          <div ref={scrollRef} className="relative z-[1] h-full overflow-y-auto overscroll-none bg-pepo-su">
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

"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
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
const DEFAULT_ICON = "refresh";

const SPRING_BACK_TRANSITION = "300ms cubic-bezier(0.34, 1.56, 0.64, 1)";
const INSTANT = "0ms";

function rubberBand(delta: number) {
  return (delta * MAX_DISTANCE * RUBBER_BAND_COEFFICIENT) / (MAX_DISTANCE + RUBBER_BAND_COEFFICIENT * delta);
}

type PullToRefreshSlots = {
  header: HTMLDivElement | null;
  footer: HTMLDivElement | null;
};
type PullToRefreshContextValue = PullToRefreshSlots & {
  // Selve scrollRef'et (stabilt objekt, ændrer aldrig reference — kun
  // .current gør), delt via context så usePageScrollLock (se dens egen
  // doc-kommentar) kan låse DENNE konkrete boks — ikke document.body, som
  // aldrig selv scroller her (se (protected)/layout.tsx's h-dvh
  // overflow-hidden-wrapper). Sendes som et ref-objekt (ikke den udpakkede
  // DOM-node i state, som header/footer er) specifikt så eslint's
  // react-hooks/immutability-regel tillader at mutere .current.style
  // direkte i usePageScrollLock — refs er den anerkendte undtagelse for
  // imperativ DOM-manipulation, almindelig React-state/context er det ikke.
  scrollElRef: React.RefObject<HTMLDivElement | null>;
  // v0.31.1 — se usePageScrollLock's doc-kommentar for den fulde
  // fejlsøgningshistorik. En ren boolean-ref (ikke state): touchstart/
  // touchmove-lytterne nedenfor læser den synkront på hver gestus uden at
  // selve effekten (som registrerer lytterne) behøver at gen-køre.
  pullLockedRef: React.RefObject<boolean>;
};
const PullToRefreshSlotContext = createContext<PullToRefreshContextValue>({
  header: null,
  footer: null,
  scrollElRef: { current: null },
  pullLockedRef: { current: false },
});

/**
 * Låser side-scrollen (scrollRef) mens et højreside-panel er åbent — brugt
 * af useSlidePanel.ts (for de "monteres/afmonteres"-paneler) og direkte af
 * de "altid i DOM'en, skifter kun translate-x"-paneler (ClientBoard.tsx,
 * FreelancerBoard.tsx, MessageBoard.tsx: `usePageScrollLock(panelOpen)`).
 *
 * Grunden til dette lag OVENPÅ v0.29.0's overscroll-behavior:contain (se
 * scrollRef's egen doc-kommentar): et panel er et `position: fixed`
 * overlay, der teknisk set stadig er et DOM-efterkommer af scrollRef —
 * overscroll-behavior forhindrer i teorien kædning fra panelets EGEN
 * scroll-boks til scrollRef, men Hjorth oplevede fortsat den samme
 * "frossen ved bunden"-opførsel på flere paneler efter den rettelse.
 *
 * v0.31.1 — FUNDET DEN RIGTIGE ÅRSAG (den forrige CSS-baserede spærring
 * herunder var ikke tilstrækkelig, se hvorfor nedenfor): Hjorths præcise
 * reproduktion (fryser kun på de 3 vagter under DET FØRSTE event i en
 * uscrollet liste, aldrig på en vagt man selv har scrollet ned til; retter
 * sig selv efter at have klikket rundt; vender tilbage efter en frisk
 * app-genstart; kan swipe NED/scrolle ned, men ikke swipe OP/scrolle
 * tilbage op) pegede direkte på selve PullToRefresh-gestussen herunder:
 * `onTouchStart`/`onTouchMove` sidder på scrollRef (den bagvedliggende
 * SIDE, fx "Events & vagter"-listen) og fanger enhver touch, der bobler op
 * fra et efterkommer-element i DOM'et — herunder et `position: fixed`-panel
 * ovenpå, selvom panelet visuelt intet har med siden bagved at gøre.
 * `onTouchStart` starter kun et træk, hvis sidens EGEN `scrollTop <= 0`
 * (`atTop()`) — hvilket er nøjagtig tilstanden når man IKKE selv har
 * scrollet listen (fx det første events vagter, eller en frisk app-start).
 * Når man derefter swiper NEDAD inde i panelet (= scroller panelets
 * indhold TILBAGE OP), tolker den bagvedliggende sides træk-logik det som
 * et pull-to-refresh-forsøg og kalder `e.preventDefault()` på den
 * boblede touch — hvilket forhindrer panelets EGEN native scroll i
 * nogensinde at modtage gestussen. Swipe OPAD (= scroller panelets
 * indhold NED) rammer derimod tidligt `rawDelta <= 0`-grenen, som ALDRIG
 * kalder preventDefault — deraf den asymmetriske "kan scrolle ned, men
 * ikke tilbage op"-symptom. Dette forklarer også hvorfor v0.31.0's
 * CSS-baserede lås (touch-action/overflow) ikke hjalp: `touch-action`
 * styrer kun browserens EGEN native panorering af det element, den sidder
 * på — den stopper ikke JS-lyttere, som allerede selv kalder
 * preventDefault() baseret på scrollTop og bobled touch-koordinater.
 * Den egentlige rettelse er derfor `pullLockedRef` ovenfor: sat direkte af
 * denne hook, tjekket synkront først i `onTouchStart` i selve
 * PullToRefresh-komponenten, så den bagvedliggende sides træk-gestus slet
 * ikke kan starte, mens et panel er åbent — uanset hvor i DOM'et touchen
 * bobler fra. De oprindelige CSS-egenskaber beholdes som et harmløst
 * ekstra lag (forhindrer stadig browserens egen native scroll/bounce på
 * selve scrollRef, hvis noget skulle nå dertil), men er ikke længere den
 * afgørende mekanisme.
 */
export function usePageScrollLock(locked: boolean) {
  const { scrollElRef, pullLockedRef } = useContext(PullToRefreshSlotContext);

  useEffect(() => {
    pullLockedRef.current = locked;
    return () => {
      pullLockedRef.current = false;
    };
  }, [locked, pullLockedRef]);

  useEffect(() => {
    const scrollEl = scrollElRef.current;
    if (!locked || !scrollEl) return;

    const prevOverflow = scrollEl.style.overflow;
    const prevTouchAction = scrollEl.style.touchAction;
    scrollEl.style.overflow = "hidden";
    scrollEl.style.touchAction = "none";

    return () => {
      scrollEl.style.overflow = prevOverflow;
      scrollEl.style.touchAction = prevTouchAction;
    };
  }, [locked, scrollElRef]);
}

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
 * HYBRID-MODEL (v0.27.4, gjort permanent og universel i v0.28.0): browseren
 * styrer ALT scroll-relateret bounce selv (bund-elastik OG et hurtigt swipe
 * der ankommer via momentum, finger allerede løftet) via
 * `overscroll-behavior: auto`. Den ENESTE del vi selv står for er det AKTIVE
 * træk i toppen af indholdet, fordi det er den eneste del der reelt kræver et
 * JS-hook: der findes ingen browser-API til at hooke en "genindlæs"-handling
 * på native overscroll. Det aktiveres udelukkende når `scrollTop <= 0` OG
 * brugeren rent faktisk trækker nedad der.
 *
 * VIGTIGT (v0.28.1 → v0.28.2, se project-memory for hele fejlsøgningen):
 * trækket flytter IKKE noget som helst med en CSS `transform` — hverken
 * scrollRef selv eller en indre wrapper. I stedet er `spinnerWrapRef` en helt
 * almindelig div i starten af det scrollende indhold, hvis HØJDE animeres fra
 * 0 og op under trækket. Da denne gestus kun nogensinde er aktiv mens
 * `scrollTop <= 0` (se `atTop()`), skubber højdevæksten resten af indholdet
 * nedad via helt almindeligt blok-layout, med nøjagtig samme visuelle
 * resultat som en transform ville have givet — men uden at røre en scroll-
 * lag-relateret CSS-egenskab overhovedet. Tidligere (v0.28.1) blev en indre
 * `pullWrapRef` transformeret i stedet for `scrollRef` selv, hvilket løste
 * det oprindelige fryse-problem, men efterlod pull-spinneren usynlig (den var
 * bygget til at blive "afsløret" af at scrollRef flyttede sig, hvilket ikke
 * længere skete) — højde-baseret fortrængning løser begge dele på én gang og
 * er samtidig simplere kode, ikke mere.
 *
 * `overflow-anchor: none` på scrollRef er nødvendig for højde-teknikken:
 * uden den kan browserens "scroll anchoring" (Chrome bl.a.) forsøge at
 * kompensere for indholdsændringer over det synlige område ved selv at
 * justere scrollTop — hvilket ville modarbejde vores bevidste højdevækst.
 *
 * Da INGEN transform længere bruges noget sted i selve trækket, er den
 * tidligere `.sticky`/`.fixed`-modvirkning (se ældre versioner af denne fil)
 * heller ikke længere nødvendig og er fjernet — der er intet at modvirke,
 * når ingenting flytter sig via transform.
 *
 * v0.29.0 — scrollRef's `overscroll-behavior` ændret fra `auto` til
 * `contain`, efter et vedvarende, svært reproducerbart fryse-problem
 * specifikt på Kontakter-siden (fungerede altid fint på Overblik) — appen
 * blev helt uresponsiv over for touch, hvis man scrollede helt til bunds og
 * derefter forsøgte at scrolle længere. Roden er sandsynligvis "scroll
 * chaining": `app/freelancer/layout.tsx`'s ydre `fixed inset-0`-wrapper har
 * (bevidst, som sikkerhedsnet) SIN EGEN `overflow-y-auto` — dvs. der findes
 * teknisk set to indlejrede scroll-containere. `overscroll-behavior: auto`
 * tillader eksplicit at en scroll-gestus "kæder" videre til en forældre-
 * scroll-container, når man rammer sin egen kant — hvis den ydre wrapper på
 * noget tidspunkt har bare ÉN pixel reel (utilsigtet) overflow, fx pga.
 * `100dvh`/viewport-afrundingsfejl (iOS 26 har adskillige dokumenterede,
 * aktive fejl netop her, se project_splash_screen_freelancer_pwa-memory),
 * kunne momentum-scrollet "lække" ind i den ydre container og efterlade
 * WebKit's touch-tilstand i en tilstand der føles fastfrosset. `contain`
 * bevarer den lokale native rubber-band-effekt (bounce ved DENNE boks' egne
 * kanter er uændret), men forhindrer kædning til en forældre-container helt
 * — uden at ændre den ydre wrappers egen `overflow-y-auto` (dens
 * sikkerhedsnet-formål er stadig relevant, og at fjerne den er en større,
 * mere risikabel ændring end nødvendig her). Ikke 100% bekræftet uden en
 * enhed at teste på, men adresserer den mest sandsynlige mekanisme uden at
 * røre position/transform-arkitekturen ovenfor.
 *
 * Header/footer-slots: to ægte DOM-SØSKENDE til scrollRef —
 * `headerSlotRef`/`footerSlotRef` — der slet ikke er en del af den
 * scrollende boks. Sider der har en fast top-bar eller bund-knap
 * (OverviewClient.tsx, KontakterClient.tsx, ShiftRequestDetail.tsx,
 * ColleagueDetail.tsx, ProfileEditForm.tsx) bruger de eksporterede
 * `<PullToRefreshHeader>`/`<PullToRefreshFooter>` i stedet for en
 * `sticky top-0`/`sticky bottom-0`-div — de portalerer (via React's
 * `createPortal`) deres indhold ind i disse slots. Contexten
 * (`PullToRefreshSlotContext`) gør slottets DOM-node tilgængelig for enhver
 * efterkommer i React-træet, uanset hvor dybt nede i `{children}` den sider.
 *
 * Ikon (v0.28.2): spinneren viser IKKE en generisk spinnende cirkel-streg
 * mere, men det samme ikon som sidens eget menupunkt i bund-/sidenavigationen
 * (fx "users" på Kontakter, "layout-dashboard" på Admin Appens Dashboard) —
 * valgt af den app-specifikke wrapper (PullToRefreshWithIcon.tsx for
 * Freelancer Appen, direkte i AdminPullToRefresh.tsx for Admin Appen), som
 * kender den aktuelle rutes menupunkt. Falder tilbage til et almindeligt
 * genindlæsnings-ikon (`DEFAULT_ICON`), hvis siden ikke matcher noget
 * menupunkt (fx underdetaljesider som /vagt/[id]). Ikonet roterer/spinner
 * IKKE — det vises blot statisk, både under selve trækket (med stigende
 * opacity) og mens genindlæsningen står på.
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
  icon = DEFAULT_ICON,
}: {
  children: React.ReactNode;
  /**
   * Admin Appen sætter denne til false på desktop (se AdminPullToRefresh.tsx)
   * — DOM-strukturen forbliver identisk uanset enabled, kun selve
   * touch-lytterne (og dermed træk-for-at-genindlæse) slås fra, så der ikke
   * sker noget layout-hop når enheden afgøres asynkront efter mount.
   */
  enabled?: boolean;
  /**
   * Tabler-ikonnavn (se components/Icon.tsx) vist i pull-spinneren — normalt
   * samme ikon som sidens eget menupunkt, valgt af den kaldende wrapper (se
   * doc-kommentaren ovenfor). Falder tilbage til DEFAULT_ICON ("refresh"),
   * hvis ikke angivet.
   */
  icon?: string;
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
  // Sat af usePageScrollLock (via context) mens et højreside-panel er åbent
  // — se usePageScrollLock's doc-kommentar (v0.31.1) for hvorfor denne
  // ekstra spærring var nødvendig ovenpå CSS-lagene herunder.
  const pullLockedRef = useRef(false);

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
    const spinnerEl = spinnerWrapRef.current;
    if (!spinnerEl) return;

    // Kun spinnerens HØJDE animeres — se doc-kommentaren ovenfor for hvorfor
    // dette (i stedet for en transform) både er nok til at skubbe indholdet
    // nedad OG er det der løste v0.28.1's fryse-fejl for godt.
    const positiveDistance = Math.max(distance, 0);
    spinnerEl.style.transition = `height ${transition}`;
    spinnerEl.style.height = `${positiveDistance}px`;

    if (spinnerIconRef.current) {
      const progress = Math.min(positiveDistance / TRIGGER_DISTANCE, 1);
      spinnerIconRef.current.style.opacity = String(progress);
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    function atTop() {
      return el!.scrollTop <= 0;
    }

    // Det eneste vi selv styrer: et aktivt træk ned, mens indholdet allerede
    // står helt i toppen. Alt andet (bund-elastik, momentum-ankomst i begge
    // ender) er browserens eget native overscroll — se doc-kommentaren
    // ovenfor for hvorfor.
    function onTouchStart(e: TouchEvent) {
      if (refreshing || pullLockedRef.current || !atTop()) {
        draggingRef.current = false;
        return;
      }
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
  }, [refreshing, isPending]);

  // scrollElRef/pullLockedRef er stabile objekter — kun slots (header/
  // footer) skal trigge et nyt context-objekt, når de faktisk ændres.
  const contextValue = useMemo(
    () => ({ ...slots, scrollElRef: scrollRef, pullLockedRef }),
    [slots]
  );

  return (
    <PullToRefreshSlotContext.Provider value={contextValue}>
      {/* min-w-0 (ikke kun min-h-0): harmløst i Freelancer Appens flex-col-
          sammenhæng, men nødvendigt i Admin Appen, hvor denne komponent
          sidder som flex-item ved siden af AdminSidebar i en flex-row (se
          [[feedback_admin_layout_single_scroll_panel]]) — samlet ét sted i
          stedet for at have to divergerende varianter af denne klasse. */}
      <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        {/* Header-slot: ægte DOM-søskende til scrollRef, uden for den
            scrollende boks — se PullToRefreshHeader. Tom når en side ikke
            bruger den (fx sider uden fast top-bar). */}
        <div ref={headerSlotRef} className="relative z-[2] flex-shrink-0" />
        {/* overscroll-contain (IKKE -auto, se v0.29.0-note nedenfor og
            project_pull_to_refresh_freelancer_pwa-memory): lader browserens
            egen native rubber-band styre bund-elastik og momentum-ankomst i
            begge ender ved DENNE boks' egne kanter, men forhindrer at samme
            scroll-gestus "kæder" videre til app/freelancer/layout.tsx's ydre
            fixed-wrapper (som af historiske årsager også selv har
            overflow-y-auto, som sikkerhedsnet — se dens egen doc-kommentar).
            [overflow-anchor:none]: forhindrer browserens "scroll anchoring" i
            at modarbejde spinnerWrapRef's bevidste højdevækst herunder — se
            doc-kommentaren for hele modellen. Denne div får ALDRIG en inline
            transform. */}
        <div
          ref={scrollRef}
          className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain bg-pepo-su [overflow-anchor:none]"
        >
          <div
            ref={spinnerWrapRef}
            className="flex items-center justify-center overflow-hidden"
            style={{ height: 0 }}
          >
            <div ref={spinnerIconRef} style={{ opacity: 0 }}>
              <Icon name={icon} size={22} className="text-pepo-p" />
            </div>
          </div>
          {children}
        </div>
        {/* Bund-slot: samme idé, for en fast bund-knap/handlingsbar — se
            PullToRefreshFooter. */}
        <div ref={footerSlotRef} className="relative z-[2] flex-shrink-0" />
      </div>
    </PullToRefreshSlotContext.Provider>
  );
}

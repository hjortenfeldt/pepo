"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { isMobileDevice } from "@/lib/device-detection";

// Samme tærskler/timing som components/freelancer/PullToRefresh.tsx — se
// den for den fulde begrundelse.
const TRIGGER_DISTANCE = 68;
const MAX_DISTANCE = 120;
const DAMPING = 0.5;
const SPINNER_HEIGHT = 52;
const MIN_REFRESH_VISIBLE_MS = 500;

/**
 * Admin Appens udgave af components/freelancer/PullToRefresh.tsx — erstatter
 * (protected)/layout.tsx's indholds-scrollpanel (se
 * [[feedback_admin_layout_single_scroll_panel]]: layoutet må stadig kun eje
 * ÉT scrollpanel, hvilket denne komponent overtager rollen som, i stedet for
 * at tilføje et ekstra).
 *
 * Touch-lytterne, der driver selve trækket, tilføjes KUN når
 * isMobileDevice() er sand (se lib/device-detection.ts) — en desktop-admin
 * bruger mus/scrollhjul, ikke touch, så der er reelt aldrig nogen
 * touchstart-events at reagere på i forvejen, men vi tjekker eksplicit for
 * at undgå enhver tvivl og for at matche den samme mobil-only-arkitektur som
 * AdminSplashScreen/AdminInstallGate. DOM-strukturen (wrapper/scroll-div) er
 * bevidst IDENTISK uanset mobil/desktop, så der ikke sker noget layout-hop,
 * når enheden afgøres asynkront efter første render.
 */
export default function AdminPullToRefresh({ children }: { children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false);
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

  useEffect(() => {
    Promise.resolve().then(() => setMobile(isMobileDevice()));
  }, []);

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
    if (!mobile) return;
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
  }, [mobile, refreshing]);

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
      <div
        ref={scrollRef}
        className="relative z-[1] h-full overflow-y-auto overscroll-none bg-pepo-su"
      >
        {children}
      </div>
    </div>
  );
}

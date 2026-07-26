"use client";

import { useEffect, useState } from "react";
import { getShiftDetail } from "@/app/freelancer/(protected)/actions";
import ShiftRequestDetail, { type OpenShiftDetail } from "@/components/freelancer/ShiftRequestDetail";
import { useSlidePanel } from "@/components/admin/useSlidePanel";
import Icon from "@/components/Icon";

// Overlay-panel-varianten af Vagtdetaljer, åbnet fra Overblik-sidens "Mine
// vagter"/"Ledige vagter" (OverviewClient.tsx). Bygget som et rigtigt
// full-screen overlay (ikke en sideNavigation til /vagt/[id]) specifikt for
// at kunne garantere at Overblik-siden BAG panelet beholder sin scroll-
// position, mens panelet er åbent — en almindelig router.push() kan ikke
// love det samme på tværs af iOS/PWA (se selve funktionaliteten i
// ShiftRequestDetail.tsx's onChanged/onClose-håndtering + OverviewClient.tsx's
// flashShift, som kører EFTER panelet er lukket igen).
//
// Genbruger admin-systemets useSlidePanel (cross-import, samme retning som
// admin allerede låner usePageScrollLock den anden vej fra
// components/freelancer/PullToRefresh.tsx) for slide-animation +
// scroll-lock af siden bagved, mens panelet er åbent.
export default function ShiftDetailPanel({
  shiftId,
  onClose,
  onChanged,
}: {
  shiftId: string;
  onClose: () => void;
  /** Videresendes til ShiftRequestDetail, som kalder den lige inden panelet
   * lukker sig selv efter en vellykket handling — se OverviewClient.tsx's
   * flashShift for hvad der sker med den (amber-blink på kortet). */
  onChanged: (shiftId: string) => void;
}) {
  const { visible, close } = useSlidePanel(onClose);

  return (
    <>
      <div
        className={
          "fixed inset-0 bg-[#1D1D1F]/30 transition-opacity duration-200 z-10 " +
          (visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={close}
      />
      <div
        className={
          "fixed inset-0 bg-pepo-su transition-transform duration-200 z-20 flex flex-col " +
          // Ingen "translate-x-0" i synlig tilstand — se
          // [[feedback_slide_panel_native_picker_bug]] for hvorfor.
          (visible ? "" : "translate-x-full")
        }
      >
        {/* key={shiftId} tvinger et rent remount, hver gang der åbnes en ny
            vagt i panelet — så starttilstanden altid er "loading" for netop
            DEN vagt, uden at skulle nulstille state synkront inde i en
            effect (som ellers ville udløse react-hooks/set-state-in-effect,
            og kortvarigt kunne vise DEN FORRIGE vagts data, mens den nye
            hentes). */}
        <ShiftDetailPanelBody key={shiftId} shiftId={shiftId} onClose={close} onChanged={onChanged} />
      </div>
    </>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "loaded"; detail: OpenShiftDetail };

function ShiftDetailPanelBody({
  shiftId,
  onClose,
  onChanged,
}: {
  shiftId: string;
  onClose: () => void;
  onChanged: (shiftId: string) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getShiftDetail(shiftId).then((result) => {
      if (cancelled) return;
      setState(result ? { status: "loaded", detail: result } : { status: "not-found" });
    });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  if (state.status === "loaded") {
    return <ShiftRequestDetail shift={state.detail} onClose={onClose} onChanged={onChanged} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="z-10 bg-pepo-wh px-4 py-3 border-b border-pepo-bd flex items-center flex-shrink-0">
        <button type="button" onClick={onClose} className="flex items-center gap-2 text-pepo-t1 -ml-1 px-1 py-0.5">
          <Icon name="arrow-left" size={18} />
          <span className="text-[14px] font-medium">Vagtdetaljer</span>
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-[var(--page-px)] text-center text-[13px] text-pepo-t3">
        {state.status === "loading" ? "Indlæser..." : "Vagten findes ikke længere."}
      </div>
    </div>
  );
}

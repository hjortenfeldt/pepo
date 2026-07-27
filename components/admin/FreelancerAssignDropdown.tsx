"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { FreelancerOption, ShiftInterestItem } from "@/lib/admin-types";
import { ageFromBirthDate } from "@/lib/format";

// Samler "Tildelt"/"Frigiv vagt", "Anmodet"-listen og "Tildel manuelt"-
// selecten (se tidligere ShiftDetailPanel.tsx) i ét overlay-menu-drevet
// dropdown — ikke en native <select>, men samme visuelle mønster som
// AdminTopBar.tsx's bruger-/hovedmenu (relativ trigger + absolut panel med
// afrunding/skygge), blot med et scrollbart, kapslet listevindue (se
// AdminTopBar's mobilnav for samme max-height+overflow-mønster).
//
// Triggeren (lukket tilstand) og hver række i den åbne liste deler samme
// visuelle opbygning (avatar/ikon + navn + evt. mærkater) via RowAvatar/
// RowBadges nedenfor — den valgte freelancer skal se identisk ud, uanset om
// den vises lukket eller inde i selve listen.
//
// [[project_unified_assign_dropdown]] for baggrund/beslutninger.
export type FreelancerBadgeKind = "anmodet" | "til-salg" | "utilgaengelig";

const BADGE_LABEL: Record<FreelancerBadgeKind, string> = {
  anmodet: "Anmodet",
  "til-salg": "Til salg",
  utilgaengelig: "Utilgængelig",
};

const BADGE_CLASS: Record<FreelancerBadgeKind, string> = {
  anmodet: "bg-[#EAF6EE] text-[#1A7A34]",
  "til-salg": "bg-[#FEF3E2] text-[#9A5F00]",
  utilgaengelig: "bg-[#FDECEA] text-[#C0021A]",
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// null = "Ledig vagt" — rødt spørgsmålstegn-ikon i stedet for et
// initial-badge, samme røde farve som "Mangler"-status andre steder i
// systemet (fx ShiftBoard.tsx's STATUS_BADGE_CLASS.open). 36px (ikke 30px)
// for at matche navnet+alder/jobfunktion-tolinjers-blokken ved siden af,
// samme størrelse som listevisningen på "Freelancere"-siden
// (FreelancerBoard.tsx's w-9 h-9).
function RowAvatar({ freelancerId, name }: { freelancerId: string | null; name: string }) {
  if (freelancerId === null) {
    return (
      <div className="w-9 h-9 rounded-full bg-[#FDECEA] text-[#C0021A] flex items-center justify-center flex-shrink-0">
        <Icon name="question-mark" size={18} />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p text-xs font-medium flex items-center justify-center flex-shrink-0">
      {initials(name)}
    </div>
  );
}

// Navn(+alder) på øverste linje, jobfunktion nedenunder — samme
// tekst-opbygning som "Freelancere"-sidens grid-/listevisning
// (FreelancerBoard.tsx: navn+"(alder)" øverst, en info-linje nedenunder),
// blot med jobfunktionen for DENNE vagt i stedet for lokation, da alle
// rækker i dropdownet uundgåeligt har samme jobfunktion (listen er jo
// allerede filtreret til den). "Ledig vagt" er ikke en rigtig person og får
// derfor ingen alder/jobfunktion-linje.
function RowNameBlock({
  freelancerId,
  name,
  age,
  categoryName,
}: {
  freelancerId: string | null;
  name: string;
  age: number | null;
  categoryName: string;
}) {
  if (freelancerId === null) {
    return <span className="text-[13.5px] font-medium text-pepo-t1 flex-1 text-left truncate">Ledig vagt</span>;
  }
  return (
    <div className="flex-1 min-w-0 text-left">
      <div className="text-[13.5px] font-medium text-pepo-t1 truncate">
        {name}
        {age !== null && <span className="text-pepo-t2 font-normal"> ({age})</span>}
      </div>
      <div className="text-xs text-pepo-t2 truncate">{categoryName}</div>
    </div>
  );
}

function RowBadges({ badges }: { badges: FreelancerBadgeKind[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {badges.map((b) => (
        <span key={b} className={"rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " + BADGE_CLASS[b]}>
          {BADGE_LABEL[b]}
        </span>
      ))}
    </div>
  );
}

export default function FreelancerAssignDropdown({
  freelancers,
  selectedFreelancerId,
  selectedFreelancerName,
  selectedFreelancerBirthDate,
  categoryName,
  currentlyAssignedFreelancerId,
  interests,
  isForResale,
  conflictFreelancerIds,
  onSelect,
  disabled,
}: {
  /** Allerede filtreret til den (evt. lige nu redigerede) jobfunktion. */
  freelancers: FreelancerOption[];
  /** Den lokale, endnu ikke gemte valgte værdi (styrer trigger + checkmark) —
   * ikke nødvendigvis det samme som currentlyAssignedFreelancerId, hvis
   * admin har valgt en anden freelancer men endnu ikke trykket "Gem
   * ændringer". */
  selectedFreelancerId: string | null;
  selectedFreelancerName: string | null;
  /** Slås op af kalderen fra DEN FULDE freelancerliste (ikke kun `freelancers`
   * ovenfor), så alder stadig vises i triggeren selvom den valgte person er
   * blevet filtreret ud af listen (fx fordi jobfunktionen på vagten lige er
   * ændret til noget personen ikke selv har). */
  selectedFreelancerBirthDate: string | null;
  /** Jobfunktionen DENNE vagt/række har — vist som info-linje under hvert
   * navn i listen (alle rækker viser samme jobfunktion, se
   * RowNameBlock-kommentaren ovenfor). */
  categoryName: string;
  /** Den faktisk GEMTE tildeling i databasen — bruges KUN til at afgøre
   * hvis navn "Til salg"-mærkatet skal stå ved (sælgeren af en for_resale-
   * vagt ændrer sig ikke bare fordi admin midlertidigt overvejer en anden i
   * dropdownet). null hvis vagten (endnu) ikke findes, fx i
   * ShiftWizardPanel.tsx, hvor isForResale altid er false alligevel. */
  currentlyAssignedFreelancerId: string | null;
  /** Tom for en vagt der endnu ikke er oprettet (kan ikke have anmodninger). */
  interests: ShiftInterestItem[];
  /** Sat hvis DENNE vagt selv har status "for_resale". */
  isForResale: boolean;
  conflictFreelancerIds: Set<string>;
  /** null = "Ledig vagt" valgt (frigiv/lad stå ledig). */
  onSelect: (freelancerId: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // KUN "pending" tæller som en levende anmodning, der skal vise
  // "Anmodet"-mærkatet — en "accepted" række betyder freelanceren ER (eller
  // var) den tildelte for DENNE vagt (se assignFreelancer/releaseShift i
  // actions.ts), ikke en kandidat der venter på svar. Uden dette filter
  // kunne en forældet/uafklaret "accepted"-række (fx fra en freelancer der
  // ikke længere har vagtens jobfunktion, så de slet ikke vises i listen
  // nedenfor) tælle med i "X anmodninger" uden at der reelt var et
  // synligt mærkat at pege på — set og rapporteret af Hjorth 2026-07-27.
  const interestedIds = new Set(interests.filter((i) => i.status === "pending").map((i) => i.freelancerId));

  function badgesFor(freelancerId: string): FreelancerBadgeKind[] {
    const badges: FreelancerBadgeKind[] = [];
    if (interestedIds.has(freelancerId)) badges.push("anmodet");
    if (isForResale && freelancerId === currentlyAssignedFreelancerId) badges.push("til-salg");
    if (conflictFreelancerIds.has(freelancerId)) badges.push("utilgaengelig");
    return badges;
  }

  function select(freelancerId: string | null) {
    setOpen(false);
    onSelect(freelancerId);
  }

  // Talt ud fra de FREELANCERE DER RENT FAKTISK VISES (allerede filtreret
  // til vagtens jobfunktion), ikke rå `interests.length` — garanterer at
  // tallet altid matcher antallet af synlige "Anmodet"-mærkater i listen
  // nedenfor, uanset forældede/ikke-matchende anmodningsrækker i
  // databasen (samme baggrund som interestedIds-kommentaren ovenfor).
  const requestCount = freelancers.filter((f) => interestedIds.has(f.id)).length;
  const selectedBadges = selectedFreelancerId ? badgesFor(selectedFreelancerId) : [];

  return (
    <div>
      <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Tildel vagt</div>

      <div className="relative" ref={wrapperRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          className="w-full flex items-center gap-2.5 border border-pepo-bds rounded-[10px] px-2.5 py-2 text-left bg-pepo-wh disabled:opacity-50"
        >
          <RowAvatar freelancerId={selectedFreelancerId} name={selectedFreelancerName ?? ""} />
          <RowNameBlock
            freelancerId={selectedFreelancerId}
            name={selectedFreelancerName ?? ""}
            age={ageFromBirthDate(selectedFreelancerBirthDate)}
            categoryName={categoryName}
          />
          <RowBadges badges={selectedBadges} />
          <Icon
            name="chevron-down"
            size={18}
            className={"text-pepo-t2 flex-shrink-0 transition-transform " + (open ? "rotate-180" : "")}
          />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] bg-pepo-wh rounded-[14px] shadow-[0_12px_40px_rgba(29,29,31,0.18)] p-1.5 z-30 max-h-[280px] overflow-y-auto overscroll-contain">
            <button
              type="button"
              onClick={() => select(null)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] hover:bg-pepo-su transition-colors"
            >
              <RowAvatar freelancerId={null} name="" />
              <RowNameBlock freelancerId={null} name="" age={null} categoryName={categoryName} />
              {selectedFreelancerId === null && <Icon name="check" size={16} className="text-pepo-p flex-shrink-0" />}
            </button>

            {freelancers.length > 0 && <div className="h-px bg-pepo-bd my-1" />}

            {freelancers.length === 0 && (
              <div className="px-2.5 py-2 text-[12.5px] text-pepo-t3">Ingen godkendte freelancere i denne jobfunktion.</div>
            )}

            {freelancers.map((f) => {
              const badges = badgesFor(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => select(f.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] hover:bg-pepo-su transition-colors"
                >
                  <RowAvatar freelancerId={f.id} name={f.fullName} />
                  <RowNameBlock
                    freelancerId={f.id}
                    name={f.fullName}
                    age={ageFromBirthDate(f.birthDate)}
                    categoryName={categoryName}
                  />
                  <RowBadges badges={badges} />
                  {f.id === selectedFreelancerId && <Icon name="check" size={16} className="text-pepo-p flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {requestCount > 0 && (
        <div className="text-[12px] text-pepo-t2 mt-1.5">
          {requestCount} {requestCount === 1 ? "anmodning" : "anmodninger"}
        </div>
      )}
    </div>
  );
}

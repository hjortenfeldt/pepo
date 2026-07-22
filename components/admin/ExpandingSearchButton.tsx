"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

const MAX_WIDTH = 300;
const RIGHT_MARGIN = 16;
const MIN_WIDTH = 120;

/**
 * Delt "søgeikon der folder sig ud til et søgefelt"-idiom, brugt i
 * header-rækken på Events & vagter, Freelancere, Kunder og Beskeder.
 *
 * Var tidligere kopieret ind separat i hvert board med bredden klemt via en
 * GÆTTET Tailwind-arbitrary-value: w-[min(300px,calc(100vw-96px))]. Det gæt
 * antog samme afstand fra skærmens venstrekant på alle fire boards, men
 * Events & vagter/Freelancere/Kunder har en liste/kort-toggle FØR
 * søgeknappen (Beskeder har ikke), så den reelle afstand var større end
 * 96px der — boksen løb derfor stadig ud over højrekanten på mobil
 * (rapporteret af Hjorth to gange nu). Denne udgave MÅLER i stedet
 * søgeknappens faktiske position på skærmen ved åbning (samme teknik som
 * CategoryList.tsx's ikon-vælger-popup bruger til sin egen positionering),
 * så boksen altid passer — uanset hvad der står før den i rækken, og uden
 * at skulle genudregnes i hånden hvis rækken ændrer sig senere.
 */
export default function ExpandingSearchButton({
  open,
  onOpenChange,
  value,
  onValueChange,
  placeholder = "Søg...",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [maxWidth, setMaxWidth] = useState(MAX_WIDTH);

  useEffect(() => {
    if (!open) return;

    function measure() {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMaxWidth(Math.max(MIN_WIDTH, window.innerWidth - rect.left - RIGHT_MARGIN));
    }

    measure();
    inputRef.current?.focus();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  function close() {
    onValueChange("");
    onOpenChange(false);
  }

  return (
    <div ref={wrapperRef} className="relative w-[38px] h-[38px] flex-shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="Søg"
        className="w-[38px] h-[38px] rounded-[9px] border border-pepo-bds bg-pepo-wh text-pepo-t2 flex items-center justify-center hover:bg-pepo-su"
      >
        <Icon name="search" size={20} />
      </button>
      <div
        className={
          "absolute top-0 left-0 h-[38px] overflow-hidden border rounded-[9px] bg-pepo-wh transition-[width] duration-150 ease-out z-[5] " +
          (open
            ? "border-pepo-bds opacity-100 pointer-events-auto"
            : "w-0 border-transparent opacity-0 pointer-events-none")
        }
        style={{ width: open ? Math.min(MAX_WIDTH, maxWidth) : 0 }}
      >
        <Icon
          name="search"
          size={19}
          className="absolute left-[11px] top-1/2 -translate-y-1/2 text-pepo-t3 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-full border-none outline-none px-[34px] text-[13.5px] bg-transparent"
        />
        <div
          onClick={close}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-[6px] flex items-center justify-center cursor-pointer text-pepo-t3 hover:bg-pepo-su hover:text-pepo-t1"
        >
          <Icon name="x" size={20} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { parseTimeInput } from "@/lib/format";

// Datofelt: almindelig, synlig native <input type="date"> — samme mønster
// som "Fødselsdato" på "Opret freelancer"-siden (FreelancerBoard.tsx).
//
// Havde tidligere en dansk-formateret tekst-visning ovenpå en usynlig,
// fuldt udstrakt native date-input (opacity-0, inset-0), for at vise en
// pænere dato-tekst end browserens egen. Det så rigtigt ud, men var reelt i
// stykker i Chrome: et <input type="date"> åbner kun kalender-vælgeren ved
// klik på selve kalender-ikonet i input'ets skygge-DOM, ikke ved klik på
// dato-segmenterne (dag/måned/år) — og når input'et strækkes til at dække
// hele feltet, havner det usynlige kalender-ikon helt ude i højre side,
// mens resten af feltet kun "fokuserer" et usynligt tekst-segment uden at
// åbne noget. Deraf buggen: kun et klik helt ude i højre side virkede.
// Løsningen er at droppe overlay-tricket og vise input'et direkte, ligesom
// Fødselsdato — mister den pæne "9. juli 2026"-formatering til fordel for
// browserens egen (fx "dd/mm/åååå"), men er faktisk klikbart alle steder.
export function DateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="date"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p disabled:bg-pepo-su disabled:text-pepo-t2"
    />
  );
}

// Tidsfelt: fritekst der fortolkes til "HH:MM" ved blur, matcher prototypens
// formatTimeInput()-adfærd (kan taste "23", "930", "23:15" osv.).
export function TimeField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  // Vist gråt i feltet, når value er tom — bruges af "Stemplet ind"/
  // "Stemplet ud" i ShiftDetailPanel.tsx til "Mangler"/"Vagt i gang".
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={5}
      autoComplete="off"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseTimeInput(text);
        const final = parsed ?? "";
        setText(final);
        setSynced(final);
        onChange(final);
      }}
      className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p disabled:bg-pepo-su disabled:text-pepo-t2 placeholder:text-pepo-t3"
    />
  );
}

"use client";

import { useRef, useState } from "react";
import { formatEventDate, parseTimeInput } from "@/lib/format";

// Datofelt: en tekst vi selv formaterer på dansk ligger ovenpå en usynlig
// native date-input — klik/tastatur åbner stadig browserens indbyggede
// kalender-picker. Matcher prototypens .date-field-wrap/.date-display-mønster.
export function DateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <div
        className={
          "border rounded-[9px] px-3 py-2.5 text-[13.5px] " +
          (disabled ? "bg-pepo-su text-pepo-t2 border-pepo-bds" : "bg-pepo-wh border-pepo-bds " + (value ? "text-pepo-t1" : "text-pepo-t3"))
        }
      >
        {value ? formatEventDate(value) : "Vælg en dato"}
      </div>
      <input
        ref={inputRef}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
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

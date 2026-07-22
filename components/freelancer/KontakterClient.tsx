"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type { CompanyColleague } from "@/lib/freelancer";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default function KontakterClient({
  colleagues,
  currentUserId,
}: {
  colleagues: CompanyColleague[];
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");

  // Grupperer efter FØRSTE BOGSTAV I FORNAVNET (ikke efternavn) — matcher
  // hvordan navnene faktisk er sorteret i det referencescreenshot Hjorth
  // sendte. Bogstaver uden nogen matchende kolleger optræder aldrig i
  // Map'en, så deres overskrift automatisk ikke vises (i stedet for at
  // vise en tom sektion).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? colleagues.filter((c) => c.full_name.toLowerCase().includes(q)) : colleagues;

    const sorted = [...filtered].sort((a, b) => a.full_name.localeCompare(b.full_name, "da"));

    const map = new Map<string, CompanyColleague[]>();
    for (const person of sorted) {
      const letter = (person.full_name.trim()[0] ?? "#").toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(person);
    }
    return Array.from(map.entries());
  }, [colleagues, query]);

  return (
    <div className="pb-6">
      {/* sticky, samme mønster som Overblik-sidens header (se
          OverviewClient.tsx) — låser sig kun fast i toppen af layoutets
          egen scroll-container, ikke i hele viewporten. */}
      <div className="sticky top-0 z-10 bg-pepo-su px-5 pt-4 pb-3 border-b border-pepo-bd pepo-rise">
        <div className="text-[20px] font-bold text-pepo-t1 mb-3">Kontakter</div>
        <div className="flex items-center gap-2 bg-pepo-wh border border-pepo-bd rounded-[10px] px-3 py-2.5">
          <Icon name="search" size={16} className="text-pepo-t3 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søg"
            className="flex-1 bg-transparent text-[14px] text-pepo-t1 placeholder:text-pepo-t3 outline-none min-w-0"
          />
        </div>
      </div>

      <div className="px-5">
        {colleagues.length === 0 ? (
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 text-center text-[13px] text-pepo-t3 mt-4">
            Ingen kolleger fundet endnu.
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 text-center text-[13px] text-pepo-t3 mt-4">
            Ingen kolleger matcher &quot;{query}&quot;.
          </div>
        ) : (
          groups.map(([letter, people]) => (
            <div key={letter}>
              <div className="text-[11.5px] font-semibold text-pepo-t3 uppercase tracking-wide pt-4 pb-1.5">
                {letter}
              </div>
              <div className="flex flex-col">
                {people.map((person) => (
                  <Link
                    key={person.id}
                    href={`/kontakter/${person.id}`}
                    className="flex items-center gap-3 py-2.5 border-b border-pepo-bd last:border-b-0 active:opacity-70 transition-opacity"
                  >
                    <div className="w-10 h-10 rounded-full bg-pepo-pl text-pepo-p text-[13px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
                      {person.profile_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={person.profile_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        initials(person.full_name)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-medium text-pepo-t1 truncate">
                        {person.full_name}
                        {person.id === currentUserId && (
                          <span className="text-pepo-t3 font-normal"> (dig)</span>
                        )}
                      </div>
                      {person.category_names[0] && (
                        <div className="text-[12px] text-pepo-t2 truncate">{person.category_names[0]}</div>
                      )}
                    </div>
                    <Icon name="chevron-right" size={24} className="text-pepo-t2 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

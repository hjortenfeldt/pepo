"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { setActiveProfile } from "@/app/freelancer/(protected)/mere/actions";
import type { ActiveProfile } from "@/lib/freelancer";

/**
 * Kun vist på "Mere" hvis freelanceren er godkendt hos mere end én
 * virksomhed (se kaldestedet i mere/page.tsx) — for de fleste freelancere,
 * der kun arbejder ét sted, ville en skifte-mulighed med kun ét valg bare
 * være støj. Toppens firmalogo/-navn på Overblik forbliver bevidst
 * read-only og afspejler blot hvad der vælges her.
 *
 * Vælger man en anden virksomhed, skifter appen reelt til en HELT ANDEN
 * profil (eget navn, billede osv. for den virksomhed) — se
 * setActiveProfile, som gemmer profilens id, ikke bare virksomhedens.
 */
export default function CompanySwitcher({
  profiles,
  activeProfileId,
}: {
  profiles: ActiveProfile[];
  activeProfileId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState(activeProfileId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = profiles.find((p) => p.id === selectedId) ?? profiles[0];

  function handleSelect(profileId: string) {
    if (profileId === selectedId) {
      setExpanded(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await setActiveProfile(profileId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSelectedId(profileId);
      setExpanded(false);
    });
  }

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] mt-4 pepo-rise overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className="w-9 h-9 rounded-[9px] bg-pepo-su border border-pepo-bd flex items-center justify-center overflow-hidden flex-shrink-0">
          {active?.company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.company.logo_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <Icon name="building-store" size={16} className="text-pepo-t3" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-pepo-t3 uppercase tracking-wide">Arbejdsplads</div>
          <div className="text-[13.5px] font-medium text-pepo-t1 truncate">{active?.company.name}</div>
        </div>
        {isPending ? (
          <div className="w-4 h-4 rounded-full border-2 border-pepo-bd border-t-pepo-p animate-spin flex-shrink-0" />
        ) : (
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} className="text-pepo-t3 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-pepo-bd divide-y divide-pepo-bd">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={isPending}
              onClick={() => handleSelect(p.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:opacity-50 active:bg-pepo-su transition-colors"
            >
              <div className="w-7 h-7 rounded-[8px] bg-pepo-su border border-pepo-bd flex items-center justify-center overflow-hidden flex-shrink-0">
                {p.company.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.company.logo_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Icon name="building-store" size={14} className="text-pepo-t3" />
                )}
              </div>
              <span className="flex-1 text-[13.5px] text-pepo-t1 truncate">{p.company.name}</span>
              {p.id === selectedId && <Icon name="check" size={16} className="text-pepo-p flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {error && <p className="px-4 pb-3 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

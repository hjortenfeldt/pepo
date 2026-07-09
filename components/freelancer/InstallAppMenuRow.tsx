"use client";

import Icon from "@/components/Icon";
import { DISMISS_KEY } from "./InstallGate";

/**
 * Menu-række under Mere-siden, så en freelancer der har trykket "Fortsæt
 * uden at installere" (eller en admin der tester) selv kan genkalde
 * "installér som app"-guiden, uden at skulle rydde browserens webstedsdata.
 * Rydder blot dismiss-flaget og genindlæser siden — InstallGate afgør resten
 * ud fra standalone-status, ligesom ved første besøg.
 */
export default function InstallAppMenuRow() {
  function handleClick() {
    window.localStorage.removeItem(DISMISS_KEY);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-[13.5px] text-pepo-t1 text-left"
    >
      <Icon name="download" size={18} className="text-pepo-t2" />
      <span className="flex-1">Installér Pepo App&apos;en</span>
      <Icon name="chevron-right" size={16} className="text-pepo-t3" />
    </button>
  );
}

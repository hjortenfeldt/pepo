"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { isMobileDevice } from "@/lib/device-detection";
import { ADMIN_DISMISS_KEY } from "./AdminInstallGate";

/**
 * Admin Appens udgave af components/freelancer/InstallAppMenuRow.tsx — lader
 * en admin, der tidligere har trykket "Fortsæt uden at installere" (eller en
 * ny admin, der bare vil have guiden frem igen), genkalde "installér som
 * app"-guiden fra Profil-siden uden at skulle rydde browserens webstedsdata.
 *
 * Vist KUN på mobil/tablet (se lib/device-detection.ts) — på desktop ville
 * rækken bare genindlæse siden uden at vise noget, fordi AdminInstallGate.tsx
 * selv er mobil-only-gate'et, og en desktop-admin har ingen brug for en
 * hjemmeskærm-installation. Renderes derfor som null indtil enheden er
 * afgjort på klienten (undgår desktop-flash), i stedet for at skjule det via
 * CSS — dette er sikkert, fordi Profil-siden i øvrigt ikke afhænger af
 * layout-forskydning.
 */
export default function AdminInstallMenuRow() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setMobile(isMobileDevice()));
  }, []);

  if (!mobile) return null;

  function handleClick() {
    window.localStorage.removeItem(ADMIN_DISMISS_KEY);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-5 py-4 text-[13.5px] text-pepo-t1 text-left"
    >
      <Icon name="download" size={22} className="text-pepo-t2" />
      <span className="flex-1">Installér Admin Appen</span>
      <Icon name="chevron-right" size={24} className="text-pepo-t2" />
    </button>
  );
}

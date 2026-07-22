"use client";

import { useEffect, useState } from "react";
import { isMobileDevice } from "@/lib/device-detection";
import AdminInstallMenuRow from "./AdminInstallMenuRow";
import AdminPushToggle from "./AdminPushToggle";

/**
 * "Admin Appen"-sektionen på Profil-siden.
 *
 * AdminPushToggle vises altid (både mobil og desktop) — web push virker
 * fint i en almindelig desktop-browserfane, så en desktop-admin kan sagtens
 * have gavn af den, uden nogensinde at møde den afbrydende AdminPushGate
 * (som til gengæld ER mobil-only, se AdminPushGate.tsx).
 *
 * "Installér Admin Appen"-gruppen derimod er KUN relevant på mobil/tablet
 * (se lib/device-detection.ts) — en desktop-admin har ingen brug for en
 * hjemmeskærm-installation af systemet, de bruger det jo allerede direkte i
 * browseren som deres primære, daglige arbejdsredskab. Gruppen (inkl. sin
 * egen "Admin Appen"-overskrift) skjules derfor helt på desktop, i stedet
 * for evt. at vises tomt/gråt ud. Se [[project_admin_appen_pwa_parity]].
 */
export default function AdminAppSection() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setMobile(isMobileDevice()));
  }, []);

  return (
    <div className="px-8 pb-10 -mt-6 max-w-2xl flex flex-col gap-4">
      <AdminPushToggle />

      {mobile && (
        <div>
          <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">
            Admin Appen
          </div>
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] divide-y divide-pepo-bd overflow-hidden">
            <AdminInstallMenuRow />
          </div>
        </div>
      )}
    </div>
  );
}

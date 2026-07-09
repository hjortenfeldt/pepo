"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { APP_VERSION } from "@/lib/version";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

/**
 * Fælles top-bar for hele tenant-adminsystemet — spænder 100% af bredden
 * hen over både venstremenu og indhold (se layout.tsx), sticky/altid
 * synlig, med en let skygge der kastes ned på begge dele. Erstatter det
 * logo/version/bruger-footer der tidligere sad nederst i AdminSidebar.tsx.
 */
export default function AdminTopBar({
  name,
  companyName,
  profileImageUrl,
  onLogout,
  roleLabel = "admin",
  profileHref = "/profile",
}: {
  name: string;
  onLogout: () => Promise<void>;
  companyName?: string;
  profileImageUrl?: string | null;
  /** "admin" på et virksomheds-subdomæne, "superadmin" på admin.pepo.team. */
  roleLabel?: string;
  profileHref?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmingLogout(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  async function confirmLogout() {
    setIsLoggingOut(true);
    await onLogout();
  }

  return (
    <div className="h-16 flex-shrink-0 bg-pepo-wh flex items-center justify-between px-5 shadow-[0_2px_10px_rgba(29,29,31,0.06)] z-20 relative">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pepo-logo.svg" alt="Pepo" className="w-8 h-8 flex-shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight text-pepo-t1">
            {companyName ?? "pepo"} <span className="text-pepo-t3 font-normal">{roleLabel}</span>
          </span>
          <span className="text-[10px] text-pepo-t3">v{APP_VERSION}</span>
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-[9px] px-2 py-1.5 rounded-lg hover:bg-pepo-su transition-colors"
        >
          <div className="w-[30px] h-[30px] rounded-full bg-pepo-pl text-pepo-p text-xs font-medium flex items-center justify-center flex-shrink-0 overflow-hidden">
            {profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initials(name)
            )}
          </div>
          <div className="min-w-0 text-left">
            {companyName && (
              <div className="text-[10px] font-medium text-pepo-t3 uppercase tracking-wide truncate">
                {companyName}
              </div>
            )}
            <div className="text-[12.5px] font-medium text-pepo-t1 truncate">{name}</div>
          </div>
          <Icon name="chevron-down" size={16} className="text-pepo-t3 flex-shrink-0" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] w-[240px] bg-pepo-wh rounded-[14px] shadow-[0_12px_40px_rgba(29,29,31,0.18)] p-1.5 z-50">
            {confirmingLogout ? (
              <div className="p-2.5">
                <div className="text-[12.5px] text-pepo-t1 mb-3">Er du sikker på, at du vil logge ud?</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={confirmLogout}
                    disabled={isLoggingOut}
                    className="flex-1 h-9 rounded-[8px] text-[12.5px] font-medium bg-[#C0021A] text-white disabled:opacity-40"
                  >
                    {isLoggingOut ? "Logger ud..." : "Ja, log ud"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingLogout(false)}
                    disabled={isLoggingOut}
                    className="flex-1 h-9 rounded-[8px] text-[12.5px] font-medium border border-pepo-bds text-pepo-t1 hover:bg-pepo-su transition-colors"
                  >
                    Fortryd
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link
                  href={profileHref}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-[13px] font-medium text-pepo-t1 hover:bg-pepo-su transition-colors"
                >
                  <Icon name="user-circle" size={18} className="text-pepo-t2" />
                  Profiloplysninger
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmingLogout(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-[13px] font-medium text-[#C0021A] hover:bg-[#FDECEA] transition-colors"
                >
                  <Icon name="logout" size={18} />
                  Log ud
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

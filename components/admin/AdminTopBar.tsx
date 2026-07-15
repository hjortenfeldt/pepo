"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { APP_VERSION } from "@/lib/version";
import { MobileNavCloseContext } from "./AdminSidebar";

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
  mobileNav,
}: {
  name: string;
  onLogout: () => Promise<void>;
  companyName?: string;
  profileImageUrl?: string | null;
  /** "admin" på et virksomheds-subdomæne, "superadmin" på admin.pepo.team. */
  roleLabel?: string;
  profileHref?: string;
  /**
   * Kun sat af tenant-admin-layoutet (se app/tenant/(protected)/layout.tsx),
   * som har en venstremenu at folde ind i et burger-ikon under "lg"
   * (1024px). Superadmin-layoutet har ingen sidebar og sætter derfor ikke
   * denne prop — så vises logo/version-blokken altid, uden burger-ikon, som
   * før.
   *
   * Bevidst et FÆRDIGRENDERET React-element (`<AdminNavLinks/>`), ikke en
   * funktion — layout.tsx er en Server Component, og en funktions-prop til
   * en Client Component kan ikke serialiseres over den grænse (crashede
   * hele tenant-adminsystemet i produktion første gang, se
   * [[feedback_admin_mobile_nav]]). "Luk menuen ved klik"-adfærden går i
   * stedet gennem MobileNavCloseContext, som sættes lige nedenfor og læses
   * af AdminNavLinks — begge ender af den forbindelse er client-side.
   */
  mobileNav?: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

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

  // Samme mønster som ovenfor, men for burger-menuen — se
  // [[feedback_admin_mobile_nav]] for hvorfor de er to uafhængige
  // stater/refs i stedet for én delt, selvom de aldrig skal kunne være
  // åbne samtidig (toggleUserMenu/toggleMobileMenu nedenfor lukker altid
  // den anden, når man åbner den ene).
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [mobileMenuOpen]);

  async function confirmLogout() {
    setIsLoggingOut(true);
    await onLogout();
  }

  function toggleUserMenu() {
    setMobileMenuOpen(false);
    setMenuOpen((v) => !v);
  }

  function toggleMobileMenu() {
    setMenuOpen(false);
    setConfirmingLogout(false);
    setMobileMenuOpen((v) => !v);
  }

  // Samme logo/virksomhedsnavn/version-blok bruges to steder: altid synlig
  // (skrivebord, eller superadmin uden burger-menu), og gengivet igen
  // ovenpå i den mobile fold-ud-menu (se `mobileNav`-blokken nedenfor) —
  // derfor er den sin egen lille variabel i stedet for duplikeret JSX.
  const brand = (
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
  );

  return (
    <div className="h-16 flex-shrink-0 bg-pepo-wh flex items-center justify-between px-5 shadow-[0_2px_10px_rgba(29,29,31,0.06)] z-20 relative">
      {mobileNav ? (
        <>
          {/* Skrivebord (≥1024px): logo/version-blokken som altid. */}
          <div className="hidden lg:flex">{brand}</div>

          {/* Mobil (<1024px): burger-ikon erstatter logo/version-blokken —
              selve blokken flytter op i toppen af fold-ud-menuen nedenfor. */}
          <div className="relative lg:hidden" ref={mobileMenuRef}>
            <button
              type="button"
              onClick={toggleMobileMenu}
              aria-label="Åbn menu"
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-pepo-su transition-colors"
            >
              <Icon name="menu-2" size={24} className="text-pepo-t1" />
            </button>

            {mobileMenuOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] w-[280px] max-w-[85vw] bg-pepo-wh rounded-[14px] shadow-[0_12px_40px_rgba(29,29,31,0.18)] p-1.5 z-50">
                <div className="px-2.5 py-2 mb-1 border-b border-pepo-bd">{brand}</div>
                <div className="max-h-[65vh] overflow-y-auto">
                  <MobileNavCloseContext.Provider value={() => setMobileMenuOpen(false)}>
                    {mobileNav}
                  </MobileNavCloseContext.Provider>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        brand
      )}

      <div className="relative min-w-0" ref={menuRef}>
        <button
          type="button"
          onClick={toggleUserMenu}
          className="flex items-center gap-[9px] px-2 py-1.5 rounded-lg hover:bg-pepo-su transition-colors min-w-0 max-w-full"
        >
          <div className="w-[30px] h-[30px] rounded-full bg-pepo-pl text-pepo-p text-xs font-medium flex items-center justify-center flex-shrink-0 overflow-hidden">
            {profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initials(name)
            )}
          </div>
          {/* max-w-[...] giver truncate et fast loft at trunkere mod på
              smalle skærme, i stedet for at stole på at min-w-0 alene
              begrænser bredden korrekt hele vejen op gennem flex-kæden. */}
          <div className="min-w-0 max-w-[110px] sm:max-w-[180px] text-left">
            {companyName && (
              <div className="hidden sm:block text-[10px] font-medium text-pepo-t3 uppercase tracking-wide truncate">
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

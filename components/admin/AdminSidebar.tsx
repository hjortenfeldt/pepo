"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

type NavChild = {
  href: string;
  label: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: string; // Tabler icon suffix, fx "layout-dashboard"
  active: boolean; // om ruten er bygget endnu
  children?: NavChild[];
};

// Ruterne er relative til virksomhedens eget subdomæne (fx
// kulturbyen.pepo.team/shifts) — intet "/admin"-præfiks, da middleware.ts
// allerede har rewritet requestet internt til /tenant/*.
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "layout-dashboard", active: true },
  { href: "/shifts", label: "Vagter", icon: "calendar-event", active: true },
  { href: "/freelancers", label: "Freelancere", icon: "users", active: true },
  { href: "/clients", label: "Kunder", icon: "building-store", active: true },
  { href: "/categories", label: "Jobfunktioner", icon: "briefcase", active: true },
  { href: "/messages", label: "Beskeder", icon: "message-2", active: true },
  {
    href: "/settings",
    label: "Indstillinger",
    icon: "settings",
    active: true,
    children: [
      { href: "/settings/company", label: "Firmaoplysninger" },
      { href: "/settings/admins", label: "Admin brugere" },
      { href: "/settings/calendar", label: "Sync admin-kalender" },
      { href: "/settings/urls", label: "Vigtige URL'er" },
    ],
  },
];

// Logo, "Pepo admin"-teksten, versionsnummeret og brugerinfo/log ud bor nu
// i AdminTopBar.tsx (den fælles top-bar) — denne komponent er udelukkende
// selve navigationslisten, med sit eget uafhængige scroll-panel (se
// [[feedback_admin_layout_single_scroll_panel]]).
export default function AdminSidebar() {
  const pathname = usePathname();
  // null = "brug automatisk åbn/luk ud fra den aktuelle side"; ellers
  // overstyrer et manuelt klik den automatiske opførsel resten af sessionen.
  const [manualOpenSection, setManualOpenSection] = useState<string | null | undefined>(undefined);

  return (
    <div className="w-56 bg-pepo-wh border-r border-pepo-bd flex-shrink-0 flex flex-col h-full overflow-hidden">
      <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto px-3.5 py-3">
        {NAV.map((item) => {
          const hasChildren = Boolean(item.children && item.children.length > 0);
          const isCurrent =
            !hasChildren &&
            item.active &&
            (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
          const isWithinSection = hasChildren && pathname.startsWith(item.href);
          const isOpen = manualOpenSection === item.href || (manualOpenSection === undefined && isWithinSection);

          const body = (
            <span
              className={
                "flex items-center gap-2.5 px-2.5 py-[9px] rounded-lg text-[13.5px] font-medium " +
                (isCurrent
                  ? "bg-pepo-pl text-pepo-p"
                  : item.active
                  ? "text-pepo-t2 hover:bg-pepo-su"
                  : "text-pepo-t3 cursor-default")
              }
            >
              <Icon
                name={item.icon}
                size={26}
                className={
                  "flex-shrink-0 " +
                  (isCurrent ? "text-pepo-p" : item.active ? "text-pepo-t2" : "text-pepo-t3")
                }
              />
              {item.label}
              {!item.active && (
                <span className="ml-auto text-[10px] text-pepo-t3">snart</span>
              )}
              {hasChildren && (
                <Icon
                  name={isOpen ? "chevron-down" : "chevron-right"}
                  size={24}
                  className="ml-auto flex-shrink-0 text-pepo-t2"
                />
              )}
            </span>
          );

          if (hasChildren) {
            return (
              <div key={item.href}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setManualOpenSection(isOpen ? null : item.href)}
                >
                  {body}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-0.5 mt-0.5 mb-0.5">
                    {item.children!.map((child) => {
                      const isChildCurrent = pathname === child.href || pathname.startsWith(child.href + "/");
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={
                            "pl-[46px] pr-2.5 py-[8px] rounded-lg text-[13px] font-medium " +
                            (isChildCurrent ? "bg-pepo-pl text-pepo-p" : "text-pepo-t2 hover:bg-pepo-su")
                          }
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return item.active ? (
            <Link key={item.href} href={item.href}>
              {body}
            </Link>
          ) : (
            <div key={item.href}>{body}</div>
          );
        })}
      </nav>
    </div>
  );
}

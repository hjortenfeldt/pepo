"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { APP_VERSION } from "@/lib/version";

type NavItem = {
  href: string;
  label: string;
  icon: string; // Tabler icon suffix, fx "layout-dashboard"
  active: boolean; // om ruten er bygget endnu
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
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default function AdminSidebar({
  name,
  onLogout,
  companyName,
}: {
  name: string;
  onLogout: () => Promise<void>;
  companyName?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="w-56 bg-pepo-wh border-r border-pepo-bd flex-shrink-0 flex flex-col px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-[22px]">
        <div className="w-8 h-8 rounded-lg bg-pepo-p flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
            <circle cx="8.5" cy="11" r="5.5" fill="white" />
            <circle cx="17" cy="11" r="3.5" fill="white" opacity="0.6" />
          </svg>
        </div>
        <span className="text-base font-semibold tracking-tight text-pepo-t1">
          {companyName ?? "pepo"} <span className="text-pepo-t3 font-normal">admin</span>
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const isCurrent =
            item.active && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
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
            </span>
          );

          return item.active ? (
            <Link key={item.href} href={item.href}>
              {body}
            </Link>
          ) : (
            <div key={item.href}>{body}</div>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div className="pt-2.5 border-t border-pepo-bd flex items-center gap-[9px] px-2.5">
          <div className="w-[30px] h-[30px] rounded-full bg-pepo-pl text-pepo-p text-xs font-medium flex items-center justify-center flex-shrink-0">
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            {companyName && (
              <div className="text-[10px] font-medium text-pepo-t3 uppercase tracking-wide truncate">
                {companyName}
              </div>
            )}
            <div className="text-[12.5px] font-medium text-pepo-t1 truncate">{name}</div>
            <button
              type="button"
              onClick={() => onLogout()}
              className="text-[11px] text-pepo-t3 hover:text-pepo-p"
            >
              Log ud
            </button>
          </div>
        </div>

        <div className="pt-2 px-2.5 text-[10px] text-pepo-t1">v{APP_VERSION}</div>
      </div>
    </div>
  );
}

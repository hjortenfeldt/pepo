"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

const TABS = [
  { href: "/", label: "Overblik", icon: "layout-grid" },
  { href: "/vagtplan", label: "Vagtplan", icon: "calendar" },
  { href: "/beskeder", label: "Beskeder", icon: "message-circle" },
  { href: "/kontakter", label: "Kontakter", icon: "users" },
  { href: "/mere", label: "Mere", icon: "dots" },
] as const;

/**
 * Bundnavigation for freelancer-appen — fast placeret, samme fem faner på
 * alle sider. Aktiv fane afgøres af den nuværende sti; "/vagtplan/[id]"
 * skal fx stadig markere "Vagtplan" som aktiv, derfor startsWith frem for
 * eksakt match (undtaget "/", som ellers ville matche alt).
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-shrink-0 bg-pepo-wh border-t border-pepo-bd flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
          >
            <Icon
              name={tab.icon}
              size={22}
              className={isActive ? "text-pepo-p transition-colors" : "text-pepo-t2 transition-colors"}
            />
            <span
              className={`text-[10.5px] font-medium transition-colors ${
                isActive ? "text-pepo-p" : "text-pepo-t2"
              }`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

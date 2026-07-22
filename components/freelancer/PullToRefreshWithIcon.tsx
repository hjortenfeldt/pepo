"use client";

import { usePathname } from "next/navigation";
import PullToRefresh from "@/components/freelancer/PullToRefresh";
import { TABS } from "@/components/freelancer/BottomNav";

/**
 * Tynd wrapper der vælger hvilket ikon pull-to-refresh-spinneren skal vise,
 * ud fra hvilken bundnavigations-fane den nuværende side hører til (samme
 * matching-logik som BottomNav.tsx selv bruger til at markere den aktive
 * fane) — falder tilbage til PullToRefresh.tsx's eget standard-
 * genindlæsningsikon, hvis stien ikke matcher nogen fane (fx underdetalje-
 * sider som /vagt/[id] eller /kolleger/[id]). Eneste grund til at denne
 * wrapper findes i stedet for at kalde usePathname() direkte i
 * PullToRefresh.tsx: den fælles komponent kender ikke til nogen bestemt
 * apps navigations-struktur (den bruges også af Admin Appen, se
 * components/admin/AdminPullToRefresh.tsx, som gør det samme ud fra sin
 * egen NAV-liste).
 */
export default function PullToRefreshWithIcon({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tab = TABS.find((t) => (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)));

  return <PullToRefresh icon={tab?.icon}>{children}</PullToRefresh>;
}

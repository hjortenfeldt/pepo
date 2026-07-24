import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Indstillinger" };

// "Indstillinger" foldede tidligere sine undersider ud direkte i
// AdminSidebar/AdminTopBar's menu (se ældre git-historik for
// AdminSidebar.tsx) — nu er selve menupunktet et almindeligt link ind til
// DENNE side, som fungerer som en "kort-menu": hvert kort linker videre til
// en af de faktiske indstillingssider. Beskrivelserne herunder er bevidst
// identiske med hver undersides egen undertekst (samme tekst to steder,
// men altid i sync — det ER den samme sætning, ikke en gættet omskrivning).
const SETTINGS_CARDS = [
  {
    href: "/settings/company",
    label: "Firmaoplysninger",
    icon: "building",
    description: "Jeres stamdata og virksomhedens webadresse",
  },
  {
    href: "/settings/variables",
    label: "Variabler",
    icon: "adjustments",
    description: "Indstillinger der styrer beregninger og adgangskrav i systemet",
  },
  {
    href: "/settings/admins",
    label: "Admin brugere",
    icon: "user-cog",
    description: "Giv flere medarbejdere adgang til at administrere jeres system",
  },
  {
    href: "/settings/calendar",
    label: "Sync admin-kalender",
    icon: "calendar",
    description: "Abonnér på jeres events direkte i jeres almindelige kalender-app",
  },
  {
    href: "/settings/urls",
    label: "Vigtige URL'er",
    icon: "link",
    description: "Links I kan dele med jeres freelancere og på jeres egen hjemmeside",
  },
];

export default function SettingsIndexPage() {
  return (
    <div className="px-[var(--page-px)] pt-[22px] pb-10">
      <div className="mb-[18px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Indstillinger</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Administrér virksomhedens opsætning
        </div>
      </div>

      {/* Samme auto-fill/minmax-grid som Freelancere-sidens kortvisning —
          giver automatisk flere kolonner på skrivebord og stables i én
          kolonne på mobil/app-bredde, uden en separat "sm:"-variant. */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {SETTINGS_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex flex-col items-center text-center bg-pepo-wh border border-pepo-bd rounded-[14px] px-5 py-6 hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-all"
          >
            <div className="w-11 h-11 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center mb-3">
              <Icon name={card.icon} size={22} />
            </div>
            <div className="text-[14px] font-medium text-pepo-t1">{card.label}</div>
            <div className="text-[12.5px] text-pepo-t2 mt-1 leading-relaxed">{card.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

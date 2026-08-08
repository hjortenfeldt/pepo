import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Tekster" };

// Samme "kort-menu"-mønster som /settings selv (se den sides kommentar) —
// Tekster startede som ÉN side (kun freelancer-invitationen), men er nu ved
// at få flere tekster (booking-godkendt/event-opfølgning, se
// [[project_texts_settings_next_steps]]), så samme opdeling gentages ét
// niveau dybere i stedet for faner: /settings/texts er nu selv en oversigt,
// og hvert kort linker videre til sin egen redigeringsside.
const TEXT_CARDS = [
  {
    href: "/settings/texts/invitation",
    label: "Email-invitation til nye freelancere",
    icon: "user-plus",
    description: 'Sendes når I opretter en ny freelancer og trykker "Send invitation"',
  },
  {
    href: "/settings/texts/booking-approved",
    label: "Email ved godkendt booking",
    icon: "circle-check",
    description: "Sendes til kunden når I godkender deres eventforespørgsel",
  },
  {
    href: "/settings/texts/event-followup",
    label: "Opfølgningsmail efter event",
    icon: "message-star",
    description: "Sendes automatisk til kunden, når et event er afviklet",
  },
];

export default function TextsSettingsIndexPage() {
  return (
    <div className="px-[var(--page-px)] pt-[22px] pb-10">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-[13px] text-pepo-t2 hover:text-pepo-t1 mb-3"
      >
        <Icon name="chevron-left" size={16} />
        Indstillinger
      </Link>

      <div className="mb-[18px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Tekster</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Tilpas ordlyden i de automatiske e-mails, jeres virksomhed sender
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {TEXT_CARDS.map((card) => (
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

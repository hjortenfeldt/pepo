import Link from "next/link";
import Icon from "@/components/Icon";
import { formatDateDisplay } from "@/lib/format";
import type { CompanyColleague } from "@/lib/freelancer";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default function ColleagueDetail({
  colleague,
  isSelf,
}: {
  colleague: CompanyColleague;
  isSelf: boolean;
}) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-pepo-wh px-4 py-3 border-b border-pepo-bd flex items-center">
        <Link href="/kontakter" className="flex items-center gap-2 text-pepo-t1 -ml-1 px-1 py-0.5">
          <Icon name="arrow-left" size={18} />
          <span className="text-[14px] font-medium">Kontakter</span>
        </Link>
      </div>

      <div className="px-5 pt-6 pb-8 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-pepo-pl text-pepo-p text-[24px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
          {colleague.profile_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={colleague.profile_image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials(colleague.full_name)
          )}
        </div>
        <div className="text-[19px] font-bold text-pepo-t1 mt-3 text-center">
          {colleague.full_name}
          {isSelf && <span className="text-pepo-t3 font-normal"> (dig)</span>}
        </div>

        <div className="flex items-center gap-8 mt-5">
          <a href={`tel:${colleague.phone}`} className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-full bg-pepo-p flex items-center justify-center">
              <Icon name="phone" size={20} className="text-white" />
            </div>
            <span className="text-[11.5px] font-medium text-pepo-t2">Opkald</span>
          </a>
          <a href={`sms:${colleague.phone}`} className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-full bg-pepo-p flex items-center justify-center">
              <Icon name="message-circle" size={20} className="text-white" />
            </div>
            <span className="text-[11.5px] font-medium text-pepo-t2">Besked</span>
          </a>
          {colleague.email && (
            <a href={`mailto:${colleague.email}`} className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-full bg-pepo-p flex items-center justify-center">
                <Icon name="mail" size={20} className="text-white" />
              </div>
              <span className="text-[11.5px] font-medium text-pepo-t2">E-mail</span>
            </a>
          )}
        </div>

        <div className="w-full bg-pepo-wh border border-pepo-bd rounded-[14px] mt-7 divide-y divide-pepo-bd">
          {colleague.email && (
            <InfoRow icon="mail" label="E-mailadresse" value={colleague.email} href={`mailto:${colleague.email}`} />
          )}
          <InfoRow icon="phone" label="Telefon" value={colleague.phone} href={`tel:${colleague.phone}`} />
          <InfoRow icon="cake" label="Fødselsdato" value={formatDateDisplay(colleague.birth_date)} />
          <InfoRow
            icon="calendar-plus"
            label="Oprettelsesdato"
            value={formatDateDisplay(colleague.created_at.slice(0, 10))}
          />
        </div>

        {colleague.category_names.length > 0 && (
          <div className="w-full mt-5">
            <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide mb-2.5">
              Jobfunktioner
            </div>
            <div className="flex flex-wrap gap-2">
              {colleague.category_names.map((name) => (
                <span
                  key={name}
                  className="inline-flex bg-pepo-pl text-pepo-p rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  href,
}: {
  icon: string;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon name={icon} size={17} className="text-pepo-t3 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-pepo-t3">{label}</div>
        <div className={`text-[14px] font-medium mt-0.5 truncate ${href ? "text-pepo-p" : "text-pepo-t1"}`}>
          {value}
        </div>
      </div>
    </div>
  );

  return href ? (
    <a href={href} className="block active:opacity-70 transition-opacity">
      {content}
    </a>
  ) : (
    content
  );
}

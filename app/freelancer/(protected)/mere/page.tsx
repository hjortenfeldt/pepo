import Link from "next/link";
import { getAuthUser } from "@/lib/supabase/server";
import { logout } from "../../login/actions";
import { getActiveProfile, getApprovedProfiles, getFreelancerCalendarToken } from "@/lib/freelancer";
import Icon from "@/components/Icon";
import PushToggle from "@/components/freelancer/PushToggle";
import InstallAppMenuRow from "@/components/freelancer/InstallAppMenuRow";
import CompanySwitcher from "@/components/freelancer/CompanySwitcher";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default async function FreelancerMerePage() {
  const user = await getAuthUser();
  if (!user) return null;

  // Firma-skifteren vises kun hvis freelanceren rent faktisk er godkendt
  // hos mere end én virksomhed — se CompanySwitcher.tsx. Navn/email/billede
  // vist herunder er DENNE profils egne (kan variere pr. virksomhed), ikke
  // et fælles "brugernavn" — hentes derfor direkte fra getActiveProfile,
  // ikke fra en separat freelancer_profiles-opslag på user.id.
  const [approvedProfiles, activeProfile] = await Promise.all([
    getApprovedProfiles(user.id),
    getActiveProfile(user.id),
  ]);
  const profile = activeProfile;

  // Kun brug for token'et hvis der rent faktisk er en aktiv profil at
  // abonnere kalenderen for — se getFreelancerCalendarToken i lib/freelancer.ts.
  const calendarToken = activeProfile ? await getFreelancerCalendarToken(activeProfile.id) : null;
  const calendarWebcalUrl = calendarToken ? `webcal://app.${ROOT_DOMAIN}/api/calendar/${calendarToken}.ics` : null;

  return (
    <div className="px-5 pt-4 pb-6">
      <div className="text-[20px] font-bold text-pepo-t1 mb-4 pepo-rise">Mere</div>

      <Link
        href="/profil"
        className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 flex items-center gap-3 pepo-rise"
      >
        <div className="w-12 h-12 rounded-full bg-pepo-pl text-pepo-p text-[16px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
          {profile?.profile_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials(profile?.full_name ?? "?")
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-pepo-t1 truncate">{profile?.full_name}</div>
          <div className="text-[12.5px] text-pepo-t2 truncate">{profile?.email}</div>
        </div>
        <Icon name="chevron-right" size={16} className="text-pepo-t3 flex-shrink-0" />
      </Link>

      {approvedProfiles.length > 1 && activeProfile && (
        <CompanySwitcher profiles={approvedProfiles} activeProfileId={activeProfile.id} />
      )}

      <PushToggle />

      <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] mt-4 divide-y divide-pepo-bd pepo-rise">
        <InstallAppMenuRow />
        {calendarWebcalUrl && (
          <MenuRow icon="calendar-plus" label="Sync med din kalender" href={calendarWebcalUrl} />
        )}
        <MenuRow icon="help-circle" label="Hjælp og support" />
      </div>

      <form action={logout} className="mt-4">
        <button
          type="submit"
          className="w-full h-11 rounded-[10px] text-[13.5px] font-semibold text-[#C0021A] bg-[#FDECEA]"
        >
          Log ud
        </button>
      </form>

      <div className="text-center text-[11px] text-pepo-t3 mt-5">v{APP_VERSION}</div>
    </div>
  );
}

// "href" gør rækken til et rigtigt link (fx et webcal://-abonnementslink,
// der udløser kalender-appens egen "Ny kalenderabonnement"-dialog med det
// samme brugeren trykker på rækken) i stedet for blot en ikke-klikbar
// visnings-række — se "Sync med din kalender" ovenfor.
function MenuRow({ icon, label, href }: { icon: string; label: string; href?: string }) {
  const content = (
    <>
      <Icon name={icon} size={18} className="text-pepo-t2" />
      <span className="flex-1">{label}</span>
      <Icon name="chevron-right" size={16} className="text-pepo-t3" />
    </>
  );

  if (href) {
    return (
      <a href={href} className="flex items-center gap-3 px-4 py-3.5 text-[13.5px] text-pepo-t1">
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 text-[13.5px] text-pepo-t1">
      {content}
    </div>
  );
}

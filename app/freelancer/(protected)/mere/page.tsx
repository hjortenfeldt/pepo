import { createClient } from "@/lib/supabase/server";
import { logout } from "../../login/actions";
import Icon from "@/components/Icon";
import PushToggle from "@/components/freelancer/PushToggle";

export const dynamic = "force-dynamic";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default async function FreelancerMerePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("freelancer_profiles")
    .select("full_name, email, profile_image_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="px-5 pt-4 pb-6">
      <div className="text-[20px] font-bold text-pepo-t1 mb-4 pepo-rise">Mere</div>

      <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 flex items-center gap-3 pepo-rise">
        <div className="w-12 h-12 rounded-full bg-pepo-pl text-pepo-p text-[16px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
          {profile?.profile_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials(profile?.full_name ?? "?")
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-pepo-t1 truncate">{profile?.full_name}</div>
          <div className="text-[12.5px] text-pepo-t2 truncate">{profile?.email}</div>
        </div>
      </div>

      <PushToggle />

      <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] mt-4 divide-y divide-pepo-bd pepo-rise">
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
    </div>
  );
}

function MenuRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 text-[13.5px] text-pepo-t1">
      <Icon name={icon} size={18} className="text-pepo-t2" />
      <span className="flex-1">{label}</span>
      <Icon name="chevron-right" size={16} className="text-pepo-t3" />
    </div>
  );
}

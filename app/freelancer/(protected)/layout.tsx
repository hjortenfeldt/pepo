import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFreelancerMemberships } from "@/lib/freelancer";
import { logout } from "../login/actions";
import BottomNav from "@/components/freelancer/BottomNav";
import Icon from "@/components/Icon";

export default async function ProtectedFreelancerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const memberships = await getFreelancerMemberships(user.id);
  const approved = memberships.find((m) => m.application_status === "approved" && m.companies);

  // Ingen firma-relation overhovedet — burde ikke kunne ske, da man kun
  // kan logge ind med en email der har ansøgt, men vis en klar besked
  // frem for en tom/forvirrende side.
  if (memberships.length === 0) {
    return (
      <PendingScreen
        title="Ingen ansøgning fundet"
        body="Vi kan ikke finde en ansøgning tilknyttet din konto. Har du ansøgt på pepo.team?"
      />
    );
  }

  // Ingen godkendt endnu — men mindst én ansøgning er under behandling.
  if (!approved) {
    const rejectedOnly = memberships.every((m) => m.application_status === "rejected");
    return (
      <PendingScreen
        title={rejectedOnly ? "Ansøgning afvist" : "Afventer godkendelse"}
        body={
          rejectedOnly
            ? "Din ansøgning er ikke blevet godkendt. Kontakt virksomheden hvis du tror, det er en fejl."
            : "Din ansøgning bliver behandlet. Du får adgang til appen, så snart en administrator har godkendt dig."
        }
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-pepo-su">
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      <BottomNav />
    </div>
  );
}

function PendingScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-pepo-su px-8 text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-pepo-pl flex items-center justify-center">
        <Icon name="clock" size={26} className="text-pepo-p" />
      </div>
      <div>
        <div className="text-[18px] font-semibold text-pepo-t1">{title}</div>
        <div className="text-[13.5px] text-pepo-t2 mt-1.5 max-w-[280px]">{body}</div>
      </div>
      <form action={logout} className="mt-2">
        <button
          type="submit"
          className="text-[13px] font-medium text-pepo-t2 hover:text-pepo-t1 transition-colors underline"
        >
          Log ud
        </button>
      </form>
    </div>
  );
}

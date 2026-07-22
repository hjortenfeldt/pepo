import { redirect } from "next/navigation";
import { after } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { getFreelancerMemberships, getActiveProfile, touchProfileActivity } from "@/lib/freelancer";
import { logout } from "../login/actions";
import BottomNav from "@/components/freelancer/BottomNav";
import PullToRefresh from "@/components/freelancer/PullToRefresh";
import UpdateChecker from "@/components/freelancer/UpdateChecker";
import PushGate from "@/components/freelancer/PushGate";
import Icon from "@/components/Icon";

export default async function ProtectedFreelancerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

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

  // Registrerer dagens dato som "sidst aktiv" for den profil freelanceren
  // aktuelt browser under (se getActiveProfile i lib/freelancer.ts) — kun
  // for godkendte brugere der rent faktisk ser appens indhold, ikke for
  // "afventer godkendelse"-skærmen ovenfor. Kørt via after(), så selve
  // sidevisningen ikke venter på dette skriv.
  const activeProfile = await getActiveProfile(user.id);
  if (activeProfile) {
    after(() => touchProfileActivity(activeProfile.id));
  }

  return (
    // h-dvh (dynamic viewport height), IKKE h-screen (100vh) — 100vh er
    // låst til browserens *største* mulige visningsområde (adresselinje
    // skjult), så på mobil endte bundnavigationen halvvejs neden for det
    // faktiske synlige skærmbillede, når adresselinjen var synlig. dvh
    // følger derimod det aktuelt synlige område live, og holder dermed
    // bundnavigationen sticky lige over browserens UI, både i Safari/Chrome
    // og i den installerede standalone-app.
    <div className="flex flex-col h-dvh overflow-hidden bg-pepo-su">
      <PushGate>
        <UpdateChecker />
        <PullToRefresh>{children}</PullToRefresh>
        <BottomNav />
      </PushGate>
    </div>
  );
}

function PendingScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-pepo-su px-8 text-center gap-4">
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

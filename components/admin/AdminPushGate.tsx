"use client";

import { useEffect, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { detectPushStatus, urlBase64ToUint8Array, type PushStatus } from "@/lib/push-client";
import { saveAdminPushSubscription } from "@/app/tenant/(protected)/actions";
import { isMobileDevice } from "@/lib/device-detection";

type GateState = "checking" | "prompt" | "app";

/**
 * Admin Appens udgave af components/freelancer/PushGate.tsx — en fuldskærms-
 * prompt der afbryder hver friske appstart (dvs. hver gang (protected)/
 * layout.tsx mountes), hvis push ikke allerede er aktiveret. "Ikke nu"
 * lukker den kun for denne session, ligesom freelancer-appens udgave — se
 * PushGate.tsx for den fulde begrundelse (manglende push-beskeder betyder
 * glipede vagttilbud/beskeder).
 *
 * MOBIL-ONLY (i modsætning til components/freelancer/PushGate.tsx, som
 * altid vises): en tenant-admin på DESKTOP genindlæser/navigerer i systemet
 * mange gange i løbet af en arbejdsdag, og ville derfor blive afbrudt af
 * denne fuldskærmsprompt langt oftere end en freelancer nogensinde ser sin
 * — det ville være en alvorlig regression af den daglige desktop-brug. En
 * desktop-admin kan i stedet slå push til manuelt og i sit eget tempo via
 * AdminPushToggle.tsx på Profil-siden, uden nogensinde at blive afbrudt.
 * Mountes i (protected)/layout.tsx og dækker (når den rent faktisk vises på
 * mobil) HELE skærmen inkl. topbar/sidebar, jf. Hjorths eksplicitte valg om
 * "fuldskærm, skjuler sidebar" for disse gates. Se
 * [[project_admin_appen_pwa_parity]].
 */
export default function AdminPushGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [pushStatus, setPushStatus] = useState<PushStatus>("off");
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // isMobileDevice()-tjekket ligger bevidst inde i .then()-kæden (ikke
    // synkront først i effekt-kroppen) — samme react-hooks/set-state-in-effect
    // hensyn som AdminInstallGate.tsx/AdminSplashScreen.tsx.
    Promise.resolve()
      .then(() => (isMobileDevice() ? detectPushStatus() : Promise.resolve("unsupported" as const)))
      .then((status) => {
        if (!isMobileDevice()) {
          setState("app");
          return;
        }
        setPushStatus(status);
        setState(status === "on" || status === "unsupported" ? "app" : "prompt");
      });
  }, []);

  function enable() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setPushStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) {
          setError("Push er ikke sat op endnu. Kontakt Pepo.");
          return;
        }
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const json = subscription.toJSON();
        const res = await saveAdminPushSubscription({
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        });
        if (!res.success) {
          setError(res.error);
          return;
        }
        setState("app");
      } catch (err) {
        console.error("AdminPushGate: aktivering fejlede", err);
        setError("Kunne ikke aktivere notifikationer. Prøv igen.");
      }
    });
  }

  function skip() {
    setConfirmingSkip(false);
    setState("app");
  }

  if (state === "checking") {
    // Kort, tomt øjeblik mens vi afgør enhed/push-status — undgår flash af
    // enten dashboard eller prompt, hvis det ender med at være forkert.
    // h-dvh (ikke h-screen/flex-1) fordi denne gate — i modsætning til
    // freelancer-appens PushGate — dækker HELE skærmen, ikke kun
    // indholdsområdet inde i et allerede-eksisterende layout. h-dvh (ikke
    // 100vh) af samme grund som (protected)/layout.tsx: undgår at "Ikke
    // nu"-knappen ender skjult neden for det faktiske synlige område, når
    // mobilens adresselinje er synlig.
    return <div className="h-dvh bg-pepo-su" />;
  }

  if (state === "prompt") {
    return (
      <div className="h-dvh flex flex-col bg-pepo-su relative overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-8">
            <div className="w-20 h-20 rounded-full bg-pepo-pl flex items-center justify-center">
              <Icon name="bell-ringing" size={36} className="text-pepo-p" strokeWidth={1.75} />
            </div>
          </div>

          <div className="w-full max-w-[380px] bg-pepo-wh rounded-[20px] p-7 shadow-[0_4px_32px_rgba(62,31,138,0.10)] pepo-rise text-left">
            <div className="text-[19px] font-semibold text-pepo-t1 tracking-tight mb-1">
              {pushStatus === "denied" ? "Notifikationer er blokeret" : "Slå notifikationer til"}
            </div>
            <div className="text-[13.5px] text-pepo-t2 leading-snug">
              {pushStatus === "denied"
                ? "Du har tidligere blokeret notifikationer i telefonens indstillinger. Slå dem til der, så du ikke går glip af vigtige beskeder."
                : "Få besked med det samme om nye beskeder og anden vigtig information — så du ikke går glip af noget."}
            </div>

            {pushStatus !== "denied" && (
              <button
                type="button"
                disabled={isPending}
                onClick={enable}
                className="w-full h-[46px] mt-6 rounded-[10px] text-[15px] font-medium bg-pepo-p text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Icon name="bell" size={18} className="text-white" strokeWidth={1.75} />
                Aktivér notifikationer
              </button>
            )}

            {error && <p className="text-[12px] text-red-600 mt-2.5">{error}</p>}

            <button
              type="button"
              onClick={() => (pushStatus === "denied" ? skip() : setConfirmingSkip(true))}
              className="w-full h-9 mt-4 text-[13px] font-medium text-pepo-t2 hover:text-pepo-t1 transition-colors"
            >
              {pushStatus === "denied" ? "Fortsæt" : "Ikke nu"}
            </button>
          </div>
        </div>

        {confirmingSkip && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-6">
            <div className="w-full max-w-[340px] bg-pepo-wh rounded-[18px] p-6 pepo-rise text-left">
              <div className="text-[15px] text-pepo-t1 leading-snug">
                Uden notifikationer får du ikke automatisk besked om nye beskeder. Er du sikker på at
                du vil fortsætte uden?
              </div>
              <div className="flex flex-col gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirmingSkip(false)}
                  className="w-full h-11 rounded-[10px] text-[14px] font-medium bg-pepo-p text-white transition-opacity hover:opacity-90"
                >
                  Nej, aktivér notifikationer
                </button>
                <button
                  type="button"
                  onClick={skip}
                  className="w-full h-11 rounded-[10px] text-[14px] font-medium text-pepo-t2 hover:text-pepo-t1 transition-colors"
                >
                  Ja, fortsæt uden
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

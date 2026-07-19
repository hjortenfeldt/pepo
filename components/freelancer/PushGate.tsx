"use client";

import { useEffect, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { detectPushStatus, urlBase64ToUint8Array, type PushStatus } from "@/lib/push-client";
import { savePushSubscription } from "@/app/freelancer/(protected)/actions";

type GateState = "checking" | "prompt" | "app";

/**
 * Viser en fuldskærms-prompt, hver gang freelancer-appen startes friskt (dvs.
 * hver gang dette layout mountes — IKKE ved almindelig navigation i appen,
 * da layoutet ikke genmountes ved client-side sideskift), hvis push-
 * notifikationer ikke allerede er aktiveret. Mirroer bevidst InstallGate.tsx's
 * struktur og stil (samme "checking/guide/app"-mønster, samme kort-layout),
 * men har IKKE en permanent "husk mit valg for altid"-dismiss som InstallGate
 * (localStorage) — Hjorth vil have at freelanceren bliver mindet om det ved
 * HVER appstart, fordi manglende push-beskeder direkte betyder glipede
 * vagt-tilbud. "Ikke nu" lukker derfor kun prompten for resten af denne
 * app-session (indtil næste fulde genstart/genindlæsning), ikke for altid.
 *
 * Sidder i (protected)/layout.tsx — IKKE i det ydre app/freelancer/layout.tsx
 * som InstallGate — fordi et push-abonnement er knyttet til den loggede ind
 * freelancer (savePushSubscription kræver en bruger), og derfor kun giver
 * mening efter login.
 */
export default function PushGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [pushStatus, setPushStatus] = useState<PushStatus>("off");
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    detectPushStatus().then((status) => {
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
        const res = await savePushSubscription({
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        });
        if (!res.success) {
          setError(res.error);
          return;
        }
        setState("app");
      } catch (err) {
        console.error("PushGate: aktivering fejlede", err);
        setError("Kunne ikke aktivere notifikationer. Prøv igen.");
      }
    });
  }

  function skip() {
    setConfirmingSkip(false);
    setState("app");
  }

  if (state === "checking") {
    // Kort, tomt øjeblik mens vi afgør push-status — undgår flash af enten
    // app-indhold eller prompt, hvis det ender med at være forkert. flex-1
    // min-h-0 (ikke min-h-dvh) fordi dette sidder inde i det ydre h-dvh
    // overflow-hidden flex-col-layout i (protected)/layout.tsx — skal fylde
    // den resterende plads, ikke sin egen fulde viewport-højde oveni.
    return <div className="flex-1 min-h-0 bg-pepo-su" />;
  }

  if (state === "prompt") {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-pepo-su relative overflow-hidden">
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
                ? "Du har tidligere blokeret notifikationer i telefonens indstillinger. Slå dem til der, så du ikke går glip af nye vagter."
                : "Få besked med det samme om nye vagter, ændringer og anden vigtig information — så du ikke går glip af noget."}
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
                Uden notifikationer får du ikke automatisk besked om nye vagter. Er du sikker på at du
                vil fortsætte uden?
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

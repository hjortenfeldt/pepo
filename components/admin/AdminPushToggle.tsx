"use client";

import { useEffect, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { saveAdminPushSubscription, removeAdminPushSubscription } from "@/app/tenant/(protected)/actions";
import { detectPushStatus, urlBase64ToUint8Array, type PushStatus } from "@/lib/push-client";

type Status = PushStatus | "checking";

/**
 * Admin Appens udgave af components/freelancer/PushToggle.tsx. I modsætning
 * til AdminInstallMenuRow/AdminSplashScreen/AdminInstallGate er denne IKKE
 * mobil-gate'et — web push virker fint i en almindelig desktop-browserfane
 * (uden at siden behøver være installeret som PWA), og en tenant-admin, der
 * sidder ved sin computer det meste af dagen, kan sagtens have gavn af en
 * skrivebords-notifikation om en ny besked, selv uden Admin Appen installeret.
 * Kun selve FORCED-prompten (AdminPushGate.tsx, som afbryder hver appstart)
 * er mobil-gate'et — denne rolige, manuelle switch her er det, en
 * desktop-admin i stedet møder.
 */
export default function AdminPushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    detectPushStatus().then(setStatus);
  }, []);

  function enable() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
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
        setStatus("on");
      } catch (err) {
        console.error("AdminPushToggle: aktivering fejlede", err);
        setError("Kunne ikke aktivere notifikationer. Prøv igen.");
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removeAdminPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    });
  }

  if (status === "unsupported") return null;

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 pepo-rise">
      <div className="flex items-center gap-2.5">
        <Icon name="bell" size={22} className="text-pepo-t2" />
        <div className="flex-1">
          <div className="text-[13.5px] font-medium text-pepo-t1">Push-notifikationer</div>
          <div className="text-[12px] text-pepo-t2 mt-0.5">
            {status === "denied"
              ? "Blokeret i browseren — slå det til i browserens/systemets indstillinger for at aktivere."
              : status === "on"
                ? "Du får besked om nye beskeder og andet vigtigt."
                : "Få besked med det samme om nye beskeder og andet vigtigt."}
          </div>
        </div>
        {status !== "denied" && status !== "checking" && (
          <button
            type="button"
            role="switch"
            aria-checked={status === "on"}
            disabled={isPending}
            onClick={status === "on" ? disable : enable}
            className={
              "w-10 h-6 rounded-full flex-shrink-0 relative transition-colors disabled:opacity-50 " +
              (status === "on" ? "bg-pepo-p" : "bg-pepo-bd")
            }
          >
            <span
              className={
                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform " +
                (status === "on" ? "translate-x-4" : "translate-x-0")
              }
            />
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-red-600 mt-2.5">{error}</p>}
    </div>
  );
}

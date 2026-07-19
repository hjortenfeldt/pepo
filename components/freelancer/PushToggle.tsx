"use client";

import { useEffect, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { savePushSubscription, removePushSubscription } from "@/app/freelancer/(protected)/actions";
import { detectPushStatus, urlBase64ToUint8Array, type PushStatus } from "@/lib/push-client";

type Status = PushStatus | "checking";

/**
 * Beder aldrig om notifikationstilladelse automatisk ved sideindlæsning —
 * browsere (og brugere) opfatter uopfordrede tilladelses-popups som spam.
 * Freelanceren skal selv trykke "Aktivér" under Mere, hvorefter vi
 * registrerer service workeren og abonnerer via PushManager.
 */
export default function PushToggle() {
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
        const res = await savePushSubscription({
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        });
        if (!res.success) {
          setError(res.error);
          return;
        }
        setStatus("on");
      } catch (err) {
        console.error("PushToggle: aktivering fejlede", err);
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
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    });
  }

  if (status === "unsupported") return null;

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 mt-4 pepo-rise">
      <div className="flex items-center gap-2.5">
        <Icon name="bell" size={18} className="text-pepo-t2" />
        <div className="flex-1">
          <div className="text-[13.5px] font-medium text-pepo-t1">Push-notifikationer</div>
          <div className="text-[12px] text-pepo-t2 mt-0.5">
            {status === "denied"
              ? "Blokeret i browseren — slå det til i telefonens indstillinger for at aktivere."
              : status === "on"
                ? "Du får besked om nye vagter og beskeder."
                : "Få besked med det samme om nye vagter og beskeder."}
          </div>
        </div>
        {status !== "denied" && status !== "checking" && (
          <button
            type="button"
            disabled={isPending}
            onClick={status === "on" ? disable : enable}
            className={`flex-shrink-0 rounded-[16px] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50 transition-opacity ${
              status === "on" ? "bg-pepo-su text-pepo-t2" : "bg-pepo-pl text-pepo-p"
            }`}
          >
            {status === "on" ? "Slå fra" : "Aktivér"}
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-red-600 mt-2.5">{error}</p>}
    </div>
  );
}

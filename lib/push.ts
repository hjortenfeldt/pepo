import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export type PushPayload = { title: string; body: string; url?: string };

/**
 * Sender en push-notifikation til alle enheder, en freelancer har
 * tilmeldt (typisk kun én — telefonen appen er installeret på). Fejler
 * aldrig hårdt for den kaldende handling (fx "send besked" eller "tildel
 * vagt") — push er en ekstra service, ikke en forudsætning for at selve
 * handlingen lykkes.
 *
 * Rydder selv op i abonnementer browseren/OS'et har annulleret (404/410
 * fra push-tjenesten), så push_subscriptions ikke gror med døde rækker.
 */
export async function sendPushToFreelancer(freelancerId: string, payload: PushPayload) {
  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("freelancer_id", freelancerId);

  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("sendPushToFreelancer: afsendelse fejlede", err);
        }
      }
    })
  );
}

export async function sendPushToFreelancers(freelancerIds: string[], payload: PushPayload) {
  await Promise.all(freelancerIds.map((id) => sendPushToFreelancer(id, payload)));
}

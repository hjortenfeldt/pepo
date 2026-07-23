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
 * Admin-appens modstykke til lib/push.ts (som sender til freelancere) —
 * samme opførsel og samme VAPID-nøgler (det er stadig samme web push-
 * standard), blot mod admin_push_subscriptions/admin_id i stedet for
 * push_subscriptions/freelancer_id. Se app/tenant/(protected)/actions.ts's
 * saveAdminPushSubscription for hvordan abonnementet oprettes (PushGate.tsx/
 * PushToggle.tsx i "Admin Appen").
 *
 * Fejler aldrig hårdt for den kaldende handling — push er en ekstra
 * service, ikke en forudsætning for at selve handlingen lykkes.
 */
export async function sendPushToAdmin(adminId: string, payload: PushPayload) {
  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("admin_push_subscriptions")
    .select("id, endpoint, keys")
    .eq("admin_id", adminId);

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
          await supabase.from("admin_push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("sendPushToAdmin: afsendelse fejlede", err);
        }
      }
    })
  );
}

/**
 * Sender til ALLE admins for én bestemt virksomhed — det relevante
 * "publikum" for admin-notifikationer er stort set altid "virksomhedens
 * admins", ikke en håndplukket liste af id'er (i modsætning til
 * sendPushToFreelancers, som altid får en eksplicit liste udefra).
 */
export async function sendPushToCompanyAdmins(companyId: string, payload: PushPayload) {
  const supabase = createAdminClient();
  const { data: admins, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("company_id", companyId);

  if (error) {
    console.error("sendPushToCompanyAdmins: kunne ikke hente virksomhedens admins", error);
    return;
  }
  if (!admins || admins.length === 0) return;

  await Promise.all(admins.map((a) => sendPushToAdmin(a.id as string, payload)));
}

import { createClient } from "@/lib/supabase/server";
import BeskederClient, { type FreelancerMessage } from "@/components/freelancer/BeskederClient";

export const dynamic = "force-dynamic";

type RawMessageRef = { id: string; subject: string; body: string; created_at: string };

type RawRecipientRow = {
  message_id: string;
  read_at: string | null;
  messages: RawMessageRef | RawMessageRef[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function FreelancerBeskederPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("message_recipients")
    .select("message_id, read_at, messages(id, subject, body, created_at)")
    .eq("freelancer_id", user.id);

  const rows = (data ?? []) as unknown as RawRecipientRow[];

  const messages: FreelancerMessage[] = rows
    .map((r) => {
      const m = one(r.messages);
      if (!m) return null;
      return {
        id: m.id,
        subject: m.subject,
        body: m.body,
        createdAt: m.created_at,
        readAt: r.read_at,
      };
    })
    .filter((m): m is FreelancerMessage => m !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return <BeskederClient messages={messages} />;
}

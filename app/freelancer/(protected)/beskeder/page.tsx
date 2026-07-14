import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getActiveProfile } from "@/lib/freelancer";
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
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  // Kun beskeder fra den arbejdsplads freelanceren har valgt i "Mere" —
  // samme begrundelse som Overblik/Vagtplan. messages!inner (i stedet for
  // messages) tvinger PostgREST til at joine, så .eq("messages.company_id",
  // ...) rent faktisk filtrerer resultatet og ikke bare returnerer null for
  // den indlejrede relation på ikke-matchende rækker. message_recipients.
  // freelancer_id er login-id'et (auth_user_id), ikke den valgte profils id
  // — beskeder er ikke splittet pr. virksomhedsprofil, kun filtreret via
  // messages.company_id.
  const activeProfile = await getActiveProfile(user.id);
  if (!activeProfile) return <BeskederClient messages={[]} />;

  const { data } = await supabase
    .from("message_recipients")
    .select("message_id, read_at, messages!inner(id, subject, body, created_at, company_id)")
    .eq("freelancer_id", user.id)
    .eq("messages.company_id", activeProfile.company.id);

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

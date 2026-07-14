import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import MessageBoard from "@/components/admin/MessageBoard";
import type { MessageListItem, CategoryOption, FreelancerOption } from "@/lib/admin-types";

export const metadata: Metadata = { title: "Beskeder" };
export const dynamic = "force-dynamic";

// Rå formen af rækkerne Supabase returnerer. Skrevet i hånden, fordi
// projektet endnu ikke bruger genererede Supabase-databasetyper.
type RawAdminRef = { full_name: string };
type RawCategoryRef = { name: string };
// message_recipients.freelancer_id er login-id'et (auth.users.id), IKKE
// freelancer_profiles.id — den fremmednøgle peger nu på auth.users, så
// PostgREST kan ikke længere indlejre freelancer_profiles direkte her.
// Navnet slås op bagefter via freelancerNameMap (se nedenfor).
type RawRecipientRow = { freelancer_id: string; read_at: string | null };
type RawMessageRow = {
  id: string;
  subject: string;
  body: string;
  sent_to_all: boolean;
  target_category_id: string | null;
  created_at: string;
  admin_users: RawAdminRef | RawAdminRef[] | null;
  work_categories: RawCategoryRef | RawCategoryRef[] | null;
  message_recipients: RawRecipientRow[] | null;
};
type RawCategoryRow = { id: string; name: string };
type RawFreelancerProfileRow = { auth_user_id: string; full_name: string };
type RawFreelancerCategoryRow = { freelancer_id: string; work_categories: RawCategoryRef | RawCategoryRef[] | null };

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function AdminMessagesPage() {
  const supabase = await createClient();

  // Se dashboard-page.tsx for hvorfor company.id skal filtreres eksplicit.
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const [messagesResult, categoriesResult, freelancerProfilesResult] = await Promise.all([
    supabase
      .from("messages")
      .select(
        `id, subject, body, sent_to_all, target_category_id, created_at,
         admin_users(full_name),
         work_categories(name),
         message_recipients(freelancer_id, read_at)`
      )
      .eq("company_id", company.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_categories")
      .select("id, name")
      .eq("company_id", company.id)
      .order("name"),
    // Godkendte profiler for DENNE virksomhed — auth_user_id er login-
    // id'et message_recipients rent faktisk gemmer.
    supabase
      .from("freelancer_profiles")
      .select("auth_user_id, full_name")
      .eq("company_id", company.id)
      .eq("application_status", "approved"),
  ]);

  if (messagesResult.error) {
    console.error("AdminMessagesPage: kunne ikke hente beskeder", messagesResult.error);
  }
  if (categoriesResult.error) {
    console.error("AdminMessagesPage: kunne ikke hente jobfunktioner", categoriesResult.error);
  }
  if (freelancerProfilesResult.error) {
    console.error("AdminMessagesPage: kunne ikke hente freelancere", freelancerProfilesResult.error);
  }

  const approvedProfiles = (freelancerProfilesResult.data ?? []) as RawFreelancerProfileRow[];
  const authIds = approvedProfiles.map((p) => p.auth_user_id);

  const { data: categoryRowsData, error: categoryRowsError } =
    authIds.length > 0
      ? await supabase
          .from("freelancer_categories")
          .select("freelancer_id, work_categories(name)")
          .in("freelancer_id", authIds)
      : { data: [] as RawFreelancerCategoryRow[], error: null };
  if (categoryRowsError) {
    console.error("AdminMessagesPage: kunne ikke hente freelancer-kategorier", categoryRowsError);
  }

  const categoriesByAuthId = new Map<string, string[]>();
  for (const row of (categoryRowsData ?? []) as RawFreelancerCategoryRow[]) {
    const wc = one(row.work_categories);
    if (!wc) continue;
    const list = categoriesByAuthId.get(row.freelancer_id) ?? [];
    list.push(wc.name);
    categoriesByAuthId.set(row.freelancer_id, list);
  }

  // Navnekort til visning af modtagernavne — DENNE virksomheds egen
  // profil-navn for hvert login-id, da navnet nu kan variere pr. virksomhed.
  const freelancerNameMap = new Map<string, string>();
  for (const p of approvedProfiles) {
    freelancerNameMap.set(p.auth_user_id, p.full_name);
  }

  const messages: MessageListItem[] = ((messagesResult.data ?? []) as RawMessageRow[]).map((m) => {
    const sender = one(m.admin_users);
    const targetCategory = one(m.work_categories);
    return {
      id: m.id,
      subject: m.subject,
      body: m.body,
      sentToAll: m.sent_to_all,
      targetCategoryId: m.target_category_id,
      targetCategoryName: targetCategory?.name ?? null,
      sentAt: m.created_at,
      senderName: sender?.full_name ?? null,
      recipients: (m.message_recipients ?? []).map((r) => ({
        freelancerId: r.freelancer_id,
        freelancerName: freelancerNameMap.get(r.freelancer_id) ?? "",
        read: r.read_at !== null,
      })),
    };
  });

  const categories: CategoryOption[] = ((categoriesResult.data ?? []) as RawCategoryRow[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const freelancers: FreelancerOption[] = approvedProfiles.map((p) => ({
    id: p.auth_user_id,
    fullName: p.full_name,
    categories: categoriesByAuthId.get(p.auth_user_id) ?? [],
  }));

  return <MessageBoard messages={messages} categories={categories} freelancers={freelancers} />;
}

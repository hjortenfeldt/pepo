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
type RawFreelancerRef = { full_name: string };
type RawRecipientRow = {
  freelancer_id: string;
  read_at: string | null;
  freelancer_profiles: RawFreelancerRef | RawFreelancerRef[] | null;
};
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
type RawFreelancerProfileOption = {
  id: string;
  full_name: string;
  freelancer_categories: { work_categories: RawCategoryRef | RawCategoryRef[] | null }[] | null;
};
// Godkendelsesstatus hører til freelancer_companies, ikke freelancer_profiles.
type RawFreelancerMembershipRow = {
  freelancer_profiles: RawFreelancerProfileOption | RawFreelancerProfileOption[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function AdminMessagesPage() {
  const supabase = await createClient();

  // Se dashboard-page.tsx for hvorfor company.id skal filtreres eksplicit.
  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const [messagesResult, categoriesResult, freelancersResult] = await Promise.all([
    supabase
      .from("messages")
      .select(
        `id, subject, body, sent_to_all, target_category_id, created_at,
         admin_users(full_name),
         work_categories(name),
         message_recipients(freelancer_id, read_at, freelancer_profiles(full_name))`
      )
      .eq("company_id", company.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_categories")
      .select("id, name")
      .eq("company_id", company.id)
      .order("name"),
    supabase
      .from("freelancer_companies")
      .select("freelancer_profiles(id, full_name, freelancer_categories(work_categories(name)))")
      .eq("company_id", company.id)
      .eq("application_status", "approved"),
  ]);

  if (messagesResult.error) {
    console.error("AdminMessagesPage: kunne ikke hente beskeder", messagesResult.error);
  }
  if (categoriesResult.error) {
    console.error("AdminMessagesPage: kunne ikke hente jobfunktioner", categoriesResult.error);
  }
  if (freelancersResult.error) {
    console.error("AdminMessagesPage: kunne ikke hente freelancere", freelancersResult.error);
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
        freelancerName: one(r.freelancer_profiles)?.full_name ?? "",
        read: r.read_at !== null,
      })),
    };
  });

  const categories: CategoryOption[] = ((categoriesResult.data ?? []) as RawCategoryRow[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const freelancers: FreelancerOption[] = ((freelancersResult.data ?? []) as RawFreelancerMembershipRow[])
    .map((m) => one(m.freelancer_profiles))
    .filter((f): f is RawFreelancerProfileOption => f !== null)
    .map((f) => {
      const cats = (f.freelancer_categories ?? [])
        .map((fc) => {
          const wc = fc.work_categories;
          if (!wc) return undefined;
          return Array.isArray(wc) ? wc[0]?.name : wc.name;
        })
        .filter((name: string | undefined): name is string => Boolean(name));
      return { id: f.id, fullName: f.full_name, categories: cats };
    });

  return <MessageBoard messages={messages} categories={categories} freelancers={freelancers} />;
}

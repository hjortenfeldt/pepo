import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { getShiftsBoardData } from "@/lib/shifts-data";
import EventDeepLinkView from "@/components/admin/EventDeepLinkView";

export const dynamic = "force-dynamic";

// Egen generateMetadata (i stedet for en statisk `metadata`-eksport), så
// browser-fanens titel bliver selve eventets navn — praktisk hvis admin har
// flere event-deep-links åbne i forskellige faner samtidig (fx fra flere
// kalender-notifikationer).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Event" };
}

/**
 * Dedikeret deep-link-side til ét enkelt event — se EventDeepLinkView.tsx
 * for hvorfor denne findes ved siden af den fulde /shifts-side (kalender-
 * feedets "REDIGÉR OPLYSNINGER"-link, se lib/ics.ts's editUrl-felt, peger
 * herhen i stedet for at åbne den fulde events-oversigt).
 *
 * Genbruger getShiftsBoardData (samme som /shifts) fremfor et separat,
 * smallere opslag kun for dette ene event — company.id skal filtreres
 * eksplicit uanset hvad (se getShiftsBoardData's egen kommentar om RLS +
 * superadmin support-besøg), og de øvrige lister (clients/categories/
 * freelancers) skal under alle omstændigheder hentes for at
 * ShiftWizardPanel/ShiftDetailPanel kan redigere eventet/vagterne.
 */
export default async function EventDeepLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const company = await getCompanyBySubdomain();
  if (!company) redirect("/login?error=unknown_company");

  const { events, clients, categories, freelancers } = await getShiftsBoardData(company.id);

  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  return (
    <EventDeepLinkView event={event} clients={clients} categories={categories} freelancers={freelancers} />
  );
}

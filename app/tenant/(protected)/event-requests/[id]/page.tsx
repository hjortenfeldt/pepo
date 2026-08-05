import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventRequestDetailForAdmin } from "../actions";
import EventRequestDetailClient from "@/components/admin/EventRequestDetailClient";

export const metadata: Metadata = { title: "Eventforespørgsel" };
export const dynamic = "force-dynamic";

export default async function AdminEventRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getEventRequestDetailForAdmin(id);
  if (!request) notFound();

  return <EventRequestDetailClient request={request} />;
}

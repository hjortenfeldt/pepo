import type { Metadata } from "next";
import { listEventRequests } from "./actions";
import EventRequestBoard from "@/components/admin/EventRequestBoard";

export const metadata: Metadata = { title: "Eventforespørgsler" };
export const dynamic = "force-dynamic";

export default async function AdminEventRequestsPage() {
  const requests = await listEventRequests();
  return <EventRequestBoard requests={requests} />;
}

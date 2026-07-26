import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { loadOpenShiftDetail } from "@/lib/freelancer-shift-detail";
import ShiftRequestDetail from "@/components/freelancer/ShiftRequestDetail";

export const dynamic = "force-dynamic";

// Fuld-side-varianten af Vagtdetaljer — bruges til direkte links (fx fra
// push-notifikationer), i modsætning til overlay-panel-varianten der åbnes
// fra Overblik-sidens "Mine vagter"/"Ledige vagter" (se
// components/freelancer/ShiftDetailPanel.tsx + getShiftDetail-server-
// action'en). Selve datahentningen er delt via lib/freelancer-shift-detail.ts
// så de to indgange ikke kan gå ud af sync.
export default async function OpenShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const detail = await loadOpenShiftDetail(supabase, user.id, id);

  // Vagten findes ikke (forkert/gammelt link), eller RLS'en afviser den
  // (fx en kategori freelanceren ikke er godkendt i) — tilbage til Overblik
  // frem for en forvirrende tom side.
  if (!detail) {
    redirect("/");
  }

  return <ShiftRequestDetail shift={detail} />;
}

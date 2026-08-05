import type { Metadata } from "next";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { getEventRequestStatus } from "./actions";
import EventRequestStatusClient from "@/components/EventRequestStatusClient";

// Samme begrundelse som /request/page.tsx — ellers arver browserfanen root
// layout.tsx's "Pepo – Bliv freelancer"-titel, skrevet til /apply.
export const metadata: Metadata = { title: "Pepo – Forespørgsel" };

export const dynamic = "force-dynamic";

/**
 * Klientens egen status/dialog-side for en indsendt eventforespørgsel — fx
 * kulturbyen.pepo.team/request/status/3f2a…, linket vist på kvitteringen
 * lige efter indsendelse (se EventRequestForm.tsx's SuccessScreen). Adgang
 * er alene via det unguessable token i URL'en, ingen login (se
 * [[project_event_request_feature]]).
 */
export default async function EventRequestStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const company = await getCompanyBySubdomain();
  const request = company ? await getEventRequestStatus(token) : null;

  if (!company || !request) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F0EDF8] p-8">
        <div className="bg-pepo-wh rounded-[20px] w-full max-w-[420px] p-8 text-center shadow-[0_4px_32px_rgba(62,31,138,0.10)]">
          <div className="text-[18px] font-semibold text-pepo-t1 mb-1.5">Kunne ikke finde forespørgslen</div>
          <div className="text-[13.5px] text-pepo-t2">
            Tjek at du har det rigtige link, eller kontakt virksomheden.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-[var(--page-px)] py-8 bg-[#F0EDF8] min-h-screen">
      <EventRequestStatusClient
        request={request}
        token={token}
        companyName={company.name}
        companyLogoUrl={company.logo_url}
      />
    </main>
  );
}

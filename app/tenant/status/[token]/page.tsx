import type { Metadata } from "next";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { getEventStatus } from "./actions";
import EventRequestStatusClient from "@/components/EventRequestStatusClient";
import EventOnlyStatusClient from "@/components/EventOnlyStatusClient";

// Samme begrundelse som /request/page.tsx — ellers arver browserfanen root
// layout.tsx's "Pepo – Bliv freelancer"-titel, skrevet til /apply.
export const metadata: Metadata = { title: "Pepo – Forespørgsel" };

export const dynamic = "force-dynamic";

/**
 * Klientens egen status/dialog-side — generaliseret til at dække BÅDE en
 * indsendt eventforespørgsel OG et event oprettet helt uden om nogen
 * forespørgsel (fx booket over telefonen), se lib/event-status.ts. Adgang er
 * alene via det unguessable token i URL'en, ingen login.
 *
 * Hed oprindeligt /request/status/[token] — det gamle link redirecter
 * hertil, se dens page.tsx.
 */
export default async function EventStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const company = await getCompanyBySubdomain();
  const status = company ? await getEventStatus(token) : null;

  if (!company || !status) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F0EDF8] p-8">
        <div className="bg-pepo-wh rounded-[20px] w-full max-w-[420px] p-8 text-center shadow-[0_4px_32px_rgba(62,31,138,0.10)]">
          <div className="text-[18px] font-semibold text-pepo-t1 mb-1.5">Kunne ikke finde eventet</div>
          <div className="text-[13.5px] text-pepo-t2">
            Tjek at du har det rigtige link, eller kontakt virksomheden.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-[var(--page-px)] py-8 bg-[#F0EDF8] min-h-screen">
      {status.kind === "request" ? (
        <EventRequestStatusClient
          request={status.request}
          token={token}
          companyName={company.name}
          companyLogoUrl={company.logo_url}
        />
      ) : (
        <EventOnlyStatusClient
          event={status.event}
          token={token}
          companyName={company.name}
          companyLogoUrl={company.logo_url}
        />
      )}
    </main>
  );
}

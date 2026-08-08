import type { Metadata } from "next";
import { getCompanyBySubdomain } from "@/lib/tenant";
import { getCategoriesForRequest, submitEventRequest } from "./actions";
import EventRequestForm from "@/components/EventRequestForm";
import EmbedAutoHeight from "@/components/EmbedAutoHeight";

// Uden denne ville browserfanens titel falde tilbage til root layout.tsx's
// default ("Pepo – Bliv freelancer", skrevet til /apply) — helt misvisende
// for en kundes eventforespørgsel (Hjorth 2026-08-06).
export const metadata: Metadata = { title: "Pepo – Forespørgsel" };

// Jobfunktioner/priser kan ændres i adminsystemet når som helst, og
// virksomheden afgøres af subdomænet på selve requestet — ingen statisk
// caching, samme som /apply.
export const dynamic = "force-dynamic";

/**
 * Offentlig eventforespørgselsside pr. virksomhed, fx
 * kulturbyen.pepo.team/request — kommende/potentielle kunder kan selv regne
 * en pris ud og sende en forespørgsel om personale til et event, uden login.
 * Ligger uden for (protected)-gruppen, ligesom /apply — se proxy.ts's
 * offentlige-side-undtagelser.
 */
export default async function TenantEventRequestPage() {
  const company = await getCompanyBySubdomain();

  if (!company) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F0EDF8] p-8">
        <EmbedAutoHeight />
        <div className="bg-pepo-wh rounded-[20px] w-full max-w-[420px] p-8 text-center shadow-[0_4px_32px_rgba(62,31,138,0.10)]">
          <div className="text-[18px] font-semibold text-pepo-t1 mb-1.5">
            Der findes ikke et Pepo-system på dette domæne
          </div>
          <div className="text-[13.5px] text-pepo-t2">
            Tjek at du har det rigtige link fra virksomheden, og prøv igen.
          </div>
        </div>
      </main>
    );
  }

  const categories = await getCategoriesForRequest();

  return (
    <main className="flex-1 flex items-center justify-center px-[var(--page-px)] py-8 bg-[#F0EDF8] min-h-screen">
      <EmbedAutoHeight />
      <EventRequestForm
        categories={categories}
        companyName={company.name}
        companyLogoUrl={company.logo_url}
        onSubmit={submitEventRequest}
      />
    </main>
  );
}

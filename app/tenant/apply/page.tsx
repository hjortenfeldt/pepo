import { getCompanyBySubdomain } from "@/lib/tenant";
import { getTenantWorkCategories, submitTenantApplication } from "./actions";
import RegistrationForm from "@/components/RegistrationForm";

// Kategorierne kan ændres i adminsystemet når som helst, og virksomheden
// afgøres af subdomænet på selve requestet — ingen statisk caching.
export const dynamic = "force-dynamic";

/**
 * Offentlig ansøgningsside pr. virksomhed, fx kulturbyen.pepo.team/apply.
 * Ligger uden for (protected)-gruppen (se app/tenant/(protected)/layout.tsx)
 * og er derfor ikke omfattet af login-kravet — se proxy.ts's
 * isPublicApplicationPage-undtagelse, som lader uautoriserede besøgende nå
 * herhen på tværs af alle virksomheders subdomæner.
 */
export default async function TenantApplicationPage() {
  const company = await getCompanyBySubdomain();

  if (!company) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F0EDF8] p-8">
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

  const categories = await getTenantWorkCategories();

  return (
    <main className="flex-1 flex items-center justify-center p-8 bg-[#F0EDF8] min-h-screen">
      <RegistrationForm
        categories={categories}
        companyName={company.name}
        onSubmit={submitTenantApplication}
      />
    </main>
  );
}

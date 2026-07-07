import LoginForm from "./LoginForm";
import { getCompanyBySubdomain } from "@/lib/tenant";

const ERROR_MESSAGES: Record<string, string> = {
  not_admin: "Din konto har ikke adgang til adminsystemet. Kontakt en administrator.",
  wrong_company: "Din konto hører til en anden virksomhed. Log ind på jeres eget subdomæne.",
  unknown_company: "Der findes ikke et Pepo-system på dette domæne.",
};

export default async function TenantLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error ? ERROR_MESSAGES[params.error] ?? null : null;
  const company = await getCompanyBySubdomain();

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F0EDF8] p-8">
      <LoginForm initialError={initialError} companyName={company?.name ?? null} />
    </main>
  );
}

import SuperAdminLoginForm from "./LoginForm";

const ERROR_MESSAGES: Record<string, string> = {
  not_super_admin: "Din konto har ikke adgang til super-admin-systemet.",
};

export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error ? ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#EDEDF2] p-8">
      <SuperAdminLoginForm initialError={initialError} />
    </main>
  );
}

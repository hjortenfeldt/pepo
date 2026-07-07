import { redirect } from "next/navigation";

// Denne route er udfaset — adminsystemet ligger nu på virksomhedens eget
// subdomæne (fx kulturbyen.pepo.team/login) i stedet for /admin/login.
// Filen kan ikke slettes fra dette miljø, så den omdirigerer i stedet.
export default async function LegacyAdminLoginRedirect() {
  redirect("/login");
}

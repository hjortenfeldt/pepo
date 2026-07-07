import { redirect } from "next/navigation";

// Denne route er udfaset — adminsystemet ligger nu på virksomhedens eget
// subdomæne (fx kulturbyen.pepo.team) i stedet for /admin/*. Filen kan
// ikke slettes fra dette miljø, så hele undertræet omdirigerer i stedet.
export default async function LegacyAdminRedirectLayout() {
  redirect("/");
}

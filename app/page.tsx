/**
 * Den rene pepo.team (uden subdomæne, uden noget efter "/") er Pepos
 * offentlige markedsføringsside — målrettet virksomheder, der overvejer at
 * bruge Pepo, ikke individuelle freelancere. Ansøgning som freelancer sker
 * i stedet på hver virksomheds eget subdomæne (fx kulturbyen.pepo.team/apply,
 * se app/tenant/apply/), da det er dér virksomheden allerede er kendt.
 *
 * Dette er en bevidst simpel placeholder — den rigtige markedsføringsside
 * bygges senere, når freelancer-appen er færdig. Se [[project_pepo_marketing_page_todo]].
 */
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F0EDF8] p-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/pepo-logo.svg" alt="Pepo" className="w-[240px] h-[240px]" />
    </main>
  );
}

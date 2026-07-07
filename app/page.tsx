import { getWorkCategories } from "@/app/actions";
import RegistrationForm from "@/components/RegistrationForm";

// Kategorierne kan ændres i adminsystemet når som helst, så siden skal
// altid hente friske data — ingen statisk caching af denne side.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const categories = await getWorkCategories();

  return (
    <main className="flex-1 flex items-center justify-center p-8 bg-[#F0EDF8] min-h-screen">
      <RegistrationForm categories={categories} />
    </main>
  );
}

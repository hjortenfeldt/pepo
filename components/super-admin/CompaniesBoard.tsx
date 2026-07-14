"use client";

import { useEffect, useState, useTransition } from "react";
import { createCompany, inviteCompanyAdmin } from "@/app/super-admin/(protected)/actions";

export type CompanyListItem = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  adminCount: number;
  freelancerCount: number;
};

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";

// Genkender om siden selv kører lokalt (fx admin.localhost:3000) i stedet
// for på den rigtige server, så "Åbn"-links peger det rigtige sted hen
// uanset hvor man arbejder fra. Starter som "false" (samme som server-
// renderingen) og opdateres først efter mount, for at undgå at klient og
// server viser forskelligt HTML ved første render (hydration-fejl).
function useLocalDevOrigin() {
  const [origin, setOrigin] = useState<{ isLocal: boolean; port: string }>({
    isLocal: false,
    port: "",
  });

  useEffect(() => {
    // Sat i et resolved promise fremfor direkte i effekten, så React ikke ser
    // det som en synkron setState-kædning (matcher mønstret fra
    // InstallGate.tsx/PushToggle.tsx).
    Promise.resolve().then(() => {
      setOrigin({
        isLocal: window.location.hostname.endsWith("localhost"),
        port: window.location.port,
      });
    });
  }, []);

  return origin;
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function NewCompanyForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCompany(name, slug || slugify(name));
      if (!result.success) {
        setError(result.error);
        return;
      }
      setName("");
      setSlug("");
      setSlugTouched(false);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-pepo-wh border border-pepo-bds rounded-[16px] p-5 flex flex-wrap items-end gap-3"
    >
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[13px] font-medium text-pepo-t1 mb-1">Virksomhedsnavn</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Kulturbyen ApS"
          required
          className="w-full border border-pepo-bds rounded-[10px] px-3 py-2 text-sm text-pepo-t1 outline-none focus:border-pepo-p"
        />
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[13px] font-medium text-pepo-t1 mb-1">Subdomæne</label>
        <div className="flex items-center border border-pepo-bds rounded-[10px] overflow-hidden focus-within:border-pepo-p">
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="kulturbyen"
            required
            className="flex-1 px-3 py-2 text-sm text-pepo-t1 outline-none"
          />
          <span className="pr-3 text-sm text-pepo-t3 whitespace-nowrap">.{ROOT_DOMAIN}</span>
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-[40px] px-4 rounded-[10px] text-sm font-medium bg-pepo-p text-white hover:opacity-90 disabled:opacity-40"
      >
        {isPending ? "Opretter..." : "Opret virksomhed"}
      </button>
      {error && <p className="w-full text-[13px] text-red-600">{error}</p>}
    </form>
  );
}

function InviteAdminForm({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-pepo-p hover:underline">
        + Tilføj admin
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteCompanyAdmin(companyId, fullName, email);
      if (!result.success) {
        setError(result.error ?? "Kunne ikke oprette admin.");
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return <p className="text-sm text-green-700">Admin oprettet — {email} kan nu nulstille sin adgangskode.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 mt-2">
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Fulde navn"
        required
        className="border border-pepo-bds rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-pepo-p"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@virksomhed.dk"
        required
        className="border border-pepo-bds rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-pepo-p"
      />
      <button
        type="submit"
        disabled={isPending}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-pepo-t1 text-white hover:opacity-90 disabled:opacity-40"
      >
        {isPending ? "Opretter..." : "Opret"}
      </button>
      {error && <p className="w-full text-[13px] text-red-600">{error}</p>}
    </form>
  );
}

export default function CompaniesBoard({ companies }: { companies: CompanyListItem[] }) {
  const { isLocal, port } = useLocalDevOrigin();

  function tenantUrl(slug: string) {
    return isLocal ? `http://${slug}.localhost:${port}` : `https://${slug}.${ROOT_DOMAIN}`;
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-medium text-pepo-t1 mb-1">Virksomheder</h1>
        <p className="text-sm text-pepo-t2">
          Alle virksomheder, der abonnerer på Pepo — inkl. Pepo selv.
        </p>
      </div>

      <NewCompanyForm />

      <div className="flex flex-col gap-3">
        {companies.map((c) => (
          <div key={c.id} className="bg-pepo-wh border border-pepo-bds rounded-[16px] p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-lg font-medium text-pepo-t1">{c.name}</div>
                <a
                  href={tenantUrl(c.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-pepo-p hover:underline"
                >
                  {c.slug}.{ROOT_DOMAIN}
                </a>
              </div>
              <div className="flex items-center gap-5 text-sm text-pepo-t2">
                <span>{c.adminCount} admin{c.adminCount === 1 ? "" : "s"}</span>
                <span>{c.freelancerCount} freelancer{c.freelancerCount === 1 ? "" : "e"}</span>
                <a
                  href={tenantUrl(c.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-pepo-su text-pepo-t1 border border-pepo-bds hover:bg-pepo-bds/40"
                >
                  Åbn (support)
                </a>
              </div>
            </div>
            <div className="mt-3">
              <InviteAdminForm companyId={c.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

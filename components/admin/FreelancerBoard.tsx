"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationStatus, FreelancerListItem } from "@/lib/admin-types";
import { setApplicationStatus } from "@/app/admin/(protected)/freelancers/actions";

type Tab = "pending" | "approved" | "rejected" | "all";

const TAB_LABELS: Record<Tab, string> = {
  pending: "Afventer godkendelse",
  approved: "Godkendt",
  rejected: "Afvist",
  all: "Alle",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ageFromBirthDate(iso: string) {
  const birth = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function Badge({ status }: { status: ApplicationStatus }) {
  if (status === "pending")
    return <span className="badge bg-pepo-pl text-pepo-p">Afventer</span>;
  if (status === "approved")
    return <span className="badge bg-[#EAF6EE] text-[#1A7A34]">Godkendt</span>;
  return <span className="badge bg-[#FDECEA] text-[#C0021A]">Afvist</span>;
}

export default function FreelancerBoard({
  freelancers,
}: {
  freelancers: FreelancerListItem[];
}) {
  const [tab, setTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const counts = useMemo(
    () => ({
      pending: freelancers.filter((f) => f.applicationStatus === "pending").length,
      approved: freelancers.filter((f) => f.applicationStatus === "approved").length,
      rejected: freelancers.filter((f) => f.applicationStatus === "rejected").length,
      all: freelancers.length,
    }),
    [freelancers]
  );

  const filtered = useMemo(() => {
    let list = freelancers;
    if (tab !== "all") list = list.filter((f) => f.applicationStatus === tab);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.fullName.toLowerCase().includes(q) ||
          (f.location ?? "").toLowerCase().includes(q) ||
          (f.phone ?? "").toLowerCase().includes(q) ||
          (f.email ?? "").toLowerCase().includes(q) ||
          f.categories.some((c) => c.toLowerCase().includes(q))
      );
    }
    return list;
  }, [freelancers, tab, search]);

  const open = freelancers.find((f) => f.id === openId) ?? null;

  function decide(status: "approved" | "rejected") {
    if (!openId) return;
    setError(null);
    startTransition(async () => {
      const result = await setApplicationStatus(openId, status);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="px-8 pt-[22px]">
        <div className="flex items-start justify-between mb-[18px]">
          <div>
            <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">
              Freelancere
            </div>
            <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
              Godkend ansøgninger og administrér freelancerprofiler
            </div>
          </div>
          <div className="relative w-[260px]">
            <i className="ti ti-search absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-pepo-t3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg navn, by, kategori, telefon eller email..."
              className="w-full h-[38px] border border-pepo-bds rounded-[9px] pl-[34px] pr-3 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-pepo-bd px-8">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "py-2.5 mr-[22px] text-[13.5px] font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors " +
              (tab === t
                ? "text-pepo-p border-pepo-p"
                : "text-pepo-t2 border-transparent hover:text-pepo-t1")
            }
          >
            {TAB_LABELS[t]}
            <span
              className={
                "text-[11px] font-medium px-[7px] py-[1px] rounded-full " +
                (tab === t ? "bg-pepo-pl text-pepo-p" : "bg-pepo-su text-pepo-t2")
              }
            >
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-[22px] pb-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
            <i className="ti ti-inbox text-[32px] mb-2.5" />
            <span className="text-[13.5px]">Ingen freelancere i denne visning</span>
          </div>
        ) : (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => setOpenId(f.id)}
                className="text-left bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-[42px] h-[42px] rounded-full bg-pepo-pl text-pepo-p text-sm font-medium flex items-center justify-center overflow-hidden flex-shrink-0">
                      {f.profileImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.profileImageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        initials(f.fullName)
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-pepo-t1">{f.fullName}</div>
                      <div className="text-xs text-pepo-t2 mt-px">{f.location || "—"}</div>
                    </div>
                  </div>
                  <Badge status={f.applicationStatus} />
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {f.categories.length ? (
                    f.categories.map((c) => (
                      <span key={c} className="bg-pepo-su text-pepo-t2 text-[11px] font-medium px-[9px] py-[3px] rounded-full">
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-pepo-t3">Ingen kategorier valgt</span>
                  )}
                </div>
                <div className="flex flex-col gap-[5px] text-xs text-pepo-t2 border-t border-pepo-bd pt-[11px]">
                  <div className="flex items-center gap-1.5">
                    <i className="ti ti-phone text-[13px] text-pepo-t3 w-3.5" />
                    {f.phone}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <i className="ti ti-calendar text-[13px] text-pepo-t3 w-3.5" />
                    Ansøgt {formatDate(f.appliedAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Slide-over panel */}
      <div
        className={
          "fixed inset-0 bg-[#1D1D1F]/30 transition-opacity z-10 " +
          (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={() => setOpenId(null)}
      />
      <div
        className={
          "fixed top-0 right-0 bottom-0 w-[420px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform z-20 flex flex-col " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        {open && (
          <>
            <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
              <span className="text-sm font-medium">Freelancerprofil</span>
              <button
                onClick={() => setOpenId(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su"
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-6">
              <div className="w-[72px] h-[72px] rounded-full bg-pepo-pl text-pepo-p text-2xl font-medium flex items-center justify-center mx-auto mb-2.5 overflow-hidden">
                {open.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={open.profileImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials(open.fullName)
                )}
              </div>
              <div className="text-center text-lg font-medium tracking-tight">{open.fullName}</div>
              <div className="text-center text-[12.5px] text-pepo-t2 mt-0.5">
                {open.location || "—"} · {ageFromBirthDate(open.birthDate)} år
              </div>
              <div className="flex justify-center flex-wrap gap-1.5 my-3">
                {open.categories.map((c) => (
                  <span key={c} className="bg-pepo-su text-pepo-t2 text-[11px] font-medium px-[9px] py-[3px] rounded-full">
                    {c}
                  </span>
                ))}
              </div>

              <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2 mt-4">
                Kontakt
              </div>
              <Row icon="mail" label="Email" value={open.email || "—"} />
              <Row icon="phone" label="Mobil" value={open.phone} />
              {open.socialMediaUrl && (
                <Row icon="brand-instagram" label="SoMe" value={open.socialMediaUrl} />
              )}

              <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2 mt-[18px]">
                Om
              </div>
              <Row icon="notes" value={open.bio || "Ingen beskrivelse angivet."} />

              <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2 mt-[18px]">
                Ansøgning
              </div>
              <Row icon="calendar" label="Ansøgt" value={formatDate(open.appliedAt)} />
              <Row icon="gender-bigender" label="Køn" value={open.gender || "—"} />
              <div className="h-4" />
            </div>

            {error && (
              <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {open.applicationStatus === "pending" ? (
              <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0 flex gap-2.5">
                <button
                  onClick={() => decide("rejected")}
                  disabled={isPending}
                  className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-wh text-[#C0021A] border border-[#F3C9C9] disabled:opacity-40"
                >
                  Afvis
                </button>
                <button
                  onClick={() => decide("approved")}
                  disabled={isPending}
                  className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-[#1A7A34] text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <i className="ti ti-check" />
                  {isPending ? "Gemmer..." : "Godkend ansøgning"}
                </button>
              </div>
            ) : (
              <div
                className={
                  "mx-6 mb-[22px] px-3 py-2.5 rounded-[9px] text-[12.5px] flex items-center gap-2 " +
                  (open.applicationStatus === "approved"
                    ? "bg-[#EAF6EE] text-[#1A7A34]"
                    : "bg-[#FDECEA] text-[#C0021A]")
                }
              >
                <i className={"ti " + (open.applicationStatus === "approved" ? "ti-circle-check" : "ti-circle-x")} />
                Denne ansøgning er allerede {open.applicationStatus === "approved" ? "godkendt" : "afvist"}
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .badge {
          display: inline-flex;
          padding: 3px 9px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

function Row({ icon, label, value }: { icon: string; label?: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-pepo-bd last:border-none">
      <i className={`ti ti-${icon} text-base text-pepo-t3 mt-px w-4 flex-shrink-0`} />
      <div>
        {label && (
          <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">{label}</div>
        )}
        <div className="text-[13.5px] text-pepo-t1 mt-px leading-relaxed">{value}</div>
      </div>
    </div>
  );
}

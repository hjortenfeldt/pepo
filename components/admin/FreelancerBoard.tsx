"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationStatus, CategoryOption, FreelancerListItem } from "@/lib/admin-types";
import {
  setApplicationStatus,
  createFreelancer,
  updateFreelancer,
  deleteFreelancer,
  sendFreelancerInvitation,
  type FreelancerFormInput,
} from "@/app/tenant/(protected)/freelancers/actions";
import Icon from "@/components/Icon";
import { lastActiveLabel, lastActivePhrase } from "@/lib/format";
import { AddressAutocompleteInput, type ResolvedAddressResult } from "@/components/AddressAutocompleteInput";

// Freelancer-lokation skal kun matche by/postnummer-niveau, ikke en fuld
// gadeadresse — feltet er bevidst grovere end kunde/venue- og
// virksomhedsadresserne (se [[project_address_soft_validation_feature]]).
const LOCATION_TYPES = ["locality", "postal_code"];

type MainTab = "approved" | "applications";
type SubTab = "pending" | "rejected";
type ViewMode = "grid" | "list";
type PanelMode = "view" | "create" | "edit";

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

function ageFromBirthDate(iso: string | null) {
  if (!iso) return null;
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
    return <span className="badge bg-[#FDECEA] text-[#C0021A]">Afventer</span>;
  if (status === "approved")
    return <span className="badge bg-[#EAF6EE] text-[#1A7A34]">Godkendt</span>;
  return <span className="badge bg-[#FDECEA] text-[#C0021A]">Afvist</span>;
}

function emptyForm(): FreelancerFormInput {
  return {
    fullName: "",
    gender: "",
    birthDate: "",
    phone: "",
    email: "",
    location: "",
    bio: "",
    socialMediaUrl: "",
    categoryIds: [],
    hasLicense: false,
    photoDataUrl: null,
  };
}

export default function FreelancerBoard({
  freelancers,
  allCategories,
}: {
  freelancers: FreelancerListItem[];
  allCategories: CategoryOption[];
}) {
  const [mainTab, setMainTab] = useState<MainTab>("approved");
  const [subTab, setSubTab] = useState<SubTab>("pending");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [form, setForm] = useState<FreelancerFormInput>(emptyForm());
  // Adressen (form.location) opdateres kun ved et bekræftet valg fra
  // Google-dropdown'en — addressText er den viste søgetekst, som kan være
  // midt i at blive redigeret uden endnu at være valideret.
  const [locationText, setLocationText] = useState("");
  const [locationValidated, setLocationValidated] = useState(false);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // "Send invitation"-status er bevidst delt fælles state for HELE
  // komponenten (ikke pr. panel) — samme freelancer kan vises på tre
  // steder samtidig (kort, liste, profilpanel), og et klik ét sted skal
  // afspejles synkront alle tre steder. Nulstilles ikke ved
  // panel-åbning/lukning, kun ved en fuld sideopdatering (nyt props-load).
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isSendingInvite, startInviteTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // autoFocus virker kun ved selve mount af elementet — inputtet er altid i
  // DOM'en (bredden animeres blot fra 0 til 300px), så det fanger ikke et
  // efterfølgende åbn/luk. Sætter derfor cursoren manuelt, hver gang
  // søgefeltet foldes ud, så man kan skrive med det samme uden et ekstra klik.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Skifter man visning (kort/liste), nulstilles en evt. aktiv søgning, så
  // det nye view altid starter fra sit eget standardindhold (faneblade +
  // job-labels synlige igen) i stedet for at bevare søgeresultater fra det
  // forrige view. Samme mønster i ShiftBoard.tsx og ClientBoard.tsx.
  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    setSearch("");
    setSearchOpen(false);
  }

  const counts = useMemo(
    () => ({
      pending: freelancers.filter((f) => f.applicationStatus === "pending").length,
      approved: freelancers.filter((f) => f.applicationStatus === "approved").length,
      rejected: freelancers.filter((f) => f.applicationStatus === "rejected").length,
    }),
    [freelancers]
  );

  const approvedList = useMemo(
    () => freelancers.filter((f) => f.applicationStatus === "approved"),
    [freelancers]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Søgning ignorerer bevidst fanen (godkendt/afventer/afvist) OG det
    // valgte jobfunktions-filter — den skal kunne finde EN HVILKEN SOM HELST
    // freelancer, uanset status og kategori, i stedet for kun at søge
    // indenfor den aktuelt viste fane.
    if (q) {
      return freelancers.filter(
        (f) =>
          f.fullName.toLowerCase().includes(q) ||
          (f.location ?? "").toLowerCase().includes(q) ||
          (f.phone ?? "").toLowerCase().includes(q) ||
          (f.email ?? "").toLowerCase().includes(q) ||
          f.categories.some((c) => c.name.toLowerCase().includes(q))
      );
    }
    if (mainTab === "approved") {
      let list = approvedList;
      if (selectedCats.length > 0) {
        list = list.filter((f) => f.categories.some((c) => selectedCats.includes(c.id)));
      }
      return list;
    }
    return freelancers.filter((f) => f.applicationStatus === subTab);
  }, [freelancers, approvedList, mainTab, subTab, selectedCats, search]);

  const open = openId ? freelancers.find((f) => f.id === openId) ?? null : null;

  // Bruges alle tre steder en freelancer kan vises (kort, liste,
  // profilpanel) — se invitedIds/sendingId ovenfor. "Har aldrig været
  // aktiv" afgøres af freelancer_profiles.last_active_at (sat af
  // freelancer-appens layout, se touchProfileActivity i lib/freelancer.ts)
  // i stedet for et separat Auth-opslag — det er allerede en del af de
  // props siden får ind, så det kræver ikke noget ekstra kald pr. freelancer.
  function sendInvitationFor(freelancerId: string) {
    setError(null);
    setSendingId(freelancerId);
    startInviteTransition(async () => {
      const result = await sendFreelancerInvitation(freelancerId);
      setSendingId(null);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setInvitedIds((prev) => {
        const next = new Set(prev);
        next.add(freelancerId);
        return next;
      });
    });
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearch("");
  }

  function toggleCatFilter(catId: string | null) {
    if (catId === null) {
      setSelectedCats([]);
      return;
    }
    setSelectedCats((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  }

  function openPanelFor(f: FreelancerListItem) {
    setOpenId(f.id);
    setPanelMode("view");
    setError(null);
    setConfirmingDelete(false);
  }

  function closePanel() {
    setOpenId(null);
    setPanelMode("view");
    setError(null);
    setConfirmingDelete(false);
  }

  function openNewFreelancer() {
    setOpenId(null);
    setPanelMode("create");
    setForm(emptyForm());
    setExistingPhotoUrl(null);
    setShowPhotoUpload(true);
    setError(null);
    setLocationText("");
    setLocationValidated(false);
  }

  function openEditFreelancer() {
    if (!open) return;
    const location = open.location ?? "";
    setForm({
      fullName: open.fullName,
      gender: open.gender ?? "",
      birthDate: open.birthDate ?? "",
      phone: open.phone,
      email: open.email ?? "",
      location,
      bio: open.bio ?? "",
      socialMediaUrl: open.socialMediaUrl ?? "",
      categoryIds: open.categories.map((c) => c.id),
      hasLicense: open.hasLicense,
      photoDataUrl: null,
    });
    setExistingPhotoUrl(open.profileImageUrl);
    setShowPhotoUpload(!open.profileImageUrl);
    setPanelMode("edit");
    setError(null);
    setConfirmingDelete(false);
    setLocationText(location);
    // Allerede-gemt lokation regnes som gyldig, indtil brugeren selv rører
    // feltet — vi genvalidér ikke gamle data bare for at redigere fx bio.
    setLocationValidated(location.trim().length > 0);
  }

  function handleLocationSelected(result: ResolvedAddressResult) {
    setForm((f) => ({ ...f, location: result.formatted }));
    setLocationText(result.formatted);
    setLocationValidated(true);
  }

  const hasUnvalidatedLocation = locationText.trim().length > 0 && !locationValidated;

  function handleDelete() {
    if (!openId) return;
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteFreelancer(openId);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        setConfirmingDelete(false);
        return;
      }
      closePanel();
      router.refresh();
    });
  }

  function toggleFormCat(catId: string) {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(catId)
        ? f.categoryIds.filter((c) => c !== catId)
        : [...f.categoryIds, catId],
    }));
  }

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm((f) => ({ ...f, photoDataUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  }

  function decide(status: "approved" | "rejected") {
    if (!openId) return;
    setError(null);
    startTransition(async () => {
      const result = await setApplicationStatus(openId, status);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      closePanel();
      router.refresh();
    });
  }

  function saveNewFreelancer() {
    setError(null);
    if (!form.fullName.trim()) {
      setError("Udfyld navn");
      return;
    }
    if (!form.birthDate) {
      setError("Udfyld fødselsdato");
      return;
    }
    if (form.categoryIds.length === 0) {
      setError("Vælg mindst én jobfunktion");
      return;
    }
    startTransition(async () => {
      // Ingen adresse-afventning nødvendig her længere — Gem-knappen er
      // disabled (se hasUnvalidatedLocation), indtil lokationen allerede er
      // bekræftet via et Google-valg.
      const result = await createFreelancer(form);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      // Åbner den nyoprettede freelancers egen profil (i stedet for bare
      // at lukke panelet) — det er her "Send invitation" er tilgængelig,
      // og admin kan sende den med det samme uden at skulle finde
      // freelanceren i listen bagefter.
      setPanelMode("view");
      setOpenId(result.id);
      router.refresh();
    });
  }

  function saveEditFreelancer() {
    if (!openId) return;
    setError(null);
    if (!form.fullName.trim()) {
      setError("Udfyld navn");
      return;
    }
    if (!form.birthDate) {
      setError("Udfyld fødselsdato");
      return;
    }
    if (form.categoryIds.length === 0) {
      setError("Vælg mindst én jobfunktion");
      return;
    }
    startTransition(async () => {
      // Se kommentar i saveNewFreelancer().
      const result = await updateFreelancer(openId, form);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setPanelMode("view");
      router.refresh();
    });
  }

  const panelIsOpen = panelMode === "create" || open !== null;

  return (
    <div className="flex flex-col">
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
          <button
            onClick={openNewFreelancer}
            className="h-[38px] px-4 rounded-[9px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Icon name="plus" size={17} />
            Opret freelancer
          </button>
        </div>
      </div>

      <div className="border-t border-pepo-bd" />
      <div className="flex items-center gap-2 px-8 py-4">
        {/* Flyttet op over fanebladene, så toggle-knapperne sidder samme sted
            uanset hvilken fane/visning man står på — matcher mønsteret i
            ShiftBoard.tsx. Samlet view-toggle med samme tynde stroke/rounding
            som søge-knappen (border-pepo-bds, rounded-[9px]) i stedet for den
            tidligere udfyldte bg-pepo-su-baggrund, så de to knapper visuelt
            fremstår som ÉN samlet funktion ved siden af søgningen. */}
        <div className="flex border border-pepo-bds rounded-[9px] bg-pepo-wh p-[3px] gap-0.5 flex-shrink-0">
          <button
            title="Kortvisning"
            onClick={() => changeViewMode("grid")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center text-[16px] transition-colors " +
              (viewMode === "grid" ? "bg-pepo-su text-pepo-p" : "text-pepo-t2 hover:text-pepo-t1")
            }
          >
            <Icon name="layout-grid" size={20} />
          </button>
          <button
            title="Listevisning"
            onClick={() => changeViewMode("list")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center text-[16px] transition-colors " +
              (viewMode === "list" ? "bg-pepo-su text-pepo-p" : "text-pepo-t2 hover:text-pepo-t1")
            }
          >
            <Icon name="list" size={20} />
          </button>
        </div>

        <div className="relative w-[38px] h-[38px] flex-shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Søg"
            className="w-[38px] h-[38px] rounded-[9px] border border-pepo-bds bg-pepo-wh text-pepo-t2 flex items-center justify-center hover:bg-pepo-su"
          >
            <Icon name="search" size={20} />
          </button>
          <div
            className={
              "absolute top-0 left-0 h-[38px] overflow-hidden border rounded-[9px] bg-pepo-wh transition-[width] duration-150 ease-out z-[5] " +
              (searchOpen
                ? "w-[300px] border-pepo-bds opacity-100 pointer-events-auto"
                : "w-0 border-transparent opacity-0 pointer-events-none")
            }
          >
            <Icon name="search" size={19} className="absolute left-[11px] top-1/2 -translate-y-1/2 text-pepo-t3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg..."
              className="w-full h-full border-none outline-none px-[34px] text-[13.5px] bg-transparent"
            />
            <div
              onClick={closeSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-[6px] flex items-center justify-center cursor-pointer text-pepo-t3 hover:bg-pepo-su hover:text-pepo-t1"
            >
              <Icon name="x" size={20} />
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-pepo-bd" />

      {/* Fanebladene og job-labels skjules, mens søgningen er foldet ud —
          søgning kigger jo bevidst på tværs af status/jobfunktion (se
          filtered ovenfor), så de giver ikke mening at vise samtidig. De
          kommer tilbage, når søgefeltet foldes ind igen (krydset nulstiller
          searchOpen). */}
      {!searchOpen && (
        <div className="flex gap-1.5 border-b border-pepo-bd px-8">
          <button
            onClick={() => setMainTab("approved")}
            className={
              "py-2.5 mr-[22px] text-[13.5px] font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors " +
              (mainTab === "approved"
                ? "text-pepo-p border-pepo-p"
                : "text-pepo-t2 border-transparent hover:text-pepo-t1")
            }
          >
            Godkendte freelancere
            <span
              className={
                "text-[11px] font-medium px-[7px] py-[1px] rounded-full " +
                (mainTab === "approved" ? "bg-pepo-pl text-pepo-p" : "bg-pepo-su text-pepo-t2")
              }
            >
              {counts.approved}
            </span>
          </button>
          <button
            onClick={() => setMainTab("applications")}
            className={
              "py-2.5 mr-[22px] text-[13.5px] font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors " +
              (mainTab === "applications"
                ? "text-pepo-p border-pepo-p"
                : "text-pepo-t2 border-transparent hover:text-pepo-t1")
            }
          >
            Ansøgninger
            {counts.pending > 0 && (
              <span className="bg-[#C0021A] text-white text-[11px] font-bold min-w-[18px] h-[18px] rounded-full inline-flex items-center justify-center px-1 leading-none">
                {counts.pending}
              </span>
            )}
          </button>
        </div>
      )}

      {mainTab === "applications" && !searchOpen && (
        <div className="flex items-center gap-2 px-8 py-3.5 flex-wrap">
          <button
            onClick={() => setSubTab("pending")}
            className={
              "px-3.5 py-[7px] rounded-full text-[12.5px] font-medium flex items-center gap-1.5 transition-colors " +
              (subTab === "pending" ? "bg-[#FDECEA] text-[#C0021A]" : "bg-pepo-su text-pepo-t2 hover:bg-pepo-bd")
            }
          >
            Afventer godkendelse
            <span
              className={
                "text-[11px] font-medium px-[7px] py-[1px] rounded-full " +
                (subTab === "pending" ? "bg-[#C0021A]/[0.12] text-[#C0021A]" : "bg-black/[0.06] text-pepo-t2")
              }
            >
              {counts.pending}
            </span>
          </button>
          <button
            onClick={() => setSubTab("rejected")}
            className={
              "px-3.5 py-[7px] rounded-full text-[12.5px] font-medium flex items-center gap-1.5 transition-colors " +
              (subTab === "rejected" ? "bg-pepo-pl text-pepo-p" : "bg-pepo-su text-pepo-t2 hover:bg-pepo-bd")
            }
          >
            Afvist
            <span
              className={
                "text-[11px] font-medium px-[7px] py-[1px] rounded-full " +
                (subTab === "rejected" ? "bg-pepo-p/[0.12] text-pepo-p" : "bg-black/[0.06] text-pepo-t2")
              }
            >
              {counts.rejected}
            </span>
          </button>
        </div>
      )}

      {mainTab === "approved" && !searchOpen && (
        <div className="flex gap-2 px-8 pt-3.5 pb-5 flex-wrap">
          <button
            onClick={() => toggleCatFilter(null)}
            className={
              "px-3.5 py-[7px] rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 border transition-colors " +
              (selectedCats.length === 0
                ? "bg-pepo-pl text-pepo-p border-pepo-pm"
                : "bg-pepo-wh text-pepo-t2 border-transparent hover:bg-pepo-bd")
            }
          >
            Alle
            <span
              className={
                "text-[11px] font-medium px-[7px] py-[1px] rounded-full " +
                (selectedCats.length === 0 ? "bg-pepo-p/[0.12] text-pepo-p" : "bg-black/[0.06] text-pepo-t2")
              }
            >
              {approvedList.length}
            </span>
          </button>
          {allCategories.map((c) => {
            const count = approvedList.filter((f) => f.categories.some((fc) => fc.id === c.id)).length;
            const on = selectedCats.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCatFilter(c.id)}
                className={
                  "px-3.5 py-[7px] rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 border transition-colors " +
                  (on
                    ? "bg-pepo-pl text-pepo-p border-pepo-pm"
                    : "bg-pepo-wh text-pepo-t2 border-transparent hover:bg-pepo-bd")
                }
              >
                {c.name}
                <span
                  className={
                    "text-[11px] font-medium px-[7px] py-[1px] rounded-full " +
                    (on ? "bg-pepo-p/[0.12] text-pepo-p" : "bg-black/[0.06] text-pepo-t2")
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="px-8 py-[22px] pb-10">
        {searchOpen && !search.trim() ? null : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
            <Icon name="inbox" size={32} className="mb-2.5" />
            <span className="text-[13.5px]">Ingen freelancere i denne visning</span>
          </div>
        ) : viewMode === "list" ? (
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] overflow-hidden">
            {filtered.map((f) => {
              const age = ageFromBirthDate(f.birthDate);
              return (
                <div
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPanelFor(f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPanelFor(f);
                    }
                  }}
                  className="w-full text-left flex items-center gap-3 px-4 py-[11px] border-b border-pepo-bd last:border-b-0 hover:bg-pepo-su transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p text-[12.5px] font-medium flex items-center justify-center overflow-hidden flex-shrink-0">
                    {f.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.profileImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials(f.fullName)
                    )}
                  </div>
                  <div className="text-[13.5px] font-medium text-pepo-t1 flex-shrink-0 w-[170px] truncate">
                    {f.fullName}
                    {age !== null && <span className="text-pepo-t2"> ({age})</span>}
                  </div>
                  <div className="flex flex-wrap gap-[5px] flex-1 min-w-0">
                    {f.categories.length ? (
                      f.categories.map((c) => (
                        <span key={c.id} className="bg-pepo-su text-pepo-t2 text-[11px] font-medium px-[9px] py-[3px] rounded-full">
                          {c.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-pepo-t3">Ingen kategorier valgt</span>
                    )}
                  </div>
                  <ActivityStatus
                    freelancer={f}
                    invited={invitedIds.has(f.id)}
                    sending={sendingId === f.id && isSendingInvite}
                    onInvite={() => sendInvitationFor(f.id)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {filtered.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={() => openPanelFor(f)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPanelFor(f);
                  }
                }}
                className="text-left bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-all cursor-pointer"
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
                      <div className="text-sm font-medium text-pepo-t1">
                        {f.fullName}
                        {ageFromBirthDate(f.birthDate) !== null && (
                          <span className="text-pepo-t2"> ({ageFromBirthDate(f.birthDate)})</span>
                        )}
                      </div>
                      <div className="text-xs text-pepo-t2 mt-px">{f.location || "—"}</div>
                    </div>
                  </div>
                  {f.applicationStatus === "approved" ? (
                    <ActivityStatus
                      freelancer={f}
                      invited={invitedIds.has(f.id)}
                      sending={sendingId === f.id && isSendingInvite}
                      onInvite={() => sendInvitationFor(f.id)}
                    />
                  ) : (
                    <Badge status={f.applicationStatus} />
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {f.categories.length ? (
                    f.categories.map((c) => (
                      <span key={c.id} className="bg-pepo-su text-pepo-t2 text-[11px] font-medium px-[9px] py-[3px] rounded-full">
                        {c.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-pepo-t3">Ingen kategorier valgt</span>
                  )}
                </div>
                <div className="flex flex-col gap-[5px] text-xs text-pepo-t2 border-t border-pepo-bd pt-[11px]">
                  <div className="flex items-center gap-3.5">
                    <span className="flex items-center gap-1.5">
                      <Icon name="phone" size={13} className="text-pepo-t3 w-3.5" />
                      {f.phone}
                    </span>
                    <span className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      <Icon name="mail" size={13} className="text-pepo-t3 w-3.5" />
                      {f.email || "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slide-over panel */}
      <div
        className={
          "fixed inset-0 bg-[#1D1D1F]/30 transition-opacity z-10 " +
          (panelIsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={closePanel}
      />
      <div
        className={
          "fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform z-20 flex flex-col " +
          // Ingen "translate-x-0" i synlig tilstand — se
          // [[feedback_slide_panel_native_picker_bug]] for hvorfor.
          (panelIsOpen ? "" : "translate-x-full")
        }
      >
        {panelIsOpen && (
          <>
            <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
              <span className="text-sm font-medium">
                {panelMode === "create"
                  ? "Opret freelancer"
                  : panelMode === "edit"
                  ? "Redigér freelancer"
                  : "Freelancerprofil"}
              </span>
              <div className="flex items-center gap-2">
                {panelMode === "view" && (
                  <button
                    onClick={openEditFreelancer}
                    className="flex items-center gap-1.5 h-[30px] px-3 rounded-[7px] bg-pepo-su text-pepo-t2 text-[12.5px] font-medium hover:bg-pepo-pl hover:text-pepo-p transition-colors"
                  >
                    <Icon name="pencil" size={14} />
                    Redigér
                  </button>
                )}
                <button
                  onClick={closePanel}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su"
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
            </div>

            {panelMode === "view" && open && (
              <>
                <div className="flex-1 overflow-y-auto px-6 pt-6">
                  {!open.lastActiveAt && (
                    <div className="mb-5 rounded-[10px] border border-pepo-bd bg-pepo-su px-3.5 py-3">
                      <div className="flex items-start gap-2 text-[12.5px] text-pepo-t2 leading-relaxed mb-2.5">
                        <Icon name="mail" size={15} className="flex-shrink-0 mt-0.5 text-pepo-t3" />
                        <div>
                          {open.fullName.split(" ")[0]} har endnu ikke logget ind i freelancer-appen.
                        </div>
                      </div>
                      {(() => {
                        const invited = invitedIds.has(open.id);
                        const sending = sendingId === open.id && isSendingInvite;
                        return (
                          <button
                            type="button"
                            onClick={() => sendInvitationFor(open.id)}
                            disabled={sending}
                            className={
                              "w-full h-9 rounded-[8px] text-[12.5px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 " +
                              (invited ? "bg-[#EAF6EE] text-[#1A7A34]" : "bg-pepo-p text-white")
                            }
                          >
                            <Icon name={invited ? "check" : "send"} size={14} />
                            {sending ? "Sender..." : invited ? "Invitation sendt" : "Send invitation"}
                          </button>
                        );
                      })()}
                    </div>
                  )}

                  <div className="w-[150px] h-[150px] rounded-full bg-pepo-pl text-pepo-p text-5xl font-medium flex items-center justify-center mx-auto mb-2.5 overflow-hidden">
                    {open.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={open.profileImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials(open.fullName)
                    )}
                  </div>
                  <div className="text-center text-lg font-medium tracking-tight">
                    {open.fullName}
                    {ageFromBirthDate(open.birthDate) !== null && (
                      <span className="text-pepo-t2"> ({ageFromBirthDate(open.birthDate)})</span>
                    )}
                  </div>
                  <div className="text-center text-[12.5px] text-pepo-t2 mt-0.5">
                    {open.location || "—"}
                  </div>
                  <div className="flex justify-center flex-wrap gap-1.5 my-3">
                    {open.categories.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 bg-pepo-p text-white text-[12.5px] font-medium px-3 py-[5px] rounded-full"
                      >
                        <Icon name={c.icon || "tag"} size={14} />
                        {c.name}
                      </span>
                    ))}
                  </div>

                  <div className="border-t border-pepo-bd mt-6" />

                  <Row icon="mail" label="Email" value={open.email || "—"} />
                  <Row icon="phone" label="Mobil" value={open.phone} />
                  {open.socialMediaUrl && (
                    <Row icon="brand-instagram" label="SoMe" value={open.socialMediaUrl} />
                  )}
                  {open.birthDate && (
                    <Row icon="cake" label="Fødselsdag" value={formatDate(open.birthDate)} />
                  )}
                  {open.bio && (
                    <Row icon="notes" label={`Om ${open.fullName}`} value={open.bio} multiline />
                  )}
                  <Row icon="calendar" label="Ansøgt" value={formatDate(open.appliedAt)} />
                  <Row icon="activity" label="Aktivitet" value={lastActiveLabel(open.lastActiveAt)} />
                  {open.gender && <Row icon="gender-bigender" label="Køn" value={open.gender} />}
                  <Row icon="car" label="Kørekort" value={open.hasLicense ? "Ja" : "Nej"} />

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
                      className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-gr text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <Icon name="check" size={18} />
                      {isPending ? "Gemmer..." : "Godkend ansøgning"}
                    </button>
                  </div>
                ) : open.applicationStatus === "rejected" ? (
                  <div className="mx-6 mb-[22px] px-3 py-2.5 rounded-[9px] text-[12.5px] flex items-center gap-2 bg-[#FDECEA] text-[#C0021A]">
                    <Icon name="circle-x" size={13} />
                    Denne ansøgning er allerede afvist
                  </div>
                ) : null}
              </>
            )}

            {(panelMode === "create" || panelMode === "edit") && (
              <>
                <div className="flex-1 overflow-y-auto px-6 pt-6">
                  {panelMode === "edit" && !showPhotoUpload ? (
                    <div className="mb-4">
                      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
                        Profilbillede
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p text-[12.5px] font-medium flex items-center justify-center overflow-hidden flex-shrink-0">
                          {existingPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={existingPhotoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            initials(form.fullName || "?")
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPhotoUpload(true)}
                          className="h-[34px] px-3.5 rounded-lg border border-pepo-bds bg-pepo-wh text-pepo-t1 text-[12.5px] font-medium hover:bg-pepo-su transition-colors"
                        >
                          Skift billede
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
                        Profilbillede <span className="normal-case font-normal text-pepo-t3">(valgfrit)</span>
                      </label>
                      <label className="block border-[1.5px] border-dashed border-pepo-bds rounded-xl p-5 text-center cursor-pointer hover:border-pepo-p hover:bg-pepo-pl transition-colors">
                        {form.photoDataUrl ? (
                          <div className="w-[52px] h-[52px] rounded-full overflow-hidden mx-auto mb-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={form.photoDataUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <Icon name="camera" size={26} className="text-pepo-t3 block mx-auto mb-1.5" />
                        )}
                        <div className="text-[13px] font-medium text-pepo-t2">
                          {form.photoDataUrl ? "Tryk for at skifte billede" : "Tryk for at uploade"}
                        </div>
                        <div className="text-[11px] text-pepo-t3 mt-[3px]">JPG eller PNG · Max 5 MB</div>
                        <input type="file" accept="image/*" className="hidden" onChange={onPhotoSelected} />
                      </label>
                    </div>
                  )}

                  <Field label="Navn">
                    <input
                      type="text"
                      value={form.fullName}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                      placeholder="Fx Anna Berg"
                      className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                    />
                  </Field>

                  <div className="flex gap-2.5">
                    <Field label="Køn" className="flex-1 min-w-0">
                      <select
                        value={form.gender}
                        onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                        className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh"
                      >
                        <option value="">Vælg</option>
                        <option>Kvinde</option>
                        <option>Mand</option>
                        <option>Ikke-binær</option>
                        <option>Ønsker ikke at oplyse</option>
                      </select>
                    </Field>
                    <Field label="Fødselsdato" className="flex-1 min-w-0">
                      <input
                        type="date"
                        value={form.birthDate}
                        onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                        className="w-full min-w-0 border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                      />
                    </Field>
                  </div>

                  <div className="flex gap-2.5">
                    <Field label="Telefon" className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="20 30 40 50"
                        className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                      />
                    </Field>
                    <Field label="Email" className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="anna@email.dk"
                        className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                      />
                    </Field>
                  </div>

                  <Field label="Lokation">
                    <AddressAutocompleteInput
                      value={locationText}
                      onChangeText={(text) => {
                        setLocationText(text);
                        setLocationValidated(false);
                      }}
                      onSelect={handleLocationSelected}
                      includedPrimaryTypes={LOCATION_TYPES}
                      placeholder="Fx 2100 København Ø"
                      className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                    />
                  </Field>
                  {hasUnvalidatedLocation && (
                    <p className="-mt-2 mb-4 text-[12px] text-[#9A6B00] bg-[#FFF7E6] border border-[#F5D889] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                      <Icon name="alert-triangle" size={14} className="flex-shrink-0 mt-px" />
                      Vælg lokationen fra listen, der dukker op, mens du skriver — den skal bekræftes hos Google, før den kan gemmes.
                    </p>
                  )}

                  <Field label="Jobfunktion(er)">
                    <div className="flex flex-wrap gap-2">
                      {allCategories.map((c) => {
                        const on = form.categoryIds.includes(c.id);
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => toggleFormCat(c.id)}
                            className={
                              "px-3.5 py-[7px] rounded-full text-[12.5px] font-medium transition-colors " +
                              (on ? "bg-pepo-pl text-pepo-p" : "bg-pepo-su text-pepo-t2 hover:bg-pepo-bd")
                            }
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <Field label="Note (valgfrit)">
                    <textarea
                      value={form.bio}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      rows={6}
                      placeholder="Fx erfaring eller andet relevant"
                      className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
                    />
                  </Field>

                  <Field label="Link til SoMe-profil (valgfrit)">
                    <input
                      type="text"
                      value={form.socialMediaUrl}
                      onChange={(e) => setForm((f) => ({ ...f, socialMediaUrl: e.target.value }))}
                      placeholder="https://instagram.com/annaberg"
                      className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                    />
                  </Field>

                  <label className="flex items-center gap-2 text-[13px] text-pepo-t1 mb-4 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.hasLicense}
                      onChange={(e) => setForm((f) => ({ ...f, hasLicense: e.target.checked }))}
                      className="w-4 h-4 rounded border-pepo-bds accent-pepo-p"
                    />
                    Har kørekort
                  </label>

                  {panelMode === "edit" && (
                    <div className="border-t border-pepo-bd pt-4 mt-2">
                      {!confirmingDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(true)}
                          className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#C0021A] hover:underline"
                        >
                          <Icon name="trash" size={14} />
                          Slet freelancer
                        </button>
                      ) : (
                        <div className="rounded-[10px] border border-[#F3C9C9] bg-[#FDECEA] px-3.5 py-3">
                          <div className="text-[12.5px] text-[#C0021A] leading-relaxed mb-2.5">
                            Er du sikker på at du vil slette {open?.fullName}? Det kan ikke fortrydes.
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmingDelete(false)}
                              disabled={isDeleting}
                              className="flex-1 h-9 rounded-[8px] text-[12.5px] font-medium bg-pepo-wh border border-pepo-bds text-pepo-t1 disabled:opacity-50"
                            >
                              Annuller
                            </button>
                            <button
                              type="button"
                              onClick={handleDelete}
                              disabled={isDeleting}
                              className="flex-1 h-9 rounded-[8px] text-[12.5px] font-medium bg-[#C0021A] text-white disabled:opacity-50"
                            >
                              {isDeleting ? "Sletter..." : "Ja, slet freelancer"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="h-1" />
                </div>

                {error && (
                  <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0 flex gap-2.5">
                  <button
                    onClick={panelMode === "create" ? saveNewFreelancer : saveEditFreelancer}
                    disabled={isPending || hasUnvalidatedLocation}
                    title={hasUnvalidatedLocation ? "Vælg lokationen fra Google-listen, før du kan gemme" : undefined}
                    className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <Icon name="check" size={18} />
                    {isPending
                      ? "Gemmer..."
                      : panelMode === "create"
                      ? "Gem freelancer"
                      : "Gem ændringer"}
                  </button>
                </div>
              </>
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

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"mb-4 " + className}>
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Vises i øverste højre hjørne af hvert kort (grid-visning) og yderst til
 * højre i hver liste-række — enten en lille aktivitetsdato (findes
 * last_active_at), eller en "Send invitation"-knap (findes den ikke, dvs.
 * freelanceren har aldrig åbnet appen). Delt med profilpanelets tilsvarende
 * knap via invitedIds/sendingId i FreelancerBoard, så alle tre steder altid
 * viser samme tilstand for samme freelancer — se sendInvitationFor.
 *
 * e.stopPropagation() på knappen er nødvendigt fordi kortet/rækken den sidder
 * i selv er klikbar (åbner profilpanelet) — uden det ville et klik på
 * "Send invitation" også åbne panelet.
 */
function ActivityStatus({
  freelancer,
  invited,
  sending,
  onInvite,
}: {
  freelancer: FreelancerListItem;
  invited: boolean;
  sending: boolean;
  onInvite: () => void;
}) {
  const phrase = lastActivePhrase(freelancer.lastActiveAt);

  if (phrase) {
    return (
      <span className="text-[11px] text-pepo-t3 whitespace-nowrap flex-shrink-0">
        {phrase.charAt(0).toUpperCase() + phrase.slice(1)}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!sending) onInvite();
      }}
      disabled={sending}
      className={
        "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0 whitespace-nowrap transition-colors disabled:opacity-50 " +
        (invited ? "bg-[#EAF6EE] text-[#1A7A34]" : "bg-pepo-p text-white")
      }
    >
      <Icon name={invited ? "check" : "send"} size={12} />
      {sending ? "Sender..." : invited ? "Invitation sendt" : "Send invitation"}
    </button>
  );
}

function Row({
  icon,
  label,
  value,
  multiline = false,
}: {
  icon: string;
  label?: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-pepo-bd last:border-none">
      <Icon name={icon} size={16} className="text-pepo-t3 mt-px w-4 flex-shrink-0" />
      <div>
        {label && (
          <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">{label}</div>
        )}
        <div
          className={
            "text-[13.5px] text-pepo-t1 mt-px leading-relaxed " + (multiline ? "whitespace-pre-line" : "")
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}

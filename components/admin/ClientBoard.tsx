"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientListItem, VenueItem } from "@/lib/admin-types";
import {
  createClientRecord,
  updateClientRecord,
  deleteClientRecord,
  type ClientFormInput,
  type VenueFormEntry,
} from "@/app/tenant/(protected)/clients/actions";
import Icon from "@/components/Icon";
import { VenueAddressFields } from "./VenueAddressFields";
import type { ResolvedAddressResult } from "@/components/AddressAutocompleteInput";

type CustomerType = "company" | "private";
type ViewMode = "grid" | "list";

// Udvider VenueFormEntry (det serveren forventer) med de to felter, der kun
// bruges lokalt af adresse-søgningen: addressText er den viste søgetekst,
// validated er om den seneste tekst faktisk er bekræftet ved et Google-valg.
type VenueRow = VenueFormEntry & { addressText: string; validated: boolean };

function blankVenue(): VenueRow {
  return { id: null, name: "", address: "", postalCode: "", city: "", addressText: "", validated: false };
}

function venueRowFromExisting(v: VenueItem): VenueRow {
  const addressText = [v.address, v.postalCode, v.city].filter(Boolean).join(", ");
  return {
    id: v.id,
    name: v.name ?? "",
    address: v.address ?? "",
    postalCode: v.postalCode ?? "",
    city: v.city ?? "",
    addressText,
    // Allerede-gemte adresser regnes som gyldige, indtil brugeren selv
    // rører feltet — vi genvalidér ikke gamle data bare for at redigere fx
    // telefonnummeret.
    validated: addressText.trim().length > 0,
  };
}

// ClientBoard håndterer altid en rigtig venues-liste (i modsætning til
// ClientQuickAddPanel, som administrerer venues separat) — derfor en
// strammere lokal type, hvor venues ikke er optional. Omit fjerner
// ClientFormInput's egen (valgfri VenueFormEntry[]) venues-felt FØRST, for
// at undgå at TypeScript prøver at skære de to array-typer sammen til en
// underlig intersection, der taber addressText/validated undervejs.
type ClientBoardFormInput = Omit<ClientFormInput, "venues"> & { venues: VenueRow[] };

const EMPTY_FORM: ClientBoardFormInput = {
  name: "",
  cvrNumber: "",
  contactPerson: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
  venues: [blankVenue()],
};

function displayName(c: { name: string | null; contactPerson: string | null }) {
  // Firmanavn er ikke påkrævet — privatkunder vises ved kontaktpersonens navn.
  return c.name || c.contactPerson || "(uden navn)";
}

// Enkelt venue → "postnr by". Flere venues → "N arbejdssteder".
// Matcher prototypens venueSummary().
function venueSummary(venues: VenueItem[]) {
  if (!venues || venues.length === 0) return "";
  if (venues.length === 1) {
    const v = venues[0];
    return [v.postalCode, v.city].filter(Boolean).join(" ");
  }
  return `${venues.length} arbejdssteder`;
}

export default function ClientBoard({ clients }: { clients: ClientListItem[] }) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<CustomerType>("company");
  const [form, setForm] = useState<ClientBoardFormInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Gem skal være disabled, så længe et arbejdssted har adresse-tekst
  // skrevet ind, som ikke er bekræftet ved et valg fra Google-dropdown'en.
  const hasUnvalidatedAddress = form.venues.some((v) => v.addressText.trim().length > 0 && !v.validated);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      return (
        displayName(c).toLowerCase().includes(q) ||
        (c.contactPerson ?? "").toLowerCase().includes(q) ||
        (c.contactPhone ?? "").toLowerCase().includes(q) ||
        (c.contactEmail ?? "").toLowerCase().includes(q) ||
        c.venues.some(
          (v) =>
            (v.city ?? "").toLowerCase().includes(q) ||
            (v.name ?? "").toLowerCase().includes(q)
        )
      );
    });
  }, [clients, search]);

  function openSearch() {
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearch("");
  }

  // Skifter man visning (kort/liste), nulstilles en evt. aktiv søgning, så
  // det nye view altid starter fra sit eget standardindhold i stedet for at
  // bevare søgeresultater fra det forrige view. Samme mønster i
  // ShiftBoard.tsx og FreelancerBoard.tsx.
  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    setSearch("");
    setSearchOpen(false);
  }

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCustomerType("company");
    setError(null);
    setPanelOpen(true);
  }

  function openEdit(c: ClientListItem) {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      cvrNumber: c.cvrNumber ?? "",
      contactPerson: c.contactPerson ?? "",
      contactPhone: c.contactPhone ?? "",
      contactEmail: c.contactEmail ?? "",
      notes: c.notes ?? "",
      venues: c.venues.length > 0 ? c.venues.map(venueRowFromExisting) : [blankVenue()],
    });
    setCustomerType(c.name ? "company" : "private");
    setError(null);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  function setType(type: CustomerType) {
    setCustomerType(type);
    if (type === "private") {
      setForm((f) => ({ ...f, name: "", cvrNumber: "" }));
    }
  }

  function updateVenueName(index: number, value: string) {
    setForm((f) => ({
      ...f,
      venues: f.venues.map((v, i) => (i === index ? { ...v, name: value } : v)),
    }));
  }

  function updateVenueAddressText(index: number, text: string) {
    setForm((f) => ({
      ...f,
      venues: f.venues.map((v, i) => (i === index ? { ...v, addressText: text, validated: false } : v)),
    }));
  }

  function selectVenueAddress(index: number, result: ResolvedAddressResult) {
    setForm((f) => ({
      ...f,
      venues: f.venues.map((v, i) =>
        i === index
          ? {
              ...v,
              address: result.address,
              postalCode: result.postalCode,
              city: result.city,
              addressText: result.formatted,
              validated: true,
            }
          : v
      ),
    }));
  }

  function addVenueBlock() {
    setForm((f) => ({ ...f, venues: [...f.venues, blankVenue()] }));
  }

  function removeVenueBlock(index: number) {
    setForm((f) => {
      if (f.venues.length <= 1) return f;
      return { ...f, venues: f.venues.filter((_, i) => i !== index) };
    });
  }

  function save() {
    setError(null);
    const input = customerType === "private" ? { ...form, name: "", cvrNumber: "" } : form;
    startTransition(async () => {
      // Ingen adresse-afventning nødvendig her længere — Gem-knappen er
      // disabled (se hasUnvalidatedAddress), indtil alle udfyldte adresser
      // allerede er bekræftet via et Google-valg.
      const result = editingId
        ? await updateClientRecord(editingId, input)
        : await createClientRecord(input);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setPanelOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!editingId) return;
    if (!confirm("Slet denne kunde?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteClientRecord(editingId);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setPanelOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[22px]">
        <div className="flex items-start justify-between mb-[18px]">
          <div>
            <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">
              Kunder
            </div>
            <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
              Stederne Pepo leverer freelancere til
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={openNew}
              className="h-[38px] px-4 rounded-[9px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Icon name="plus" size={17} />
              Ny kunde
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-pepo-bd" />
      <div className="flex items-center gap-2 px-8 py-4">
        {/* Samlet view-toggle — samme tynde stroke/rounding som søge-knappen
            lige til højre for den (border-pepo-bds, rounded-[9px]), i stedet
            for den tidligere udfyldte bg-pepo-su-baggrund, så de to knapper
            visuelt fremstår som ÉN samlet funktion ved siden af søgningen. */}
        <div className="flex border border-pepo-bds rounded-[9px] bg-pepo-wh p-[3px] gap-0.5 flex-shrink-0">
          <button
            title="Kortvisning"
            onClick={() => changeViewMode("grid")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center text-[16px] transition-colors " +
              (viewMode === "grid"
                ? "bg-pepo-su text-pepo-p"
                : "text-pepo-t2 hover:text-pepo-t1")
            }
          >
            <Icon name="layout-grid" size={20} />
          </button>
          <button
            title="Listevisning"
            onClick={() => changeViewMode("list")}
            className={
              "w-[34px] h-8 rounded-[7px] flex items-center justify-center text-[16px] transition-colors " +
              (viewMode === "list"
                ? "bg-pepo-su text-pepo-p"
                : "text-pepo-t2 hover:text-pepo-t1")
            }
          >
            <Icon name="list" size={20} />
          </button>
        </div>

        <div className="relative w-[38px] h-[38px] flex-shrink-0">
          <button
            type="button"
            onClick={openSearch}
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
              type="text"
              autoFocus={searchOpen}
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

      <div className="px-8 py-[22px] pb-10">
        <div className="text-[12.5px] text-pepo-t2 mb-3.5">
          {clients.length} {clients.length === 1 ? "kunde" : "kunder"}
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
            <Icon name="building-store" size={40} className="mb-2.5" />
            <span className="text-[13.5px]">
              {search ? "Ingen kunder matcher søgningen" : "Ingen kunder endnu"}
            </span>
          </div>
        ) : viewMode === "list" ? (
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] overflow-hidden">
            {filtered.map((c) => {
              const isPrivate = !c.name;
              return (
                <button
                  key={c.id}
                  onClick={() => openEdit(c)}
                  className="w-full text-left flex items-center gap-3 px-4 py-[11px] border-b border-pepo-bd last:border-b-0 hover:bg-pepo-su transition-colors"
                >
                  <div className="w-9 h-9 rounded-[9px] bg-pepo-pl text-pepo-p text-sm flex items-center justify-center flex-shrink-0">
                    <Icon name={isPrivate ? "user" : "building-store"} size={18} />
                  </div>
                  <div className="text-[13.5px] font-medium text-pepo-t1 flex-shrink-0 w-[200px] truncate">
                    {displayName(c)}
                  </div>
                  <div className="text-[12.5px] text-pepo-t2 flex-1 min-w-0 truncate">
                    {venueSummary(c.venues)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {filtered.map((c) => {
              const isPrivate = !c.name;
              return (
                <button
                  key={c.id}
                  onClick={() => openEdit(c)}
                  className="text-left bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-all"
                >
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="w-[42px] h-[42px] rounded-[11px] bg-pepo-pl text-pepo-p text-lg flex items-center justify-center flex-shrink-0">
                      <Icon name={isPrivate ? "user" : "building-store"} size={23} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-pepo-t1">{displayName(c)}</div>
                      <div className="text-xs text-pepo-t2 mt-px">
                        {venueSummary(c.venues)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[5px] text-xs text-pepo-t2 border-t border-pepo-bd pt-[11px]">
                    {c.contactPerson && !isPrivate && (
                      <div className="flex items-center gap-1.5">
                        <Icon name="user" size={16} className="text-pepo-t3" />
                        {c.contactPerson}
                      </div>
                    )}
                    {c.contactPhone && (
                      <div className="flex items-center gap-1.5">
                        <Icon name="phone" size={16} className="text-pepo-t3" />
                        {c.contactPhone}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Slide-over panel */}
      <div
        className={
          "fixed inset-0 bg-[#1D1D1F]/30 transition-opacity z-10 " +
          (panelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={closePanel}
      />
      <div
        className={
          "fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform z-20 flex flex-col " +
          // Ingen "translate-x-0" i synlig tilstand — se
          // [[feedback_slide_panel_native_picker_bug]] for hvorfor.
          (panelOpen ? "" : "translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
          <span className="text-sm font-medium">{editingId ? "Rediger kunde" : "Ny kunde"}</span>
          <button
            onClick={closePanel}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
          <div className="text-[11px] font-semibold text-pepo-t3 uppercase tracking-wide mb-3.5">
            Kunde &amp; faktureringsoplysninger
          </div>

          <div className="flex bg-pepo-su rounded-[9px] p-[3px] mb-5">
            <button
              onClick={() => setType("company")}
              className={
                "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                (customerType === "company"
                  ? "bg-pepo-wh text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-pepo-t2")
              }
            >
              Firmakunde
            </button>
            <button
              onClick={() => setType("private")}
              className={
                "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                (customerType === "private"
                  ? "bg-pepo-wh text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-pepo-t2")
              }
            >
              Privatkunde
            </button>
          </div>

          {customerType === "company" && (
            <>
              <Field label="Firmanavn">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Fx Restaurant Kanal 4"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>
              <Field label="CVR-nummer">
                <input
                  type="text"
                  value={form.cvrNumber}
                  onChange={(e) => setForm((f) => ({ ...f, cvrNumber: e.target.value }))}
                  placeholder="Fx 12345678"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>
            </>
          )}

          <Field label="Kontaktperson">
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              placeholder="Fx Anne Kruse"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
          </Field>

          <div className="flex gap-2.5">
            <Field label="Telefon" className="flex-1">
              <input
                type="text"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="20 30 40 50"
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </Field>
            <Field label="Email" className="flex-1">
              <input
                type="text"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                placeholder="anne@restaurant.dk"
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </Field>
          </div>

          <Field label="Note om kunden">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Interne noter om kunden (valgfrit)"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
            />
          </Field>

          <div className="border-t border-pepo-bd my-6" />
          <div className="text-[11px] font-semibold text-pepo-t3 uppercase tracking-wide mb-3.5">
            Event sted hvor personalet skal arbejde
          </div>

          {form.venues.map((v, i) => (
            <div key={i} className="relative border border-pepo-bd rounded-[10px] pt-3.5 px-3.5 pb-0.5 mb-3">
              {form.venues.length > 1 && (
                <button
                  type="button"
                  title="Fjern arbejdssted"
                  onClick={() => removeVenueBlock(i)}
                  className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md flex items-center justify-center text-pepo-t3 hover:bg-pepo-su hover:text-[#C0021A]"
                >
                  <Icon name="x" size={20} />
                </button>
              )}
              <VenueAddressFields
                name={v.name}
                addressText={v.addressText}
                validated={v.validated}
                onNameChange={(value) => updateVenueName(i, value)}
                onAddressTextChange={(text) => updateVenueAddressText(i, text)}
                onAddressSelected={(result) => selectVenueAddress(i, result)}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addVenueBlock}
            className="w-full h-10 rounded-[9px] border border-dashed border-pepo-bds bg-pepo-wh text-pepo-p text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-pepo-pl mt-1"
          >
            <Icon name="plus" size={16} />
            Knyt endnu et arbejdssted/venue til denne kunde
          </button>

          <div className="h-2" />
        </div>

        {error && (
          <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0 flex gap-2.5">
          {editingId && (
            <button
              onClick={remove}
              disabled={isPending}
              className="w-11 h-11 flex-shrink-0 rounded-[10px] bg-pepo-wh text-[#C0021A] border border-[#F3C9C9] flex items-center justify-center disabled:opacity-40"
            >
              <Icon name="trash" size={18} />
            </button>
          )}
          <button
            onClick={save}
            disabled={isPending || hasUnvalidatedAddress}
            title={hasUnvalidatedAddress ? "Vælg adressen fra Google-listen, før du kan gemme" : undefined}
            className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Icon name="check" size={18} />
            {isPending ? "Gemmer..." : "Gem kunde"}
          </button>
        </div>
      </div>
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

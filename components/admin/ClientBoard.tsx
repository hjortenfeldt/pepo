"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientListItem } from "@/lib/admin-types";
import {
  createClientRecord,
  updateClientRecord,
  deleteClientRecord,
  type ClientFormInput,
} from "@/app/tenant/(protected)/clients/actions";

type CustomerType = "company" | "private";

const EMPTY_FORM: ClientFormInput = {
  name: "",
  cvrNumber: "",
  address: "",
  postalCode: "",
  city: "",
  contactPerson: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
};

function displayName(c: { name: string | null; contactPerson: string | null }) {
  // Firmanavn er ikke påkrævet — privatkunder vises ved kontaktpersonens navn.
  return c.name || c.contactPerson || "(uden navn)";
}

export default function ClientBoard({ clients }: { clients: ClientListItem[] }) {
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<CustomerType>("company");
  const [form, setForm] = useState<ClientFormInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      return (
        displayName(c).toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.contactPerson ?? "").toLowerCase().includes(q) ||
        (c.contactPhone ?? "").toLowerCase().includes(q) ||
        (c.contactEmail ?? "").toLowerCase().includes(q)
      );
    });
  }, [clients, search]);

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
      address: c.address ?? "",
      postalCode: c.postalCode ?? "",
      city: c.city ?? "",
      contactPerson: c.contactPerson ?? "",
      contactPhone: c.contactPhone ?? "",
      contactEmail: c.contactEmail ?? "",
      notes: c.notes ?? "",
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

  function save() {
    setError(null);
    const input = customerType === "private" ? { ...form, name: "", cvrNumber: "" } : form;
    startTransition(async () => {
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
    <div className="flex flex-col h-screen">
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
            <div className="relative w-60">
              <i className="ti ti-search absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-pepo-t3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søg navn, kontakt, by, telefon eller email..."
                className="w-full h-[38px] border border-pepo-bds rounded-[9px] pl-[34px] pr-3 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p"
              />
            </div>
            <button
              onClick={openNew}
              className="h-[38px] px-4 rounded-[9px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <i className="ti ti-plus" />
              Ny kunde
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-[22px] pb-10">
        <div className="text-[12.5px] text-pepo-t2 mb-3.5">
          {clients.length} {clients.length === 1 ? "kunde" : "kunder"}
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
            <i className="ti ti-building-store text-[32px] mb-2.5" />
            <span className="text-[13.5px]">
              {search ? "Ingen kunder matcher søgningen" : "Ingen kunder endnu"}
            </span>
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
                      <i className={"ti " + (isPrivate ? "ti-user" : "ti-building-store")} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-pepo-t1">{displayName(c)}</div>
                      <div className="text-xs text-pepo-t2 mt-px">
                        {[c.postalCode, c.city].filter(Boolean).join(" ") || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[5px] text-xs text-pepo-t2 border-t border-pepo-bd pt-[11px]">
                    {c.contactPerson && !isPrivate && (
                      <div className="flex items-center gap-1.5">
                        <i className="ti ti-user text-[13px] text-pepo-t3 w-3.5" />
                        {c.contactPerson}
                      </div>
                    )}
                    {c.contactPhone && (
                      <div className="flex items-center gap-1.5">
                        <i className="ti ti-phone text-[13px] text-pepo-t3 w-3.5" />
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
          "fixed top-0 right-0 bottom-0 w-[420px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform z-20 flex flex-col " +
          (panelOpen ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
          <span className="text-sm font-medium">{editingId ? "Rediger kunde" : "Ny kunde"}</span>
          <button
            onClick={closePanel}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su"
          >
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
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

          <Field label="Adresse">
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Fx Nyhavn 4"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
          </Field>

          <div className="flex gap-2.5">
            <Field label="Postnr." className="flex-1">
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                placeholder="1051"
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </Field>
            <Field label="By" className="flex-[2]">
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="København K"
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </Field>
          </div>

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

          <Field label="Noter">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={15}
              placeholder="Interne noter om kunden (valgfrit)"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
            />
          </Field>
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
              <i className="ti ti-trash" />
            </button>
          )}
          <button
            onClick={save}
            disabled={isPending}
            className="flex-1 h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <i className="ti ti-check" />
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

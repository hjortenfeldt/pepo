"use client";

import { useState, useTransition } from "react";
import type { ClientOption, VenueItem } from "@/lib/admin-types";
import { createClientRecord, updateClientRecord, type ClientFormInput } from "@/app/tenant/(protected)/clients/actions";
import { createVenue, updateVenue, deleteVenue, type VenueFormInput } from "@/app/tenant/(protected)/shifts/actions";
import Icon from "@/components/Icon";
import { useSlidePanel } from "./useSlidePanel";

type VenueRow = { id: string | null; name: string; address: string; postalCode: string; city: string };

function blankVenueRow(): VenueRow {
  return { id: null, name: "", address: "", postalCode: "", city: "" };
}

export default function ClientQuickAddPanel({
  client,
  initialQuery,
  initialType,
  onSaved,
  onCancel,
}: {
  client?: ClientOption;
  initialQuery?: string;
  initialType?: "company" | "private";
  onSaved: (client: ClientOption) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(client);
  const [customerType, setCustomerType] = useState<"company" | "private">(
    client ? (client.name ? "company" : "private") : initialType ?? "company"
  );
  const [name, setName] = useState(client?.name ?? (initialType !== "private" ? initialQuery ?? "" : ""));
  const [cvrNumber, setCvrNumber] = useState(client?.cvrNumber ?? "");
  const [contactPerson, setContactPerson] = useState(
    client?.contactPerson ?? (initialType === "private" ? initialQuery ?? "" : "")
  );
  const [contactPhone, setContactPhone] = useState(client?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(client?.contactEmail ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [venues, setVenues] = useState<VenueRow[]>(
    client && client.venues.length > 0
      ? client.venues.map((v) => ({ id: v.id, name: v.name ?? "", address: v.address ?? "", postalCode: v.postalCode ?? "", city: v.city ?? "" }))
      : [blankVenueRow()]
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { visible, close, closeWith } = useSlidePanel(onCancel);

  function setType(type: "company" | "private") {
    setCustomerType(type);
    if (type === "private") {
      setName("");
      setCvrNumber("");
    }
  }

  function updateVenueField(index: number, field: keyof Omit<VenueRow, "id">, value: string) {
    setVenues((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addVenueRow() {
    setVenues((rows) => [...rows, blankVenueRow()]);
  }

  function removeVenueRow(index: number) {
    setVenues((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  }

  function save() {
    if (!name.trim() && !contactPerson.trim()) {
      setError("Udfyld enten firmanavn eller kontaktperson.");
      return;
    }
    setError(null);

    const input: ClientFormInput = {
      name: customerType === "private" ? "" : name,
      cvrNumber: customerType === "private" ? "" : cvrNumber,
      contactPerson,
      contactPhone,
      contactEmail,
      notes,
      // "venues" udelades bevidst — dette panel styrer selv sine venues
      // nedenfor via createVenue/updateVenue/deleteVenue.
    };

    startTransition(async () => {
      const clientId = client?.id;
      let resolvedId = clientId ?? null;

      if (isEditing && clientId) {
        const result = await updateClientRecord(clientId, input);
        if (!result.success) {
          setError(result.error ?? "Der opstod en fejl.");
          return;
        }
      } else {
        const result = await createClientRecord(input);
        if (!result.success) {
          setError(result.error ?? "Der opstod en fejl.");
          return;
        }
        resolvedId = result.id;
      }
      if (!resolvedId) {
        setError("Der opstod en fejl.");
        return;
      }

      // Ligesom prototypen: mindst ét arbejdssted bevares altid, også hvis alle
      // felter er tomme, så kunden altid har en (evt. unavngivet) venue-post.
      const nonBlank = venues.filter((v) => v.name.trim() || v.address.trim() || v.postalCode.trim() || v.city.trim());
      const toSave = nonBlank.length > 0 ? nonBlank : [venues[0]];

      const existingIds = client?.venues.map((v) => v.id) ?? [];
      const keptIds = toSave.filter((v) => v.id).map((v) => v.id as string);
      const removedIds = existingIds.filter((id) => !keptIds.includes(id));

      const resultVenues: VenueItem[] = [];
      for (const row of toSave) {
        const venueInput: VenueFormInput = {
          name: row.name,
          address: row.address,
          postalCode: row.postalCode,
          city: row.city,
        };
        if (row.id) {
          await updateVenue(row.id, venueInput);
          resultVenues.push({ id: row.id, clientId: resolvedId, name: row.name || null, address: row.address || null, postalCode: row.postalCode || null, city: row.city || null });
        } else {
          const created = await createVenue(resolvedId, venueInput);
          if (created.success) resultVenues.push(created.venue);
        }
      }
      for (const id of removedIds) {
        await deleteVenue(id);
      }

      closeWith(() =>
        onSaved({
          id: resolvedId,
          name: customerType === "private" ? null : name || null,
          cvrNumber: customerType === "private" ? null : cvrNumber || null,
          contactPerson: contactPerson || null,
          contactPhone: contactPhone || null,
          contactEmail: contactEmail || null,
          notes: notes || null,
          venues: resultVenues,
        })
      );
    });
  }

  return (
    <>
      <div
        className={
          "fixed inset-0 bg-[#1D1D1F]/30 transition-opacity duration-200 z-30 " +
          (visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={close}
      />
      <div
        className={
          "fixed top-0 right-0 bottom-0 w-full sm:w-[472px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform duration-200 z-40 flex flex-col " +
          (visible ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
          <span className="text-sm font-medium">{isEditing ? "Redigér kunde" : "Ny kunde"}</span>
          <button onClick={close} className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
          <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">
            Kunde &amp; faktureringsoplysninger
          </div>

          <Field label="Kundetype">
            <div className="flex bg-pepo-su rounded-[9px] p-[3px]">
              <button
                onClick={() => setType("company")}
                className={
                  "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                  (customerType === "company" ? "bg-pepo-wh text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-pepo-t2")
                }
              >
                Firmakunde
              </button>
              <button
                onClick={() => setType("private")}
                className={
                  "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                  (customerType === "private" ? "bg-pepo-wh text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-pepo-t2")
                }
              >
                Privatkunde
              </button>
            </div>
          </Field>

          {customerType === "company" && (
            <>
              <Field label="Firmanavn">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Fx Restaurant Kanal 4"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>
              <Field label="CVR-nummer">
                <input
                  type="text"
                  value={cvrNumber}
                  onChange={(e) => setCvrNumber(e.target.value)}
                  placeholder="Fx 12345678"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>
            </>
          )}

          <Field label="Kontaktperson">
            <input
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Fx Anne Kruse"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
            />
          </Field>

          <div className="flex gap-2.5">
            <Field label="Telefon" className="flex-1">
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="20 30 40 50"
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </Field>
            <Field label="Email" className="flex-1">
              <input
                type="text"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="anne@restaurant.dk"
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </Field>
          </div>

          <Field label="Note om kunden">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Interne noter om kunden (valgfrit)"
              className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
            />
          </Field>

          <div className="border-t border-pepo-bd my-5" />

          <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">Event sted hvor personalet skal arbejde</div>
          {venues.map((v, i) => (
            <div key={i} className="border border-pepo-bd rounded-[10px] pt-3.5 px-3.5 pb-0.5 mb-3 relative">
              {venues.length > 1 && (
                <button
                  title="Fjern arbejdssted"
                  onClick={() => removeVenueRow(i)}
                  className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md flex items-center justify-center text-pepo-t3 hover:bg-pepo-su hover:text-[#C0021A]"
                >
                  <Icon name="x" size={20} />
                </button>
              )}
              <Field label="Navn på arbejdssted/venue">
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => updateVenueField(i, "name", e.target.value)}
                  placeholder="Fx Kanal 4 Havnelokale"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>
              <Field label="Adresse">
                <input
                  type="text"
                  value={v.address}
                  onChange={(e) => updateVenueField(i, "address", e.target.value)}
                  placeholder="Fx Nyhavn 4"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>
              <div className="flex gap-2.5">
                <Field label="Postnr." className="flex-1">
                  <input
                    type="text"
                    value={v.postalCode}
                    onChange={(e) => updateVenueField(i, "postalCode", e.target.value)}
                    placeholder="1051"
                    className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                  />
                </Field>
                <Field label="By" className="flex-[2]">
                  <input
                    type="text"
                    value={v.city}
                    onChange={(e) => updateVenueField(i, "city", e.target.value)}
                    placeholder="København K"
                    className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            onClick={addVenueRow}
            className="w-full h-10 rounded-[9px] border border-dashed border-pepo-bds bg-pepo-wh text-pepo-p text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-pepo-pl mb-4"
          >
            <Icon name="plus" size={16} />
            Knyt endnu et arbejdssted/venue til denne kunde
          </button>
        </div>

        {error && (
          <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0">
          <button
            onClick={save}
            disabled={isPending}
            className="w-full h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Icon name="check" size={18} />
            {isPending ? "Gemmer..." : isEditing ? "Gem ændringer" : "Gem kunde"}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"mb-4 " + className}>
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

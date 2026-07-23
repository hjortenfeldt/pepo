"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import type { ClientOption } from "@/lib/admin-types";
import { venueLabel as formatVenueLabel } from "@/lib/format";
import ClientQuickAddPanel from "./ClientQuickAddPanel";

function clientDisplayName(c: ClientOption): string {
  return c.name || c.contactPerson || "";
}

export default function ClientVenueField({
  clients,
  clientId,
  venueId,
  onChange,
  onClientSaved,
}: {
  clients: ClientOption[];
  clientId: string;
  venueId: string | null;
  onChange: (clientId: string, venueId: string | null) => void;
  onClientSaved: (client: ClientOption) => void;
}) {
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const [query, setQuery] = useState(selectedClient ? clientDisplayName(selectedClient) : "");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [expandOpen, setExpandOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<
    null | { mode: "new"; initialType: "company" | "private" } | { mode: "edit" }
  >(null);

  // Synkroniserer søgefeltets tekst når clientId ændres udefra (fx ved
  // redigering af et eksisterende event) — justeret under selve renderet i
  // stedet for i en effect, som React anbefaler for "state afledt af props".
  const [syncedClientId, setSyncedClientId] = useState(clientId);
  if (clientId !== syncedClientId) {
    setSyncedClientId(clientId);
    setQuery(selectedClient ? clientDisplayName(selectedClient) : "");
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => clientDisplayName(c).toLowerCase().includes(q));
  }, [clients, query]);

  function selectClient(c: ClientOption) {
    setQuery(clientDisplayName(c));
    setSuggestOpen(false);
    const presetVenue = c.venues.length === 1 ? c.venues[0].id : null;
    onChange(c.id, presetVenue);
  }

  function onInput(value: string) {
    setQuery(value);
    onChange("", null);
    setSuggestOpen(value.trim().length > 0);
  }

  function onClientSaved_(client: ClientOption) {
    onClientSaved(client);
    setQuery(clientDisplayName(client));
    const presetVenue = client.venues.length === 1 ? client.venues[0].id : null;
    onChange(client.id, presetVenue);
    setQuickAdd(null);
  }

  const isValid = Boolean(clientId);
  const isInvalid = !isValid && query.trim().length > 0;

  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">Kunde &amp; sted</label>
      <div className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            autoComplete="off"
            onChange={(e) => onInput(e.target.value)}
            onFocus={() => setSuggestOpen(query.trim().length > 0)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            placeholder="Søg / Opret kunde"
            className={
              "flex-1 border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p " +
              (isValid ? "text-[#1A7A34]" : isInvalid ? "text-[#C0021A]" : "text-pepo-t1")
            }
          />
          {isValid && (
            <button
              type="button"
              onClick={() => setExpandOpen((o) => !o)}
              className="w-[41px] h-[41px] flex-shrink-0 rounded-[9px] border border-pepo-bds bg-pepo-wh flex items-center justify-center text-pepo-t2 hover:bg-pepo-su"
            >
              <Icon name="chevron-right" size={20} className={"transition-transform " + (expandOpen ? "rotate-90" : "")} />
            </button>
          )}
        </div>

        {suggestOpen && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-pepo-wh border border-pepo-bd rounded-[9px] shadow-[0_6px_18px_rgba(0,0,0,0.1)] max-h-[220px] overflow-y-auto overscroll-contain z-10">
            {matches.length > 0 ? (
              matches.map((c) => (
                <div
                  key={c.id}
                  onMouseDown={() => selectClient(c)}
                  className="px-3 py-2.5 text-[13px] text-pepo-t1 cursor-pointer hover:bg-pepo-su border-b border-pepo-bd last:border-none"
                >
                  {clientDisplayName(c)}
                </div>
              ))
            ) : (
              <>
                <div
                  onMouseDown={() => setQuickAdd({ mode: "new", initialType: "company" })}
                  className="px-3 py-2.5 text-[13px] font-medium text-pepo-p cursor-pointer hover:bg-pepo-pl flex items-center gap-1.5 border-b border-pepo-bd"
                >
                  <Icon name="plus" size={16} />
                  Ny firmakunde
                </div>
                <div
                  onMouseDown={() => setQuickAdd({ mode: "new", initialType: "private" })}
                  className="px-3 py-2.5 text-[13px] font-medium text-pepo-p cursor-pointer hover:bg-pepo-pl flex items-center gap-1.5"
                >
                  <Icon name="plus" size={16} />
                  Ny privatkunde
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {selectedClient && selectedClient.venues.length > 0 && (
        <select
          value={venueId ?? ""}
          onChange={(e) => onChange(clientId, e.target.value || null)}
          className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh mt-2"
        >
          {selectedClient.venues.length > 1 && <option value="">Vælg arbejdssted/venue</option>}
          {selectedClient.venues.map((v) => (
            <option key={v.id} value={v.id}>
              {formatVenueLabel(v)}
            </option>
          ))}
        </select>
      )}

      {expandOpen && selectedClient && (
        <div className="mt-2.5 border border-pepo-bd rounded-[10px] p-3.5">
          <ClientDetailRows client={selectedClient} />
          <button
            onClick={() => setQuickAdd({ mode: "edit" })}
            className="w-full h-9 mt-2 rounded-[9px] border border-pepo-bds text-[12.5px] font-medium text-pepo-t2 hover:bg-pepo-su flex items-center justify-center gap-1.5"
          >
            <Icon name="pencil" size={16} />
            Redigér kundeoplysninger
          </button>
        </div>
      )}

      {quickAdd && (
        <ClientQuickAddPanel
          client={quickAdd.mode === "edit" ? selectedClient ?? undefined : undefined}
          initialQuery={quickAdd.mode === "new" ? query : undefined}
          initialType={quickAdd.mode === "new" ? quickAdd.initialType : undefined}
          onSaved={onClientSaved_}
          onCancel={() => setQuickAdd(null)}
        />
      )}
    </div>
  );
}

function ClientDetailRows({ client }: { client: ClientOption }) {
  const rows: { icon: string; label: string; value: string }[] = [];
  if (client.name) rows.push({ icon: "building-store", label: "Firmanavn", value: client.name });
  if (client.cvrNumber) rows.push({ icon: "id", label: "CVR-nummer", value: client.cvrNumber });
  if (client.contactPerson) rows.push({ icon: "user", label: "Kontaktperson", value: client.contactPerson });
  if (client.contactPhone) rows.push({ icon: "phone", label: "Telefon", value: client.contactPhone });
  if (client.contactEmail) rows.push({ icon: "mail", label: "Email", value: client.contactEmail });
  if (client.notes) rows.push({ icon: "notes", label: "Note om kunden", value: client.notes });
  if (client.venues.length > 0) {
    rows.push({
      icon: "map-pin",
      label: client.venues.length > 1 ? "Arbejdssteder" : "Arbejdssted",
      value: client.venues.map((v) => formatVenueLabel(v)).join(", "),
    });
  }

  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-2.5 py-2 border-b border-pepo-bd last:border-none">
          <Icon name={r.icon} size={20} className="text-pepo-t3 mt-px flex-shrink-0" />
          <div>
            <div className="text-[11px] text-pepo-t3 uppercase tracking-wide">{r.label}</div>
            <div className="text-[13px] text-pepo-t1 mt-px leading-relaxed">{r.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

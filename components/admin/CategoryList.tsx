"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryListItem } from "@/lib/admin-types";
import {
  createCategory,
  renameCategory,
  updateCategoryRates,
  deleteCategory,
} from "@/app/tenant/(protected)/categories/actions";

export default function CategoryList({ categories }: { categories: CategoryListItem[] }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function add() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createCategory(name);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setNewName("");
      router.refresh();
    });
  }

  function rename(id: string, name: string) {
    setError(null);
    startTransition(async () => {
      const result = await renameCategory(id, name);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        router.refresh(); // gendan visning til det gemte navn
      } else {
        router.refresh();
      }
    });
  }

  function updateRates(id: string, clientRate: number, freelancerRate: number) {
    setError(null);
    startTransition(async () => {
      const result = await updateCategoryRates(id, clientRate, freelancerRate);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
      }
      router.refresh();
    });
  }

  function remove(c: CategoryListItem) {
    const msg =
      c.freelancerCount > 0
        ? `Slet "${c.name}"? ${c.freelancerCount} freelancer${
            c.freelancerCount === 1 ? "" : "e"
          } har valgt denne kategori og mister den.`
        : `Slet "${c.name}"?`;
    if (!confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCategory(c.id);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="px-8 pt-[22px]">
        <div className="mb-[18px]">
          <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">
            Kategorier
          </div>
          <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
            Arbejdskategorier freelancere kan vælge ved oprettelse
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-10 max-w-xl">
        <div className="flex gap-2.5 mb-[22px]">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Fx Chauffør"
            className="flex-1 h-[42px] border border-pepo-bds rounded-[10px] px-3.5 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p"
          />
          <button
            onClick={add}
            disabled={isPending}
            className="h-[42px] px-4.5 rounded-[10px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <i className="ti ti-plus" />
            Tilføj
          </button>
        </div>

        {error && (
          <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
            <i className="ti ti-tags text-[32px] mb-2.5" />
            <span className="text-[13.5px]">Ingen kategorier endnu</span>
          </div>
        ) : (
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] overflow-hidden">
            {categories.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                onRename={rename}
                onUpdateRates={updateRates}
                onDelete={remove}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-pepo-t3 mt-3.5 leading-relaxed">
          Klik på et navn for at omdøbe det. Ændringer slår igennem alle steder navnet vises —
          registreringssiden, freelancerprofiler og vagter. En kategori kan ikke slettes, hvis
          der findes vagter i den. Kunde/t og Freel./t bruges til at beregne omsætning og
          udbetaling på Dashboard.
        </p>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  onRename,
  onUpdateRates,
  onDelete,
}: {
  category: CategoryListItem;
  onRename: (id: string, name: string) => void;
  onUpdateRates: (id: string, clientRate: number, freelancerRate: number) => void;
  onDelete: (category: CategoryListItem) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-pepo-bd last:border-none">
      <div className="w-[34px] h-[34px] rounded-[9px] bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0 text-[15px]">
        <i className="ti ti-tag" />
      </div>
      <div
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const text = e.currentTarget.textContent ?? "";
          if (text.trim() && text.trim() !== category.name) {
            onRename(category.id, text.trim());
          } else {
            e.currentTarget.textContent = category.name;
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="flex-1 text-[13.5px] font-medium text-pepo-t1 rounded-md px-2 py-1.5 -mx-2 -my-1.5 cursor-text hover:bg-pepo-su focus:outline-none focus:bg-pepo-wh focus:border focus:border-pepo-p"
      >
        {category.name}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <label className="text-[11px] text-pepo-t3">Kunde/t</label>
        <input
          type="number"
          min="0"
          step="1"
          defaultValue={category.clientRatePerHour}
          onBlur={(e) => {
            const v = Number(e.currentTarget.value);
            if (!Number.isNaN(v) && v !== category.clientRatePerHour) {
              onUpdateRates(category.id, v, category.freelancerRatePerHour);
            }
          }}
          className="w-[64px] h-8 border border-pepo-bds rounded-lg px-2 text-[12.5px] text-right outline-none bg-pepo-wh focus:border-pepo-p"
        />
        <label className="text-[11px] text-pepo-t3 ml-1">Freel./t</label>
        <input
          type="number"
          min="0"
          step="1"
          defaultValue={category.freelancerRatePerHour}
          onBlur={(e) => {
            const v = Number(e.currentTarget.value);
            if (!Number.isNaN(v) && v !== category.freelancerRatePerHour) {
              onUpdateRates(category.id, category.clientRatePerHour, v);
            }
          }}
          className="w-[64px] h-8 border border-pepo-bds rounded-lg px-2 text-[12.5px] text-right outline-none bg-pepo-wh focus:border-pepo-p"
        />
      </div>
      <div className="text-xs text-pepo-t3 flex-shrink-0 whitespace-nowrap">
        {category.freelancerCount} freelancer{category.freelancerCount === 1 ? "" : "e"}
      </div>
      <button
        onClick={() => onDelete(category)}
        className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-pepo-t3 hover:bg-[#FDECEA] hover:text-[#C0021A] flex-shrink-0"
      >
        <i className="ti ti-trash" />
      </button>
    </div>
  );
}

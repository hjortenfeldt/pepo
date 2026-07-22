"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import type { CategoryGroupListItem, CategoryListItem } from "@/lib/admin-types";
import {
  createCategory,
  renameCategory,
  updateCategoryGroup,
  updateCategoryIcon,
  deleteCategory,
  createGroup,
  renameGroup,
  updateGroupRates,
  deleteGroup,
} from "@/app/tenant/(protected)/categories/actions";

// "Ikke tildelt priskategori" er ikke en rigtig gruppe i databasen — den er
// den visuelle bøtte for jobfunktioner med group_id === null. Bruger samme
// nøgle i drag & drop-håndteringen som groupId ville have haft.
const UNASSIGNED = "__unassigned__";

const ICON_OPTIONS = [
  "tag", "briefcase", "users", "user", "chef-hat", "tools", "truck", "car", "bike", "plane",
  "building-store", "building", "home", "glass", "glass-full", "glass-cocktail", "beer", "coffee", "cup", "mug",
  "pizza", "burger", "salad", "bottle", "tools-kitchen", "tools-kitchen-2", "microphone", "microphone-2", "headphones", "music",
  "disc", "camera", "video", "photo", "palette", "brush", "scissors", "shirt", "hanger", "broom",
  "vacuum-cleaner", "spray", "bucket", "trash", "recycle", "flower", "plant", "tree", "leaf", "sun",
  "cloud", "umbrella", "tent", "confetti", "balloon", "gift", "cake", "candle", "bell", "speakerphone",
  "megaphone", "star", "heart", "thumb-up", "check", "shield", "lock", "key", "wallet", "cash",
  "coin", "receipt", "calculator", "clipboard", "clipboard-list", "notes", "file", "folder", "calendar", "calendar-event",
  "clock", "alarm", "map-pin", "map", "compass", "navigation", "steering-wheel", "forklift", "package", "box",
  "boxes", "clipboard-check", "hammer", "screwdriver", "bulb", "battery", "plug", "device-laptop", "device-mobile", "phone",
  "mail", "message", "chair", "armchair", "bed", "door", "window", "stairs", "elevator", "ladder",
  "flame", "droplet", "wind", "snowflake", "first-aid-kit", "stethoscope", "vaccine", "pill", "dog", "cat",
  "fish", "paw", "crown", "medal", "trophy", "flag", "anchor", "ship", "sailboat", "parking",
  "bus", "train", "motorbike",
];

type IconPickerState = { categoryId: string; top: number; left: number };

export default function CategoryList({
  groups,
  categories,
}: {
  groups: CategoryGroupListItem[];
  categories: CategoryListItem[];
}) {
  const [newName, setNewName] = useState("");
  const [groupSelectValue, setGroupSelectValue] = useState("");
  const [groupExpandOpen, setGroupExpandOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupClientRate, setNewGroupClientRate] = useState("");
  const [newGroupWage, setNewGroupWage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blink, setBlink] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [iconPicker, setIconPicker] = useState<IconPickerState | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const newGroupNameRef = useRef<HTMLInputElement>(null);

  const canAddCategory = newName.trim().length > 0 && groupSelectValue !== "" && groupSelectValue !== "__new__";

  // Klik udenfor ikon-vælgeren lukker den — samme mønster som prototypens
  // "mousedown"-listener på document.
  useEffect(() => {
    if (!iconPicker) return;
    function onOutside(e: MouseEvent) {
      const el = document.getElementById("category-icon-picker");
      if (el && !el.contains(e.target as Node)) setIconPicker(null);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [iconPicker]);

  const unassignedCount = useMemo(() => categories.filter((c) => !c.groupId).length, [categories]);

  function handleGroupSelectChange(value: string) {
    setGroupSelectValue(value);
    if (value === "__new__") {
      setGroupExpandOpen(true);
      setTimeout(() => newGroupNameRef.current?.focus(), 0);
    } else {
      setGroupExpandOpen(false);
    }
  }

  function closeGroupExpand() {
    setGroupExpandOpen(false);
  }

  function addCategory() {
    const name = newName.trim();
    if (!name || !canAddCategory) return;
    setError(null);
    startTransition(async () => {
      const result = await createCategory(name, groupSelectValue);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setNewName("");
      setGroupSelectValue("");
      router.refresh();
    });
  }

  function addGroup() {
    const name = newGroupName.trim();
    const clientRate = parseFloat(newGroupClientRate);
    const wage = parseFloat(newGroupWage);
    setError(null);
    startTransition(async () => {
      const result = await createGroup(name, clientRate, wage);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      setNewGroupName("");
      setNewGroupClientRate("");
      setNewGroupWage("");
      closeGroupExpand();
      setGroupSelectValue(result.id);
      router.refresh();
      // Gør det tydeligt at jobfunktionen stadig ikke er oprettet, selvom
      // knappen nu (sandsynligvis) er blevet aktiv — matcher prototypens
      // "blink"-animation på tilføj-knappen.
      if (newName.trim().length > 0) {
        setBlink(false);
        requestAnimationFrame(() => setBlink(true));
      }
    });
  }

  function rename(id: string, name: string) {
    setError(null);
    startTransition(async () => {
      const result = await renameCategory(id, name);
      if (!result.success) setError(result.error ?? "Der opstod en fejl.");
      router.refresh();
    });
  }

  function removeCategory(c: CategoryListItem) {
    const msg =
      c.freelancerCount > 0
        ? `Slet "${c.name}"? ${c.freelancerCount} freelancer${c.freelancerCount === 1 ? "" : "e"} har valgt denne jobfunktion og mister den.`
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

  function renameGroupHandler(id: string, name: string) {
    setError(null);
    startTransition(async () => {
      const result = await renameGroup(id, name);
      if (!result.success) setError(result.error ?? "Der opstod en fejl.");
      router.refresh();
    });
  }

  function updateRates(id: string, clientRate: number, wage: number) {
    setError(null);
    startTransition(async () => {
      const result = await updateGroupRates(id, clientRate, wage);
      if (!result.success) setError(result.error ?? "Der opstod en fejl.");
      router.refresh();
    });
  }

  function removeGroup(g: CategoryGroupListItem) {
    const count = categories.filter((c) => c.groupId === g.id).length;
    const msg =
      count > 0
        ? `Slet priskategorien "${g.name}"? ${count} jobfunktion${count === 1 ? "" : "er"} flyttes til "Ikke tildelt priskategori".`
        : `Slet priskategorien "${g.name}"?`;
    if (!confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteGroup(g.id);
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      router.refresh();
    });
  }

  function moveCategory(id: string, groupKey: string) {
    const groupId = groupKey === UNASSIGNED ? null : groupKey;
    startTransition(async () => {
      await updateCategoryGroup(id, groupId);
      router.refresh();
    });
  }

  function openIconPicker(categoryId: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    let left = Math.min(rect.left, window.innerWidth - 420);
    left = Math.max(8, left);
    let top = rect.bottom + 6;
    if (top + 400 > window.innerHeight) top = Math.max(8, rect.top - 406);
    setIconPicker({ categoryId, top, left });
  }

  function chooseIcon(icon: string) {
    if (!iconPicker) return;
    const categoryId = iconPicker.categoryId;
    setIconPicker(null);
    startTransition(async () => {
      await updateCategoryIcon(categoryId, icon);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[22px]">
        <div className="mb-[18px]">
          <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Jobfunktioner</div>
          <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
            Jobfunktioner freelancere kan vælge ved oprettelse, grupperet i priskategorier med tilhørende timeløn
          </div>
        </div>
      </div>

      <div className="px-8 pb-10 max-w-[640px]">
        <div className="text-[11px] font-semibold text-pepo-t3 uppercase tracking-wide mb-2.5">
          Tilføj jobfunktion
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCategory();
            }}
            placeholder="Fx Chauffør"
            className="flex-1 min-w-0 h-[42px] border border-pepo-bds rounded-[10px] px-3.5 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p"
          />
          <select
            value={groupSelectValue}
            onChange={(e) => handleGroupSelectChange(e.target.value)}
            className="w-full sm:w-[210px] sm:flex-shrink-0 h-[42px] border border-pepo-bds rounded-[10px] pl-3.5 pr-8 text-[13.5px] text-pepo-t1 outline-none bg-pepo-wh focus:border-pepo-p appearance-none"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236E6E73' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 14px center",
            }}
          >
            <option value="">Vælg priskategori</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option disabled>──────────</option>
            <option value="__new__" style={{ color: "#3E1F8A", fontWeight: 600 }}>
              + Opret ny priskategori
            </option>
          </select>
          <button
            onClick={addCategory}
            disabled={!canAddCategory || isPending}
            onAnimationEnd={() => setBlink(false)}
            className={
              "h-[42px] px-4.5 rounded-[10px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:bg-pepo-bd disabled:text-pepo-t3 disabled:hover:opacity-100 w-full sm:w-auto sm:flex-shrink-0 whitespace-nowrap " +
              (blink ? "animate-[btnblink_.3s_ease-in-out_3]" : "")
            }
          >
            <Icon name="plus" size={17} />
            Jobfunktion
          </button>
        </div>

        <div className={"grid transition-[grid-template-rows] duration-200 ease-in-out mb-0 " + (groupExpandOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="pt-5 pb-[14px]">
              <div className="text-[11px] font-semibold text-pepo-t3 uppercase tracking-wide mb-2.5">
                Tilføj priskategori
              </div>
              <input
                ref={newGroupNameRef}
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addGroup();
                }}
                placeholder="Fx Specialiseret medarbejder"
                className="w-full h-[42px] border border-pepo-bds rounded-[10px] px-3.5 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p mb-2.5"
              />
              <div className="flex gap-2.5 flex-wrap">
                <div className="relative w-[168px] flex-shrink-0">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={newGroupClientRate}
                    onChange={(e) => setNewGroupClientRate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addGroup();
                    }}
                    placeholder="Kunden betaler"
                    className="w-full h-[42px] border border-pepo-bds rounded-[10px] pl-3.5 pr-9 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-pepo-t3 pointer-events-none">kr/t</span>
                </div>
                <div className="relative w-[168px] flex-shrink-0">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={newGroupWage}
                    onChange={(e) => setNewGroupWage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addGroup();
                    }}
                    placeholder="Freelanceren får"
                    className="w-full h-[42px] border border-pepo-bds rounded-[10px] pl-3.5 pr-9 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-pepo-t3 pointer-events-none">kr/t</span>
                </div>
                <button
                  onClick={addGroup}
                  disabled={isPending}
                  className="h-[42px] px-4.5 rounded-[10px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0 whitespace-nowrap"
                >
                  <Icon name="plus" size={17} />
                  Priskategori
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className={groupExpandOpen ? "" : "mt-7"}>
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              categories={categories.filter((c) => c.groupId === g.id).sort((a, b) => a.name.localeCompare(b.name, "da"))}
              isDragOver={dragOverKey === g.id}
              onDragOverGroup={() => setDragOverKey(g.id)}
              onDragLeaveGroup={() => setDragOverKey((k) => (k === g.id ? null : k))}
              onDropGroup={() => {
                setDragOverKey(null);
                if (draggedId) moveCategory(draggedId, g.id);
              }}
              onRenameGroup={renameGroupHandler}
              onUpdateClientRate={(rate) => updateRates(g.id, rate, g.freelancerRatePerHour)}
              onUpdateWage={(wage) => updateRates(g.id, g.clientRatePerHour, wage)}
              onRemoveGroup={() => removeGroup(g)}
              onDragStartCategory={(id, el) => {
                setDraggedId(id);
                el.classList.add("opacity-40");
              }}
              onDragEndCategory={(el) => {
                setDraggedId(null);
                el.classList.remove("opacity-40");
              }}
              onRenameCategory={rename}
              onDeleteCategory={removeCategory}
              onOpenIconPicker={openIconPicker}
              iconPickerCategoryId={iconPicker?.categoryId ?? null}
            />
          ))}

          {unassignedCount > 0 && (
            <GroupCard
              group={null}
              categories={categories.filter((c) => !c.groupId).sort((a, b) => a.name.localeCompare(b.name, "da"))}
              isDragOver={dragOverKey === UNASSIGNED}
              onDragOverGroup={() => setDragOverKey(UNASSIGNED)}
              onDragLeaveGroup={() => setDragOverKey((k) => (k === UNASSIGNED ? null : k))}
              onDropGroup={() => {
                setDragOverKey(null);
                if (draggedId) moveCategory(draggedId, UNASSIGNED);
              }}
              onRenameGroup={() => {}}
              onUpdateClientRate={() => {}}
              onUpdateWage={() => {}}
              onRemoveGroup={() => {}}
              onDragStartCategory={(id, el) => {
                setDraggedId(id);
                el.classList.add("opacity-40");
              }}
              onDragEndCategory={(el) => {
                setDraggedId(null);
                el.classList.remove("opacity-40");
              }}
              onRenameCategory={rename}
              onDeleteCategory={removeCategory}
              onOpenIconPicker={openIconPicker}
              iconPickerCategoryId={iconPicker?.categoryId ?? null}
            />
          )}
        </div>

        <p className="text-xs text-pepo-t3 mt-4.5 leading-relaxed">
          Vælg priskategori med det samme når du opretter en jobfunktion, eller træk jobfunktionen ind i en anden
          priskategori senere. Klik på et navn eller en timeløn for at redigere. En jobfunktion kan ikke slettes,
          hvis der findes freelancere med den. Ændringer slår igennem alle steder navnet vises —
          registreringssiden, freelancerprofiler og vagter.
        </p>
      </div>

      {iconPicker && (
        <div
          id="category-icon-picker"
          // max-w-[calc(100vw-16px)]: positioneringslogikken herover (se
          // openIconPicker) klemmer kun `left` ind til min. 8px fra kanten på
          // smalle skærme — den antager stadig en 400px-bred boks til selve
          // udregningen. Uden dette loft ville selve kassen løbe ud over
          // højrekanten på enhver skærm smallere end ca. 420px (alle mobiler).
          className="fixed w-[400px] max-w-[calc(100vw-16px)] max-h-[400px] overflow-y-auto bg-pepo-wh rounded-[14px] shadow-[0_12px_40px_rgba(29,29,31,0.18)] p-3 z-50"
          style={{ top: iconPicker.top, left: iconPicker.left }}
        >
          <div className="grid grid-cols-7 gap-1">
            {ICON_OPTIONS.map((icon) => (
              <button
                key={icon}
                title={icon}
                onClick={() => chooseIcon(icon)}
                className="w-[51px] h-[51px] rounded-xl flex items-center justify-center text-pepo-t2 hover:bg-pepo-pl hover:text-pepo-p transition-colors"
              >
                <Icon name={icon} size={25} />
              </button>
            ))}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes btnblink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.25;
          }
        }
      `}</style>
    </div>
  );
}

function GroupCard({
  group,
  categories,
  isDragOver,
  onDragOverGroup,
  onDragLeaveGroup,
  onDropGroup,
  onRenameGroup,
  onUpdateClientRate,
  onUpdateWage,
  onRemoveGroup,
  onDragStartCategory,
  onDragEndCategory,
  onRenameCategory,
  onDeleteCategory,
  onOpenIconPicker,
  iconPickerCategoryId,
}: {
  group: CategoryGroupListItem | null;
  categories: CategoryListItem[];
  isDragOver: boolean;
  onDragOverGroup: () => void;
  onDragLeaveGroup: () => void;
  onDropGroup: () => void;
  onRenameGroup: (id: string, name: string) => void;
  onUpdateClientRate: (rate: number) => void;
  onUpdateWage: (wage: number) => void;
  onRemoveGroup: () => void;
  onDragStartCategory: (id: string, el: HTMLElement) => void;
  onDragEndCategory: (el: HTMLElement) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (category: CategoryListItem) => void;
  onOpenIconPicker: (categoryId: string, anchor: HTMLElement) => void;
  iconPickerCategoryId: string | null;
}) {
  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] mb-3.5 overflow-hidden">
      {group ? (
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-pepo-bds bg-[#EFEFF2]">
          <div className="w-[30px] h-[30px] rounded-lg bg-pepo-wh text-pepo-t3 border border-pepo-bd flex items-center justify-center flex-shrink-0">
            <Icon name="folder" size={18} />
          </div>
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              const text = e.currentTarget.textContent ?? "";
              if (text.trim() && text.trim() !== group.name) onRenameGroup(group.id, text.trim());
              else e.currentTarget.textContent = group.name;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="text-[13.5px] font-semibold text-pepo-t1 border border-transparent rounded-md px-1.5 py-1 -mx-1.5 -my-1 cursor-text hover:bg-pepo-wh focus:outline-none focus:border-pepo-p focus:bg-pepo-wh"
          >
            {group.name}
          </div>
          <div className="flex flex-col items-center gap-[3px] flex-shrink-0 ml-auto">
            <div className="text-[9px] font-semibold text-pepo-t3 uppercase tracking-wide whitespace-nowrap">Kunden betaler</div>
            <RateBadge value={group.clientRatePerHour} onCommit={onUpdateClientRate} variant="client" />
          </div>
          <div className="flex flex-col items-center gap-[3px] flex-shrink-0">
            <div className="text-[9px] font-semibold text-pepo-t3 uppercase tracking-wide whitespace-nowrap">Freelanceren får</div>
            <RateBadge value={group.freelancerRatePerHour} onCommit={onUpdateWage} variant="freelancer" />
          </div>
          <button
            onClick={onRemoveGroup}
            title="Slet priskategori"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t3 hover:bg-[#FDECEA] hover:text-[#C0021A] flex-shrink-0"
          >
            <Icon name="trash" size={20} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-pepo-bds bg-[#EFEFF2]">
          <div className="w-[30px] h-[30px] rounded-lg bg-pepo-wh text-pepo-t3 border border-pepo-bd flex items-center justify-center flex-shrink-0">
            <Icon name="folder" size={18} />
          </div>
          <div className="text-[13.5px] font-semibold text-pepo-t2">Ikke tildelt priskategori</div>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverGroup();
        }}
        onDragLeave={onDragLeaveGroup}
        onDrop={(e) => {
          e.preventDefault();
          onDropGroup();
        }}
        className={"transition-colors " + (isDragOver ? "bg-pepo-pl" : "")}
      >
        {categories.length === 0 ? (
          <div className="text-center text-[12.5px] text-pepo-t3 border-[1.5px] border-dashed border-pepo-bd rounded-[10px] m-3.5 py-5">
            Træk jobfunktioner herned
          </div>
        ) : (
          categories.map((c) => (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => onDragStartCategory(c.id, e.currentTarget)}
              onDragEnd={(e) => onDragEndCategory(e.currentTarget)}
              className="flex items-center gap-3 px-3.5 py-3 border-b border-pepo-bd last:border-none cursor-grab"
            >
              <Icon name="grip-vertical" size={19} className="text-pepo-t3 flex-shrink-0" />
              <button
                type="button"
                title="Skift ikon"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenIconPicker(c.id, e.currentTarget);
                }}
                className={
                  "w-[34px] h-[34px] rounded-[9px] bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors " +
                  (iconPickerCategoryId === c.id ? "ring-2 ring-pepo-p" : "")
                }
              >
                <Icon name={c.icon || "tag"} size={19} />
              </button>
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const text = e.currentTarget.textContent ?? "";
                  if (text.trim() && text.trim() !== c.name) onRenameCategory(c.id, text.trim());
                  else e.currentTarget.textContent = c.name;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="flex-1 text-[13.5px] font-medium text-pepo-t1 border border-transparent rounded-md px-2 py-1.5 -mx-2 -my-1.5 cursor-text hover:bg-pepo-su focus:outline-none focus:border-pepo-p focus:bg-pepo-wh"
              >
                {c.name}
              </div>
              <div className="text-xs text-pepo-t3 flex-shrink-0 whitespace-nowrap">
                {c.freelancerCount} freelancer{c.freelancerCount === 1 ? "" : "e"}
              </div>
              <button
                onClick={() => onDeleteCategory(c)}
                className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-pepo-t3 hover:bg-[#FDECEA] hover:text-[#C0021A] flex-shrink-0"
              >
                <Icon name="trash" size={20} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RateBadge({
  value,
  onCommit,
  variant,
}: {
  value: number;
  onCommit: (value: number) => void;
  variant: "client" | "freelancer";
}) {
  return (
    <div
      className={
        "flex items-center gap-[3px] rounded-full pl-2.5 pr-2.5 py-1 text-xs font-medium focus-within:bg-pepo-wh focus-within:text-pepo-t1 " +
        (variant === "client" ? "bg-pepo-p text-white" : "bg-[#1A7A34] text-white")
      }
    >
      <input
        type="number"
        min={0}
        step={1}
        defaultValue={value}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const v = Number(e.currentTarget.value);
          if (!Number.isNaN(v) && v > 0 && v !== value) onCommit(v);
          else e.currentTarget.value = String(value);
        }}
        className="w-8 bg-transparent text-inherit text-right outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      kr/t
    </div>
  );
}

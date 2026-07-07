"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryOption, FreelancerOption, MessageListItem } from "@/lib/admin-types";
import { sendMessage } from "@/app/admin/(protected)/messages/actions";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
}

function firstLine(body: string) {
  return body.split("\n")[0];
}

export default function MessageBoard({
  messages,
  categories,
  freelancers,
}: {
  messages: MessageListItem[];
  categories: CategoryOption[];
  freelancers: FreelancerOption[];
}) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const [composeTarget, setComposeTarget] = useState<"all" | "category">("all");
  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.subject.toLowerCase().includes(q) || m.body.toLowerCase().includes(q));
  }, [messages, search]);

  const viewing = messages.find((m) => m.id === viewingId) ?? null;

  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "";
  const recipientCount =
    composeTarget === "all" ? freelancers.length : freelancers.filter((f) => f.categories.includes(categoryName)).length;

  function openCompose() {
    setComposeTarget("all");
    setCategoryId(categories[0]?.id ?? "");
    setSubject("");
    setBody("");
    setError(null);
    setViewingId(null);
    setComposing(true);
  }

  function closePanel() {
    setComposing(false);
    setViewingId(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await sendMessage({
        subject,
        body,
        sentToAll: composeTarget === "all",
        targetCategoryId: composeTarget === "category" ? categoryId : null,
      });
      if (!result.success) {
        setError(result.error ?? "Der opstod en fejl.");
        return;
      }
      closePanel();
      router.refresh();
    });
  }

  const panelOpen = composing || viewing !== null;

  return (
    <div className="flex flex-col h-screen">
      <div className="px-8 pt-[22px]">
        <div className="flex items-start justify-between mb-[18px]">
          <div>
            <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Beskeder</div>
            <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
              Send informationsbeskeder til alle freelancere eller en bestemt jobfunktion
            </div>
          </div>
          <button
            onClick={openCompose}
            className="h-[38px] px-4 rounded-[9px] bg-pepo-p text-white text-[13.5px] font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <i className="ti ti-plus" />
            Ny besked
          </button>
        </div>

        <div className="flex items-center border-b border-pepo-bd pb-4">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Søg..."
              className={
                "h-[38px] border border-pepo-bds rounded-[9px] pl-[34px] pr-3 text-[13.5px] outline-none bg-pepo-wh focus:border-pepo-p transition-all " +
                (searchOpen || search ? "w-[280px]" : "w-9 cursor-pointer")
              }
            />
            <i className="ti ti-search absolute left-[11px] top-1/2 -translate-y-1/2 text-[15px] text-pepo-t3 pointer-events-none" />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-pepo-t3 hover:text-pepo-t1"
              >
                <i className="ti ti-x text-[13px]" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-[22px] pb-10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
            <i className="ti ti-message-2 text-[32px] mb-2.5" />
            <span className="text-[13.5px]">
              {search ? "Ingen beskeder matcher søgningen" : "Ingen beskeder sendt endnu"}
            </span>
          </div>
        ) : (
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] overflow-hidden">
            {filtered.map((m) => {
              const readCount = m.recipients.filter((r) => r.read).length;
              return (
                <button
                  key={m.id}
                  onClick={() => setViewingId(m.id)}
                  className="w-full text-left flex items-center gap-3.5 px-4 py-3.5 border-b border-pepo-bd last:border-none hover:bg-pepo-su transition-colors"
                >
                  <div className="w-[38px] h-[38px] rounded-[10px] bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0 text-base">
                    <i className="ti ti-message-2" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium text-pepo-t1">{m.subject}</div>
                    <div className="text-xs text-pepo-t2 mt-0.5 truncate">{firstLine(m.body)}</div>
                  </div>
                  <span
                    className={
                      "text-[11px] font-medium px-[9px] py-[3px] rounded-full flex-shrink-0 whitespace-nowrap " +
                      (m.sentToAll ? "bg-pepo-pl text-pepo-p" : "bg-pepo-su text-pepo-t2")
                    }
                  >
                    {m.sentToAll ? "Alle" : m.targetCategoryName ?? "—"}
                  </span>
                  <span className="text-xs text-pepo-t2 flex-shrink-0 w-20 text-right">
                    {readCount}/{m.recipients.length} læst
                  </span>
                  <span className="text-xs text-pepo-t3 flex-shrink-0 w-24 text-right">{formatDate(m.sentAt)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className={
          "fixed inset-0 bg-[#1D1D1F]/30 transition-opacity z-10 " +
          (panelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={closePanel}
      />
      <div
        className={
          "fixed top-0 right-0 bottom-0 w-[460px] bg-pepo-wh shadow-[-8px_0_40px_rgba(0,0,0,0.12)] transition-transform z-20 flex flex-col " +
          (panelOpen ? "translate-x-0" : "translate-x-full")
        }
      >
        {composing && (
          <>
            <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
              <span className="text-sm font-medium">Ny besked</span>
              <button onClick={closePanel} className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
              <Field label="Modtagere">
                <div className="flex bg-pepo-su rounded-[9px] p-[3px] mb-1.5">
                  <button
                    onClick={() => setComposeTarget("all")}
                    className={
                      "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                      (composeTarget === "all" ? "bg-pepo-wh text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-pepo-t2")
                    }
                  >
                    Alle freelancere
                  </button>
                  <button
                    onClick={() => setComposeTarget("category")}
                    className={
                      "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                      (composeTarget === "category" ? "bg-pepo-wh text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-pepo-t2")
                    }
                  >
                    Bestemt jobfunktion
                  </button>
                </div>
              </Field>

              {composeTarget === "category" && (
                <Field label="Jobfunktion">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p bg-pepo-wh"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="text-xs text-pepo-t2 flex items-center gap-1.5 -mt-2 mb-4">
                <i className="ti ti-users text-pepo-t3" />
                Sendes til {recipientCount} freelancer{recipientCount === 1 ? "" : "e"}
              </div>

              <Field label="Emne">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Fx Ferielukket i uge 30"
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
                />
              </Field>
              <Field label="Besked">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={7}
                  placeholder="Skriv din besked her..."
                  className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none resize-none focus:border-pepo-p"
                />
              </Field>
            </div>
            {error && (
              <p className="mx-6 mb-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <div className="px-6 py-[22px] border-t border-pepo-bd flex-shrink-0">
              <button
                onClick={submit}
                disabled={isPending}
                className="w-full h-11 rounded-[10px] text-sm font-medium bg-pepo-p text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <i className="ti ti-send" />
                {isPending ? "Sender..." : "Send besked"}
              </button>
            </div>
          </>
        )}

        {viewing && (
          <>
            <div className="flex items-center justify-between px-5 py-[18px] border-b border-pepo-bd flex-shrink-0">
              <span className="text-sm font-medium">Besked</span>
              <button onClick={closePanel} className="w-7 h-7 rounded-lg flex items-center justify-center text-pepo-t2 hover:bg-pepo-su">
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pt-[22px]">
              <span
                className={
                  "text-[11px] font-medium px-[9px] py-[3px] rounded-full inline-block mb-2 " +
                  (viewing.sentToAll ? "bg-pepo-pl text-pepo-p" : "bg-pepo-su text-pepo-t2")
                }
              >
                {viewing.sentToAll ? "Alle freelancere" : `Jobfunktion: ${viewing.targetCategoryName ?? "—"}`}
              </span>
              <div className="text-[17px] font-semibold tracking-tight mb-1">{viewing.subject}</div>
              <div className="text-[12.5px] text-pepo-t2 mb-[18px]">
                Sendt {formatDate(viewing.sentAt)}
                {viewing.senderName ? ` af ${viewing.senderName}` : ""}
              </div>
              <div className="text-[13.5px] text-pepo-t1 leading-relaxed whitespace-pre-line mb-5">{viewing.body}</div>

              <div className="border-t border-pepo-bd pt-4">
                <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">
                  Modtagere — {viewing.recipients.filter((r) => r.read).length} af {viewing.recipients.length} har læst
                </div>
                {viewing.recipients.map((r) => (
                  <div
                    key={r.freelancerId}
                    className="flex items-center justify-between py-2.5 border-b border-pepo-bd last:border-none text-[13px]"
                  >
                    <span>{r.freelancerName}</span>
                    <span
                      className={
                        "text-[11.5px] font-medium flex items-center gap-1.5 " +
                        (r.read ? "text-[#1A7A34]" : "text-pepo-t3")
                      }
                    >
                      <i className={"ti " + (r.read ? "ti-circle-check" : "ti-circle-dashed")} />
                      {r.read ? "Læst" : "Ikke læst"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="h-4" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

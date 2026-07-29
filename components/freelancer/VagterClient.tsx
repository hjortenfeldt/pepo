"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { formatMonthHeading } from "@/lib/format";
import { PullToRefreshHeader } from "@/components/freelancer/PullToRefresh";
import ShiftDetailPanel from "@/components/freelancer/ShiftDetailPanel";

export type MyShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  categoryName: string;
  venue: string | null;
  isForResale: boolean;
};

export type OpenShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  categoryName: string;
  venue: string | null;
  alreadyApplied: boolean;
};

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dateBadge(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return { month: MONTHS_SHORT[d.getMonth()], day: d.getDate() };
}

/** Grupperer en kronologisk sorteret liste i (månedsoverskrift, rækker)-par —
 * bruges af begge faner nedenfor, listen er allerede sorteret af page.tsx's
 * forespørgsler (order by shift_date, start_time). */
function groupByMonth<T extends { date: string }>(rows: T[]): [string, T[]][] {
  const groups: [string, T[]][] = [];
  for (const row of rows) {
    const heading = formatMonthHeading(row.date);
    const last = groups[groups.length - 1];
    if (last && last[0] === heading) {
      last[1].push(row);
    } else {
      groups.push([heading, [row]]);
    }
  }
  return groups;
}

type Tab = "mine" | "ledige";

/**
 * "Se alle"-destinationen fra Overblik (OverviewClient.tsx) — samme to
 * lister som der, blot uden dens `.limit(6)` (se page.tsx). Toggle-fanerne
 * er bygget som admin-appens "Kundetype"-vælger på "Ny kunde"
 * (ClientQuickAddPanel.tsx: `bg-pepo-su rounded-[9px] p-[3px]`-pille med to
 * knapper) — rent klient-side state, ingen ny sidenavigation ved skift,
 * samme mønster som adminsystemets ShiftBoard.tsx-faner.
 */
export default function VagterClient({
  myShifts,
  openShifts,
  initialTab,
}: {
  myShifts: MyShift[];
  openShifts: OpenShift[];
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  // Amber-blink på det kort brugeren lige har ændret status på inde i
  // panelet — samme mønster som OverviewClient.tsx's flashShift.
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashShift(shiftId: string) {
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    setFlash(shiftId);
    flashTimeout.current = setTimeout(() => setFlash(null), 1300);
  }

  const myGroups = groupByMonth(myShifts);
  const openGroups = groupByMonth(openShifts);

  return (
    <div>
      <PullToRefreshHeader>
        <div className="z-10 bg-pepo-su px-[var(--page-px)] pt-4 pb-3 border-b border-pepo-bd pepo-rise">
          <div className="text-[20px] font-bold text-pepo-t1 mb-3">Vagter</div>
          {/* Samme opbygning som "Kundetype"-vælgeren på admin-appens "Ny
              kunde" (ClientQuickAddPanel.tsx: pille-wrapper + to
              flex-1-knapper, den aktive med skygge) — farverne er byttet om
              (hvid wrapper/grå aktiv-knap i stedet for omvendt), fordi denne
              header (i modsætning til "Ny kunde"s hvide panel) selv har
              pepo-su som baggrund; ellers ville pillen slet ikke kunne ses. */}
          <div className="flex bg-pepo-wh border border-pepo-bd rounded-[9px] p-[3px]">
            <button
              type="button"
              onClick={() => setTab("mine")}
              className={
                "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                (tab === "mine" ? "bg-pepo-su text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-pepo-t2")
              }
            >
              Mine vagter
            </button>
            <button
              type="button"
              onClick={() => setTab("ledige")}
              className={
                "flex-1 text-center py-2 rounded-[7px] text-[13px] font-medium transition-colors " +
                (tab === "ledige" ? "bg-pepo-su text-pepo-p shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-pepo-t2")
              }
            >
              Ledige vagter
            </button>
          </div>
        </div>
      </PullToRefreshHeader>

      <div className="px-[var(--page-px)] pt-4 pb-8">
        {tab === "mine" ? (
          myShifts.length === 0 ? (
            <EmptyRow text="Ingen kommende vagter lige nu." />
          ) : (
            <div className="flex flex-col">
              {myGroups.map(([heading, rows]) => (
                <div key={heading}>
                  <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide pt-4 pb-2 first:pt-0">
                    {heading}
                  </div>
                  <div className="flex flex-col gap-2">
                    {rows.map((shift) => {
                      const badge = dateBadge(shift.date);
                      return (
                        <button
                          type="button"
                          key={shift.id}
                          onClick={() => setOpenShiftId(shift.id)}
                          className={
                            "w-full text-left bg-pepo-wh border border-pepo-bd rounded-[14px] p-3 flex items-center gap-3 active:opacity-80 transition-opacity " +
                            (flash === shift.id ? "pepo-flash-amber" : "")
                          }
                        >
                          <div className="bg-[#eaf3de] rounded-[10px] px-2 py-1.5 text-center min-w-[42px] flex-shrink-0">
                            <div className="text-[9.5px] font-semibold text-[#3b6d11] uppercase">{badge.month}</div>
                            <div className="text-[15px] font-bold text-[#3b6d11]">{badge.day}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="inline-flex bg-[#eaf3de] text-[#3b6d11] rounded-full px-2.5 py-1 text-[12px] font-semibold">
                                {shift.categoryName}
                              </span>
                              {shift.isForResale && (
                                <span className="inline-flex bg-[#FEF3E2] text-[#9A5F00] rounded-full px-2.5 py-1 text-[12px] font-semibold">
                                  Til salg
                                </span>
                              )}
                            </div>
                            <div className="text-[13.5px] font-semibold text-pepo-t1 truncate">{shift.title}</div>
                            <div className="text-[12px] text-pepo-t2 mt-0.5 truncate">
                              {shift.startTime}–{shift.endTime}
                              {shift.venue ? ` · ${shift.venue}` : ""}
                            </div>
                          </div>
                          <Icon name="chevron-right" size={24} className="text-pepo-t2 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : openShifts.length === 0 ? (
          <EmptyRow text="Ingen ledige vagter matcher dine kategorier lige nu." />
        ) : (
          <div className="flex flex-col">
            {openGroups.map(([heading, rows]) => (
              <div key={heading}>
                <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide pt-4 pb-2 first:pt-0">
                  {heading}
                </div>
                <div className="flex flex-col gap-2">
                  {rows.map((shift) => {
                    const badge = dateBadge(shift.date);
                    return (
                      <button
                        type="button"
                        key={shift.id}
                        onClick={() => setOpenShiftId(shift.id)}
                        className={
                          "w-full text-left bg-pepo-wh border border-pepo-bd rounded-[14px] p-3 flex items-center gap-3 active:opacity-80 transition-opacity " +
                          (flash === shift.id ? "pepo-flash-amber" : "")
                        }
                      >
                        <div className="bg-pepo-pl rounded-[10px] px-2 py-1.5 text-center min-w-[42px] flex-shrink-0">
                          <div className="text-[9.5px] font-semibold text-pepo-p uppercase">{badge.month}</div>
                          <div className="text-[15px] font-bold text-pepo-p">{badge.day}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="inline-flex bg-pepo-pl text-pepo-p rounded-full px-2.5 py-1 text-[12px] font-semibold">
                              {shift.categoryName}
                            </span>
                            {shift.alreadyApplied && (
                              <span className="inline-flex bg-[#FEF3E2] text-[#9A5F00] rounded-full px-2.5 py-1 text-[12px] font-semibold">
                                Anmodet
                              </span>
                            )}
                          </div>
                          <div className="text-[13.5px] font-semibold text-pepo-t1 truncate">{shift.title}</div>
                          <div className="text-[12px] text-pepo-t2 mt-0.5 truncate">
                            {shift.startTime}–{shift.endTime}
                            {shift.venue ? ` · ${shift.venue}` : ""}
                          </div>
                        </div>
                        <Icon name="chevron-right" size={24} className="text-pepo-t2 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openShiftId && (
        <ShiftDetailPanel shiftId={openShiftId} onClose={() => setOpenShiftId(null)} onChanged={flashShift} />
      )}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 text-center text-[13px] text-pepo-t3">
      {text}
    </div>
  );
}

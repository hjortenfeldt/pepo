"use client";

import { useEffect, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { startShift, stopShift, applyToShift } from "@/app/freelancer/(protected)/actions";

export type ActiveShift = {
  entryId: string;
  clockInAt: string;
  title: string;
  venue: string | null;
  startTime: string;
};

export type UpcomingShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  venue: string | null;
  isToday: boolean;
};

export type OpenShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  categoryName: string;
  alreadyApplied: boolean;
};

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dateBadge(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return { month: MONTHS_SHORT[d.getMonth()], day: d.getDate() };
}

function elapsed(clockInAt: string, now: number) {
  const ms = Math.max(0, now - new Date(clockInAt).getTime());
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function OverviewClient({
  greetingName,
  greetingDate,
  activeShift,
  upcomingShifts,
  openShifts,
}: {
  greetingName: string;
  greetingDate: string;
  activeShift: ActiveShift | null;
  upcomingShifts: UpcomingShift[];
  openShifts: OpenShift[];
}) {
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(
    new Set(openShifts.filter((s) => s.alreadyApplied).map((s) => s.id))
  );

  useEffect(() => {
    if (!activeShift) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeShift]);

  const todayShift = upcomingShifts.find((s) => s.isToday) ?? null;

  function handleStart(shiftId: string) {
    setError(null);
    startTransition(async () => {
      const res = await startShift(shiftId);
      if (!res.success) setError(res.error);
    });
  }

  function handleStop(entryId: string) {
    setError(null);
    startTransition(async () => {
      const res = await stopShift(entryId);
      if (!res.success) setError(res.error);
    });
  }

  function handleApply(shiftId: string) {
    setError(null);
    setAppliedIds((prev) => new Set(prev).add(shiftId));
    startTransition(async () => {
      const res = await applyToShift(shiftId);
      if (!res.success) {
        setError(res.error);
        setAppliedIds((prev) => {
          const next = new Set(prev);
          next.delete(shiftId);
          return next;
        });
      }
    });
  }

  return (
    <div className="px-5 pt-4 pb-6">
      <div className="pepo-rise">
        <div className="text-[20px] font-bold text-pepo-t1">Hej, {greetingName}</div>
        <div className="text-[13px] text-pepo-t2 mt-0.5">{greetingDate}</div>
      </div>

      {error && (
        <p className="mt-3 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {activeShift ? (
        <div className="mt-4 rounded-[14px] p-4 bg-pepo-p pepo-rise">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[#cbb8f5]">
            <span className="w-2 h-2 rounded-full bg-[#4ade80] pepo-pulse-dot" />
            Vagt i gang
          </div>
          <div className="text-white text-[15px] font-semibold mt-2">{activeShift.title}</div>
          <div className="text-[#e4dbfa] text-[12.5px] mt-0.5">
            {activeShift.venue ? `${activeShift.venue} · ` : ""}Startede {activeShift.startTime}
          </div>
          <div className="flex items-center justify-between mt-3.5">
            <div className="text-white text-[26px] font-bold tracking-wide tabular-nums">
              {elapsed(activeShift.clockInAt, now)}
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStop(activeShift.entryId)}
              className="bg-white text-pepo-p rounded-[20px] px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50 transition-opacity"
            >
              Afslut vagt
            </button>
          </div>
        </div>
      ) : todayShift ? (
        <div className="mt-4 rounded-[14px] p-4 bg-pepo-wh border border-pepo-bd flex items-center justify-between gap-3 pepo-rise">
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-pepo-t3">I dag</div>
            <div className="text-[14px] font-semibold text-pepo-t1 mt-1 truncate">{todayShift.title}</div>
            <div className="text-[12px] text-pepo-t2 mt-0.5">
              {todayShift.startTime}–{todayShift.endTime}
              {todayShift.venue ? ` · ${todayShift.venue}` : ""}
            </div>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleStart(todayShift.id)}
            className="flex-shrink-0 bg-pepo-p text-white rounded-[20px] px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50 transition-opacity"
          >
            Start vagt
          </button>
        </div>
      ) : null}

      <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide mt-6 mb-2.5">
        Kommende vagter
      </div>
      {upcomingShifts.length === 0 ? (
        <EmptyRow text="Ingen kommende vagter lige nu." />
      ) : (
        <div className="flex flex-col gap-2">
          {upcomingShifts.map((shift, i) => {
            const badge = dateBadge(shift.date);
            return (
              <div
                key={shift.id}
                className="pepo-rise bg-pepo-wh border border-pepo-bd rounded-[14px] p-3 flex items-center gap-3"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="bg-pepo-pl rounded-[10px] px-2 py-1.5 text-center min-w-[42px] flex-shrink-0">
                  <div className="text-[9.5px] font-semibold text-pepo-p uppercase">{badge.month}</div>
                  <div className="text-[15px] font-bold text-pepo-p">{badge.day}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-pepo-t1 truncate">{shift.title}</div>
                  <div className="text-[12px] text-pepo-t2 mt-0.5 truncate">
                    {shift.startTime}–{shift.endTime}
                    {shift.venue ? ` · ${shift.venue}` : ""}
                  </div>
                </div>
                <Icon name="chevron-right" size={16} className="text-pepo-t3 flex-shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide mt-6 mb-2.5">
        Ledige vagter til dig
      </div>
      {openShifts.length === 0 ? (
        <EmptyRow text="Ingen ledige vagter matcher dine kategorier lige nu." />
      ) : (
        <div className="flex flex-col gap-2">
          {openShifts.map((shift, i) => {
            const badge = dateBadge(shift.date);
            const applied = appliedIds.has(shift.id);
            return (
              <div
                key={shift.id}
                className="pepo-rise bg-pepo-wh border border-pepo-bd rounded-[14px] p-3 flex items-center gap-3"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="bg-[#eaf3de] rounded-[10px] px-2 py-1.5 text-center min-w-[42px] flex-shrink-0">
                  <div className="text-[9.5px] font-semibold text-[#3b6d11] uppercase">{badge.month}</div>
                  <div className="text-[15px] font-bold text-[#3b6d11]">{badge.day}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-pepo-t1 truncate">{shift.categoryName}</div>
                  <div className="text-[12px] text-pepo-t2 mt-0.5">
                    {shift.startTime}–{shift.endTime}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={applied || isPending}
                  onClick={() => handleApply(shift.id)}
                  className="flex-shrink-0 bg-pepo-pl text-pepo-p rounded-[16px] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50 transition-opacity"
                >
                  {applied ? "Ansøgt" : "Meld dig"}
                </button>
              </div>
            );
          })}
        </div>
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

"use client";

import { Suspense, use, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { startShift, stopShift } from "@/app/freelancer/(protected)/actions";

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default function OverviewClient({
  firstName,
  userFullName,
  userPhotoUrl,
  companyName,
  companyLogoUrl,
  activeShift,
  upcomingShifts,
  openShiftsPromise,
}: {
  firstName: string;
  userFullName: string;
  userPhotoUrl: string | null;
  companyName: string | null;
  companyLogoUrl: string | null;
  activeShift: ActiveShift | null;
  upcomingShifts: UpcomingShift[];
  openShiftsPromise: Promise<OpenShift[]>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      {/* sticky, ikke fixed — skal stadig sidde inde i layoutets egen
          overflow-y-auto-container (se (protected)/layout.tsx), så den kun
          låser sig fast i toppen AF DEN scroll-container, i stedet for at
          overlappe bundnavigationen eller browserens egen UI. Samme
          baggrundsfarve som resten af siden (bg-pepo-su), så den smelter
          sammen med indholdet i ro, men en bund-border gør den synligt
          adskilt fra indholdet, når det scroller op bagved. */}
      <div className="sticky top-0 z-10 bg-pepo-su px-5 pt-4 pb-3 border-b border-pepo-bd pepo-rise flex items-start justify-between gap-3">
        <div className="min-w-0">
          {companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={companyLogoUrl}
              alt={companyName ?? "Firmalogo"}
              className="h-8 max-w-[170px] object-contain object-left"
            />
          ) : (
            companyName && <div className="text-[20px] font-bold text-pepo-t1 truncate">{companyName}</div>
          )}
          {companyName && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[12px] text-pepo-t2">
              <Icon name="building-store" size={14} className="text-pepo-t3" />
              {companyName}
            </div>
          )}
        </div>

        {/* Åbner samme side som "Mere" i bundnavigationen — kun i toppen af
            Overblik, ikke en fælles top-bar på tværs af alle faner. */}
        <Link
          href="/mere"
          className="flex items-center gap-2 flex-shrink-0 active:opacity-70 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-pepo-pl text-pepo-p text-[12px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
            {userPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initials(userFullName)
            )}
          </div>
          <span className="text-[13.5px] font-medium text-pepo-t1">{firstName}</span>
        </Link>
      </div>

      <div className="px-5 pt-4 pb-6">
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
      ) : (
        <div className="mt-4 rounded-[14px] p-4 bg-pepo-wh border border-pepo-bd flex items-start gap-3 pepo-rise">
          <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0">
            <Icon name="clock" size={18} />
          </div>
          <div className="text-[12.5px] text-pepo-t2 leading-relaxed pt-1">
            På datoer hvor du har vagter vil stempeluret vises her, så du kan starte og stoppe
            tidsregistreringen af din vagt.
          </div>
        </div>
      )}

      <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide mt-6 mb-2.5">
        Mine vagter
      </div>
      {upcomingShifts.length === 0 ? (
        <EmptyRow text="Ingen kommende vagter lige nu." />
      ) : (
        <div className="flex flex-col gap-2">
          {upcomingShifts.map((shift, i) => {
            const badge = dateBadge(shift.date);
            return (
              <Link
                key={shift.id}
                href={`/vagt/${shift.id}`}
                className="pepo-rise bg-pepo-wh border border-pepo-bd rounded-[14px] p-3 flex items-center gap-3 active:opacity-80 transition-opacity"
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
              </Link>
            );
          })}
        </div>
      )}

      <div className="text-[12px] font-semibold text-pepo-t2 uppercase tracking-wide mt-6 mb-2.5">
        Ledige vagter
      </div>
      {/* Egen <Suspense>-grænse omkring kun selve listen — typisk den
          tungeste forespørgsel på siden (se page.tsx). Resten af Overblik
          (hilsen, stempelur, Mine vagter) venter derfor ikke på den; denne
          liste popper ind for sig selv når den er klar, med en skeleton der
          matcher varigheden af de rigtige rækker i mellemtiden. */}
      <Suspense fallback={<OpenShiftsSkeleton />}>
        <OpenShiftsList promise={openShiftsPromise} />
      </Suspense>
      </div>
    </div>
  );
}

function OpenShiftsList({ promise }: { promise: Promise<OpenShift[]> }) {
  const openShifts = use(promise);

  if (openShifts.length === 0) {
    return <EmptyRow text="Ingen ledige vagter matcher dine kategorier lige nu." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {openShifts.map((shift, i) => {
        const badge = dateBadge(shift.date);
        return (
          <Link
            key={shift.id}
            href={`/vagt/${shift.id}`}
            className="pepo-rise bg-pepo-wh border border-pepo-bd rounded-[14px] p-3 flex items-center gap-3 active:opacity-80 transition-opacity"
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
            {shift.alreadyApplied ? (
              <span className="flex-shrink-0 bg-[#FEF3E2] text-[#9A5F00] rounded-[16px] px-3 py-1.5 text-[12px] font-semibold">
                Anmodet
              </span>
            ) : (
              <Icon name="chevron-right" size={16} className="text-pepo-t3 flex-shrink-0" />
            )}
          </Link>
        );
      })}
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

// Matcher formen af de rigtige rækker (samme højde/rounding som
// pepo-wh-kortene ovenfor), så indsættelsen ikke giver et synligt hop i
// layoutet når de rigtige rækker popper ind.
function OpenShiftsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-[60px] rounded-[14px] bg-pepo-bd animate-pulse" />
      <div className="h-[60px] rounded-[14px] bg-pepo-bd animate-pulse" />
    </div>
  );
}

"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardEventItem, MonthlyFinancials } from "@/lib/admin-types";
import { eventFullyStaffed } from "@/lib/dashboard";
import { formatDateDisplay, relativeDateLabel } from "@/lib/format";
import Icon from "@/components/Icon";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
const PLOT_HEIGHT = 260;
const GRID_STEP = 5000;
const MAX_BAR = 20;
const MIN_BAR = 5;
const MAX_OFFSET = 12;
const MIN_OFFSET = 3;

const numberFmt = new Intl.NumberFormat("da-DK");
const hourFmt = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 });

function computeBarMetrics(colWidth: number) {
  const available = colWidth * 0.82;
  const maxSpan = MAX_OFFSET + MAX_BAR;
  const minSpan = MIN_OFFSET + MIN_BAR;
  const scale = Math.max(0, Math.min(1, (available - minSpan) / (maxSpan - minSpan)));
  const barW = MIN_BAR + (MAX_BAR - MIN_BAR) * scale;
  const offset = MIN_OFFSET + (MAX_OFFSET - MIN_OFFSET) * scale;
  return { barW, offset, radius: Math.min(4, barW / 2) };
}

export default function DashboardBoard({
  monthly,
  eventCounts,
  freelancerStats,
  upcoming,
  recent,
}: {
  monthly: MonthlyFinancials[];
  eventCounts: { booket: number; afviklet: number; kommende: number };
  freelancerStats: { ansatte: number; timerArbejdet: number; timerPlanlagt: number };
  upcoming: DashboardEventItem[];
  recent: DashboardEventItem[];
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Dashboard</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Overblik over omsætning, udbetaling og kommende events
        </div>
      </div>

      <div className="px-8 py-[22px] pb-10">
        <div className="flex gap-4">
          <StatCard
            title="Events i alt"
            accent="purple"
            stats={[
              { icon: "heart-handshake", value: eventCounts.booket, label: "Booket" },
              { icon: "check", value: eventCounts.afviklet, label: "Afviklet" },
              { icon: "calendar", value: eventCounts.kommende, label: "Kommende" },
            ]}
          />
          <StatCard
            title="Freelancere i alt"
            accent="blue"
            stats={[
              { icon: "users", value: freelancerStats.ansatte, label: "Ansatte" },
              { icon: "thumb-up", value: freelancerStats.timerArbejdet, label: "Timer arbejdet", isHours: true },
              { icon: "clock", value: freelancerStats.timerPlanlagt, label: "Timer planlagt", isHours: true },
            ]}
          />
        </div>

        <div className="mt-4">
          <EventListCard
            title="Kommende events"
            events={upcoming}
            emptyText="Ingen kommende events"
            onClick={() => router.push("/shifts")}
          />
        </div>

        <div className="mt-4">
          <EventListCard title="Senest afviklede events" events={recent} emptyText="Ingen afviklede events" />
        </div>

        <div className="mt-4">
          <RevenueChart monthly={monthly} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  accent,
  stats,
}: {
  title: string;
  accent: "purple" | "blue";
  stats: { icon: string; value: number; label: string; isHours?: boolean }[];
}) {
  const valueColor = accent === "purple" ? "text-pepo-pm" : "text-[#3B82F6]";
  const labelColor = accent === "purple" ? "text-pepo-p" : "text-[#1D4ED8]";

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-5 flex-1 h-[230px]">
      <div className="text-[14.5px] font-semibold tracking-tight mb-[18px]">{title}</div>
      <div className="flex gap-6">
        {stats.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && <div className="w-px bg-pepo-bd" />}
            <div className="flex-1 text-center">
              <Icon name={s.icon} size={30} className={`${valueColor} block mx-auto mb-1.5`} />
              <div className={`text-[32px] font-semibold tracking-tight ${valueColor}`}>
                {s.isHours ? hourFmt.format(s.value) : numberFmt.format(s.value)}
              </div>
              <div className={`text-[13px] mt-1 ${labelColor}`}>{s.label}</div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function EventListCard({
  title,
  events,
  emptyText,
  onClick,
}: {
  title: string;
  events: DashboardEventItem[];
  emptyText: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={
        "bg-pepo-wh border border-pepo-bd rounded-[14px] p-5 " +
        (onClick ? "cursor-pointer hover:border-pepo-pm hover:shadow-[0_2px_12px_rgba(62,31,138,0.08)] transition-all" : "")
      }
    >
      <div className="text-[14.5px] font-semibold tracking-tight mb-[18px]">{title}</div>
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-pepo-t3">
          <Icon name="calendar-event" size={40} className="mb-2" />
          <span className="text-[13px]">{emptyText}</span>
        </div>
      ) : (
        <div className="flex flex-col">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: DashboardEventItem }) {
  const dot = eventFullyStaffed(event.roles) ? "bg-[#1A7A34]" : "bg-[#C0021A]";
  return (
    <div className="flex items-center gap-3.5 py-3 border-b border-pepo-bd last:border-none">
      <div className="w-1.5 flex-shrink-0 flex items-center justify-center">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      </div>
      <div className="w-[86px] flex-shrink-0">
        <div className="text-xs font-semibold text-pepo-t1">{relativeDateLabel(event.eventDate)}</div>
        <div className="text-[11px] text-pepo-t3 mt-px">{formatDateDisplay(event.eventDate)}</div>
      </div>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2.5">
        <span className="text-[13.5px] font-medium text-pepo-t1">{event.title}</span>
        <div className="flex flex-wrap gap-1.5 justify-end flex-shrink-0">
          {event.roles.map((r) => (
            <Fragment key={r.category}>
              {r.open > 0 && <RoleBadge count={r.open} category={r.category} tone="red" />}
              {r.forResale > 0 && <RoleBadge count={r.forResale} category={r.category} tone="amber" />}
              {r.assigned > 0 && <RoleBadge count={r.assigned} category={r.category} tone="green" />}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ count, category, tone }: { count: number; category: string; tone: "red" | "amber" | "green" }) {
  const cls =
    tone === "red"
      ? "bg-[#FDECEA] text-[#C0021A]"
      : tone === "amber"
      ? "bg-[#FEF3E2] text-[#9A5F00]"
      : "bg-[#EAF6EE] text-[#1A7A34]";
  return (
    <span className={`inline-flex px-[9px] py-[3px] rounded-full text-[11px] font-medium whitespace-nowrap ${cls}`}>
      {count} {category}
    </span>
  );
}

function RevenueChart({ monthly }: { monthly: MonthlyFinancials[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [barMetrics, setBarMetrics] = useState({ barW: MAX_BAR, offset: MAX_OFFSET, radius: 4 });
  const [tooltip, setTooltip] = useState<{ monthIndex: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setBarMetrics(computeBarMetrics(width / 12));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rawMax = Math.max(0, ...monthly.flatMap((m) => [m.revenue, m.expense]));
  const maxValue = Math.max(GRID_STEP, Math.ceil(rawMax / GRID_STEP) * GRID_STEP);
  const gridValues: number[] = [];
  for (let v = 0; v <= maxValue; v += GRID_STEP) gridValues.push(v);

  const hovered = tooltip ? monthly[tooltip.monthIndex] : null;

  return (
    <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-5">
      <div className="text-[14.5px] font-semibold tracking-tight mb-[18px]">Omsætning og udbetaling</div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5 text-[12.5px] text-pepo-t2">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-[#1A7A34]" />
          Indtjening
        </div>
        <div className="flex items-center gap-1.5 text-[12.5px] text-pepo-t2">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-[#C0021A]" />
          Udbetaling til freelancere
        </div>
      </div>

      <div className="flex gap-2.5">
        <div className="relative w-14 flex-shrink-0" style={{ height: PLOT_HEIGHT }}>
          {gridValues.map((v) => (
            <div
              key={v}
              className="absolute right-2 text-[11px] text-pepo-t3 whitespace-nowrap"
              style={{ top: PLOT_HEIGHT - (v / maxValue) * PLOT_HEIGHT, transform: "translateY(-50%)" }}
            >
              {v === 0 ? "0" : numberFmt.format(v)}
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {gridValues.map((v) => (
              <div
                key={v}
                className="absolute left-0 right-0 h-px bg-pepo-bd"
                style={{ top: PLOT_HEIGHT - (v / maxValue) * PLOT_HEIGHT }}
              />
            ))}
            <div ref={rowRef} className="relative flex h-full">
              {monthly.map((m, i) => {
                const revH = (m.revenue / maxValue) * PLOT_HEIGHT;
                const expH = (m.expense / maxValue) * PLOT_HEIGHT;
                return (
                  <div
                    key={i}
                    className="flex-1 min-w-0 h-full flex items-end justify-center relative cursor-pointer"
                    onMouseEnter={() => setTooltip({ monthIndex: i, x: 0, y: 0 })}
                    onMouseMove={(e) => setTooltip({ monthIndex: i, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div className="relative h-full" style={{ width: barMetrics.offset + barMetrics.barW }}>
                      <div
                        className="absolute bottom-0 left-0 opacity-55 hover:opacity-100 transition-opacity"
                        style={{
                          width: barMetrics.barW,
                          height: revH,
                          background: "#1A7A34",
                          borderRadius: `${barMetrics.radius}px ${barMetrics.radius}px 0 0`,
                        }}
                      />
                      <div
                        className="absolute bottom-0 opacity-55 hover:opacity-100 transition-opacity"
                        style={{
                          left: barMetrics.offset,
                          width: barMetrics.barW,
                          height: expH,
                          background: "#C0021A",
                          borderRadius: `${barMetrics.radius}px ${barMetrics.radius}px 0 0`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex mt-2">
            {MONTH_LABELS.map((label) => (
              <div key={label} className="flex-1 text-center text-[11.5px] text-pepo-t2">
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {tooltip && hovered && (
        <div
          className="fixed bg-pepo-wh border border-pepo-bd rounded-[10px] shadow-[0_8px_28px_rgba(0,0,0,0.16)] px-3.5 py-2.5 text-[12.5px] z-[100] pointer-events-none min-w-[160px]"
          style={{ left: tooltip.x + 18, top: tooltip.y - 14 }}
        >
          <div className="font-semibold mb-1.5">{MONTH_LABELS[tooltip.monthIndex]}</div>
          <div className="flex justify-between gap-4 mb-1">
            <span className="font-medium text-[#1A7A34]">Indtægt</span>
            <span className="font-medium text-pepo-t1">{numberFmt.format(hovered.revenue)} kr</span>
          </div>
          <div className="flex justify-between gap-4 mb-1">
            <span className="font-medium text-[#C0021A]">Udgift</span>
            <span className="font-medium text-pepo-t1">{numberFmt.format(hovered.expense)} kr</span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-pepo-bd">
            <span className="font-medium text-pepo-t1">Overskud</span>
            <span className="font-medium text-pepo-t1">{numberFmt.format(hovered.revenue - hovered.expense)} kr</span>
          </div>
        </div>
      )}
    </div>
  );
}

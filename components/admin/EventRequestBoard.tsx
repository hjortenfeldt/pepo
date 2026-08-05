"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateDisplay } from "@/lib/format";
import Icon from "@/components/Icon";
import type { EventRequestListItem } from "@/app/tenant/(protected)/event-requests/actions";

const STATUS_LABEL: Record<EventRequestListItem["status"], string> = {
  new: "Ny",
  in_dialog: "I dialog",
  accepted: "Accepteret",
  rejected: "Afvist",
};

const STATUS_CLASS: Record<EventRequestListItem["status"], string> = {
  new: "bg-pepo-pl text-pepo-p",
  in_dialog: "bg-[#FFF7E6] text-[#9A6B00]",
  accepted: "bg-[#EAF6EE] text-pepo-gr",
  rejected: "bg-[#FDECEA] text-[#C0021A]",
};

function formatKr(value: number): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(value)) + " kr.";
}

const FILTERS: { key: "all" | EventRequestListItem["status"]; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "new", label: "Nye" },
  { key: "in_dialog", label: "I dialog" },
  { key: "accepted", label: "Accepteret" },
  { key: "rejected", label: "Afvist" },
];

export default function EventRequestBoard({ requests }: { requests: EventRequestListItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | EventRequestListItem["status"]>("all");

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const totalUnread = requests.reduce((sum, r) => sum + r.unreadCount, 0);

  return (
    <div className="flex flex-col">
      <div className="px-[var(--page-px)] pt-[22px]">
        <div className="mb-[18px]">
          <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Eventforespørgsler</div>
          <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
            Forespørgsler om personale fra kommende kunder, sendt via jeres eventforespørgsel-side
            {totalUnread > 0 && (
              <span className="text-pepo-p font-medium"> · {totalUnread} nye {totalUnread === 1 ? "besked" : "beskeder"}</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-pepo-bd" />

      <div className="flex items-center gap-1.5 px-[var(--page-px)] py-4 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              "px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors " +
              (filter === f.key ? "bg-pepo-p text-white" : "bg-pepo-su text-pepo-t2 hover:bg-pepo-bd")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="border-t border-pepo-bd" />

      <div className="px-[var(--page-px)] py-[22px] pb-10">
        <div className="text-[12.5px] text-pepo-t2 mb-3.5">
          {filtered.length} {filtered.length === 1 ? "forespørgsel" : "forespørgsler"}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-pepo-t3">
            <Icon name="clipboard-list" size={40} className="mb-2.5" />
            <span className="text-[13.5px]">Ingen forespørgsler her endnu</span>
          </div>
        ) : (
          <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] overflow-hidden">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/event-requests/${r.id}`)}
                className="w-full text-left flex items-center gap-3 px-4 py-[13px] border-b border-pepo-bd last:border-b-0 hover:bg-pepo-su transition-colors"
              >
                <div className="w-9 h-9 rounded-[9px] bg-pepo-pl text-pepo-p flex items-center justify-center flex-shrink-0 relative">
                  <Icon name={r.customerType === "company" ? "building-store" : "user"} size={18} />
                  {r.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-pepo-p text-white text-[10px] font-medium flex items-center justify-center border-2 border-pepo-wh">
                      {r.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium text-pepo-t1 truncate">{r.title}</div>
                  <div className="text-[12.5px] text-pepo-t2 truncate">
                    {r.displayName} · {formatDateDisplay(r.eventDate)}
                  </div>
                </div>
                {r.totalKr != null && (
                  <div className="text-[13px] text-pepo-t1 flex-shrink-0 hidden sm:block">{formatKr(r.totalKr)}</div>
                )}
                <span className={"px-2.5 py-1 rounded-full text-[11.5px] font-medium flex-shrink-0 " + STATUS_CLASS[r.status]}>
                  {STATUS_LABEL[r.status]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

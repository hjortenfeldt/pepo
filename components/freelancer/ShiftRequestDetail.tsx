"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import { requestShift, withdrawShiftRequest } from "@/app/freelancer/(protected)/actions";
import { formatEventDate, formatTimeRange, hoursBetween } from "@/lib/format";

export type ShiftStatus = "open" | "for_resale" | "assigned" | "completed" | "cancelled";

export type SiblingShift = {
  id: string;
  startTime: string;
  endTime: string;
  categoryName: string;
  status: ShiftStatus;
  isCurrent: boolean;
};

export type ShiftAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
};

export type OpenShiftDetail = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
  categoryName: string;
  eventTitle: string;
  briefing: string | null;
  venueName: string | null;
  venueAddress: string | null;
  alreadyApplied: boolean;
  siblingShifts: SiblingShift[];
  attachments: ShiftAttachment[];
};

const SIBLING_STATUS_LABEL: Record<ShiftStatus, string> = {
  open: "Ledig",
  for_resale: "Til salg",
  assigned: "Tildelt",
  completed: "Afsluttet",
  cancelled: "Slettet",
};

const SIBLING_STATUS_CLASS: Record<ShiftStatus, string> = {
  open: "bg-pepo-pl text-pepo-p",
  for_resale: "bg-[#FEF3E2] text-[#9A5F00]",
  assigned: "bg-[#EAF6EE] text-[#1A7A34]",
  completed: "bg-pepo-su text-pepo-t3",
  cancelled: "bg-pepo-su text-pepo-t3",
};

function formatDuration(startTime: string, endTime: string): string {
  const hours = hoursBetween(startTime, endTime);
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(".", ",");
  return `${label} timers vagt`;
}

export default function ShiftRequestDetail({ shift }: { shift: OpenShiftDetail }) {
  const [alreadyApplied, setAlreadyApplied] = useState(shift.alreadyApplied);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const requestable = shift.status === "open" || shift.status === "for_resale";
  const otherShifts = shift.siblingShifts.filter((s) => !s.isCurrent);

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const res = await requestShift(shift.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setAlreadyApplied(true);
      router.refresh();
    });
  }

  function handleWithdraw() {
    setError(null);
    startTransition(async () => {
      const res = await withdrawShiftRequest(shift.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setAlreadyApplied(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-pepo-wh px-4 py-3 border-b border-pepo-bd flex items-center">
        <Link href="/" className="flex items-center gap-2 text-pepo-t1 -ml-1 px-1 py-0.5">
          <Icon name="arrow-left" size={18} />
          <span className="text-[14px] font-medium">Ledige vagter</span>
        </Link>
      </div>

      <div className="px-5 pt-5 pb-8">
        <span className="inline-flex bg-pepo-pl text-pepo-p rounded-full px-2.5 py-1 text-[12px] font-semibold mb-2.5">
          {shift.categoryName}
        </span>
        <div className="text-[20px] font-bold text-pepo-t1 tracking-tight">{shift.eventTitle}</div>
        <div className="text-[13px] text-pepo-t2 mt-1">
          {formatEventDate(shift.date)} · {formatTimeRange(shift.startTime, shift.endTime)}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          {(shift.venueName || shift.venueAddress) && (
            <div className="flex items-center gap-2 text-[13px] text-pepo-t2">
              <Icon name="map-pin" size={16} className="text-pepo-t3 flex-shrink-0" />
              <span>
                {shift.venueName}
                {shift.venueName && shift.venueAddress ? " — " : ""}
                {shift.venueAddress}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[13px] text-pepo-t2">
            <Icon name="clock" size={16} className="text-pepo-t3 flex-shrink-0" />
            {formatDuration(shift.startTime, shift.endTime)}
          </div>
        </div>

        {otherShifts.length > 0 && (
          <>
            <div className="h-px bg-pepo-bd my-5" />
            <div className="text-[14px] font-semibold text-pepo-t1 mb-2.5">
              Vagter til dette event ({shift.siblingShifts.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {shift.siblingShifts.map((s) => (
                <div
                  key={s.id}
                  className={
                    "flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 border " +
                    (s.isCurrent ? "border-pepo-p bg-pepo-pl/30" : "border-pepo-bd")
                  }
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-pepo-t1 truncate">
                      {s.categoryName}
                      {s.isCurrent && <span className="text-pepo-t3 font-normal"> · denne vagt</span>}
                    </div>
                    <div className="text-[12px] text-pepo-t2">{formatTimeRange(s.startTime, s.endTime)}</div>
                  </div>
                  <span
                    className={"flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold " + SIBLING_STATUS_CLASS[s.status]}
                  >
                    {SIBLING_STATUS_LABEL[s.status]}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="h-px bg-pepo-bd my-5" />
        <div className="text-[14px] font-semibold text-pepo-t1 mb-2">Briefing</div>
        <div className="text-[13px] text-pepo-t2 leading-relaxed whitespace-pre-line">
          {shift.briefing || "Ingen briefing tilføjet endnu."}
        </div>

        {shift.attachments.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {shift.attachments.map((a) => (
              <a
                key={a.id}
                href={a.fileUrl}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2 text-[13px] text-pepo-p hover:underline"
              >
                <Icon name="paperclip" size={14} className="text-pepo-t3 flex-shrink-0" />
                <span className="truncate">{a.fileName}</span>
              </a>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 bg-pepo-wh border-t border-pepo-bd px-5 py-3.5">
        {!requestable ? (
          <div className="text-center text-[12.5px] text-pepo-t3 py-2.5">
            Denne vagt er ikke længere ledig.
          </div>
        ) : alreadyApplied ? (
          <>
            <button
              type="button"
              disabled
              className="w-full h-[46px] rounded-[10px] text-[15px] font-semibold bg-[#1A7A34] text-white flex items-center justify-center gap-2 opacity-90"
            >
              <Icon name="check" size={18} />
              Anmodet
            </button>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={isPending}
              className="w-full text-center text-[13px] text-pepo-t3 underline decoration-pepo-t3 mt-2.5 disabled:opacity-50"
            >
              Annuller anmodning
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleRequest}
            disabled={isPending}
            className="w-full h-[46px] rounded-[10px] text-[15px] font-semibold bg-pepo-p text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
          >
            <Icon name="hand-stop" size={18} />
            {isPending ? "Sender anmodning..." : "Anmod om vagt"}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { markMessageRead } from "@/app/freelancer/(protected)/beskeder/actions";

export type FreelancerMessage = {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

export default function BeskederClient({ messages }: { messages: FreelancerMessage[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set(messages.filter((m) => m.readAt).map((m) => m.id)));
  const [, startTransition] = useTransition();

  function toggle(message: FreelancerMessage) {
    const opening = expandedId !== message.id;
    setExpandedId(opening ? message.id : null);
    if (opening && !readIds.has(message.id)) {
      setReadIds((prev) => new Set(prev).add(message.id));
      startTransition(async () => {
        await markMessageRead(message.id);
      });
    }
  }

  return (
    <div className="px-[var(--page-px)] pt-4 pb-6">
      <div className="text-[20px] font-bold text-pepo-t1 mb-4 pepo-rise">Beskeder</div>

      {messages.length === 0 ? (
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 text-center text-[13px] text-pepo-t3">
          Ingen beskeder endnu.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((message) => {
            const isUnread = !readIds.has(message.id);
            const isExpanded = expandedId === message.id;
            return (
              <button
                key={message.id}
                type="button"
                onClick={() => toggle(message)}
                className="pepo-rise text-left bg-pepo-wh border border-pepo-bd rounded-[14px] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {isUnread && <span className="w-2 h-2 rounded-full bg-pepo-p flex-shrink-0" />}
                    <div className={`text-[14px] truncate ${isUnread ? "font-bold text-pepo-t1" : "font-medium text-pepo-t2"}`}>
                      {message.subject}
                    </div>
                  </div>
                  <div className="text-[11.5px] text-pepo-t3 flex-shrink-0">{formatDate(message.createdAt)}</div>
                </div>
                <div className={`text-[12.5px] text-pepo-t2 mt-1 ${isExpanded ? "" : "truncate"}`}>
                  {message.body}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

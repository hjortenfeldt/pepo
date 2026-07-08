"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { formatDateDisplay } from "@/lib/format";
import { inviteAdmin, removeAdmin } from "@/app/tenant/(protected)/settings/admins/actions";

export type AdminUserItem = {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

export default function AdminUsersSettings({
  admins,
  currentUserId,
}: {
  admins: AdminUserItem[];
  currentUserId: string | null;
}) {
  const [list, setList] = useState(admins);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, startInvite] = useTransition();

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, startRemove] = useTransition();

  function submitInvite() {
    setInviteError(null);
    setInviteSuccess(null);
    startInvite(async () => {
      const res = await inviteAdmin(name, email);
      if (!res.success) {
        setInviteError(res.error);
        return;
      }
      setInviteSuccess(`Invitation sendt til ${email.trim()} — personen modtager en mail med link til at sætte en adgangskode.`);
      setList((l) => [...l, { id: crypto.randomUUID(), fullName: name.trim(), email: email.trim().toLowerCase(), createdAt: new Date().toISOString() }]);
      setName("");
      setEmail("");
    });
  }

  function confirmRemove(id: string) {
    setRemoveError(null);
    startRemove(async () => {
      const res = await removeAdmin(id);
      if (!res.success) {
        setRemoveError(res.error);
        return;
      }
      setList((l) => l.filter((a) => a.id !== id));
      setRemovingId(null);
    });
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="px-8 pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Admin brugere</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Giv flere medarbejdere adgang til at administrere jeres system
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-[22px] pb-10 max-w-2xl">
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6 mb-4">
          <div className="text-[15px] font-semibold text-pepo-t1 mb-1">Nuværende admin-brugere</div>
          <div className="text-[12.5px] text-pepo-t2 mb-4">
            Alle admin-brugere har samme rettigheder — de kan administrere events, vagter, freelancere, kunder
            og jobfunktioner.
          </div>

          {removeError && (
            <p className="mb-3 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {removeError}
            </p>
          )}

          <div className="flex flex-col">
            {list.map((admin) => {
              const isSelf = admin.id === currentUserId;
              return (
                <div
                  key={admin.id}
                  className="flex items-center gap-3 py-3 border-b border-pepo-bd last:border-none"
                >
                  <div className="w-9 h-9 rounded-full bg-pepo-pl text-pepo-p text-[12.5px] font-medium flex items-center justify-center flex-shrink-0">
                    {initials(admin.fullName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium text-pepo-t1 truncate flex items-center gap-1.5">
                      {admin.fullName}
                      {isSelf && (
                        <span className="text-[10px] font-medium text-pepo-p bg-pepo-pl px-1.5 py-[1px] rounded-full">
                          Dig
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-pepo-t3 truncate">
                      {admin.email} · Tilføjet {formatDateDisplay(admin.createdAt.slice(0, 10))}
                    </div>
                  </div>

                  {!isSelf &&
                    (removingId === admin.id ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => confirmRemove(admin.id)}
                          disabled={isRemoving}
                          className="h-9 px-3 rounded-[9px] text-[12.5px] font-medium bg-[#C0021A] text-white disabled:opacity-40"
                        >
                          {isRemoving ? "Fjerner..." : "Ja, fjern"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemovingId(null)}
                          disabled={isRemoving}
                          className="h-9 px-3 rounded-[9px] text-[12.5px] font-medium border border-pepo-bds text-pepo-t1 hover:bg-pepo-su transition-colors"
                        >
                          Fortryd
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRemovingId(admin.id)}
                        disabled={list.length <= 1}
                        className="h-9 px-3 rounded-[9px] text-[12.5px] font-medium text-[#C0021A] hover:bg-[#FDECEA] transition-colors flex-shrink-0 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        Fjern adgang
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6">
          <div className="text-[15px] font-semibold text-pepo-t1 mb-1">Invitér ny admin</div>
          <div className="text-[12.5px] text-pepo-t2 mb-4">
            Personen får tilsendt en mail med et link til selv at sætte en adgangskode.
          </div>

          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
                Navn
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p"
              />
            </div>
          </div>

          {inviteError && (
            <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {inviteError}
            </p>
          )}
          {inviteSuccess && (
            <p className="mb-4 text-[12.5px] text-[#1A7A34] bg-[#EAF6EE] border border-[#c9e9d3] rounded-lg px-3 py-2">
              {inviteSuccess}
            </p>
          )}

          <button
            type="button"
            onClick={submitInvite}
            disabled={isInviting}
            className="h-11 px-4 rounded-[10px] text-[13px] font-medium bg-pepo-p text-white flex items-center gap-1.5 disabled:opacity-40"
          >
            <Icon name="user-plus" size={16} />
            {isInviting ? "Sender..." : "Send invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

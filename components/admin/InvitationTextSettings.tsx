"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import {
  updateFreelancerInvitationText,
  resetFreelancerInvitationText,
} from "@/app/tenant/(protected)/settings/texts/actions";
import {
  INVITATION_EMAIL_TOKENS,
  DEFAULT_FREELANCER_INVITATION_SUBJECT,
  DEFAULT_FREELANCER_INVITATION_BODY,
} from "@/lib/email-templates";

const inputClass =
  "w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p";

export default function InvitationTextSettings({
  initial,
}: {
  initial: { subject: string; body: string };
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();
  const [confirmingReset, setConfirmingReset] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateFreelancerInvitationText({ subject, body });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function reset() {
    setError(null);
    startResetTransition(async () => {
      const res = await resetFreelancerInvitationText();
      if (!res.success) {
        setError(res.error);
        setConfirmingReset(false);
        return;
      }
      setSubject(DEFAULT_FREELANCER_INVITATION_SUBJECT);
      setBody(DEFAULT_FREELANCER_INVITATION_BODY);
      setConfirmingReset(false);
    });
  }

  return (
    <div className="flex flex-col">
      <div className="px-[var(--page-px)] pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Tekster</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Tilpas ordlyden i de automatiske e-mails, jeres virksomhed sender
        </div>
      </div>

      <div className="px-[var(--page-px)] py-[22px] pb-10 max-w-2xl">
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6 mb-4">
          <div className="text-[15px] font-semibold text-pepo-t1 mb-1">
            Email-invitation til nye freelancere
          </div>
          <div className="text-[12.5px] text-pepo-t2 mb-4 leading-relaxed">
            Sendes når I opretter en ny freelancer og trykker &quot;Send invitation&quot;. Emnelinjen og
            brødteksten herunder er jeres egen tekst — nulstil til Pepos standardtekst når som helst.
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Emnelinje
            </label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">
              Brødtekst
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className={inputClass + " resize-y font-mono text-[12.5px] leading-relaxed"}
            />
          </div>

          <div className="rounded-[10px] bg-pepo-su px-3.5 py-3 mb-1">
            <div className="text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-2">
              Kort-koder du kan bruge
            </div>
            <div className="flex flex-col gap-1.5">
              {INVITATION_EMAIL_TOKENS.map((t) => (
                <div key={t.token} className="flex items-baseline gap-2 text-[12.5px]">
                  <code className="bg-pepo-wh border border-pepo-bds rounded px-1.5 py-0.5 text-pepo-p font-mono text-[11.5px] flex-shrink-0">
                    {t.token}
                  </code>
                  <span className="text-pepo-t2">{t.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="h-11 px-4 rounded-[10px] text-[13px] font-medium bg-pepo-p text-white flex items-center gap-1.5 disabled:opacity-40"
          >
            <Icon name="check" size={16} />
            {isSaving ? "Gemmer..." : saved ? "Gemt" : "Gem ændringer"}
          </button>

          {!confirmingReset ? (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="h-11 px-4 rounded-[10px] text-[13px] font-medium bg-pepo-wh text-pepo-t2 border border-pepo-bds hover:bg-pepo-su flex items-center gap-1.5"
            >
              <Icon name="arrow-back-up" size={16} />
              Nulstil til standardtekst
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-[10px] border border-[#F3C9C9] bg-[#FDECEA] px-3.5 py-2.5">
              <span className="text-[12.5px] text-[#C0021A]">Nulstil til Pepos standardtekst?</span>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                disabled={isResetting}
                className="h-8 px-3 rounded-[7px] text-[12px] font-medium bg-pepo-wh border border-pepo-bds text-pepo-t1 disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={isResetting}
                className="h-8 px-3 rounded-[7px] text-[12px] font-medium bg-[#C0021A] text-white disabled:opacity-50"
              >
                {isResetting ? "Nulstiller..." : "Ja, nulstil"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

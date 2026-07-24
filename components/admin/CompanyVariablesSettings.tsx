"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updateCompanyVariables, type CompanyVariablesInput } from "@/app/tenant/(protected)/settings/variables/actions";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"mb-4 " + className}>
      <label className="block text-[11px] font-medium text-pepo-t3 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full border border-pepo-bds rounded-[9px] px-3 py-2.5 text-[13.5px] outline-none focus:border-pepo-p";

export default function CompanyVariablesSettings({ initial }: { initial: CompanyVariablesInput }) {
  const [form, setForm] = useState<CompanyVariablesInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateCompanyVariables(form);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="flex flex-col">
      <div className="px-[var(--page-px)] pt-[22px]">
        <div className="text-[22px] font-semibold tracking-tight text-pepo-t1">Variabler</div>
        <div className="text-[13.5px] text-pepo-t2 mt-[3px]">
          Indstillinger der styrer beregninger og adgangskrav i systemet
        </div>
      </div>

      <div className="px-[var(--page-px)] py-[22px] pb-10 max-w-2xl">
        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6 mb-4">
          <div className="text-[15px] font-semibold text-pepo-t1 mb-1">Transporttillæg</div>
          <div className="text-[12.5px] text-pepo-t2 mb-4 leading-relaxed">
            Beregnes automatisk pr. event som køreafstand tur/retur (fra jeres adresse under Firmaoplysninger
            til eventets sted, og hjem igen) × denne takst × antal freelancere tildelt eventet. Kræver at
            eventets venue har en gyldig adresse.
          </div>

          <Field label="Kr. pr. km. pr. freelancer" className="w-48">
            <input
              value={form.transportRatePerKm}
              onChange={(e) => setForm((f) => ({ ...f, transportRatePerKm: e.target.value }))}
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-6 mb-4">
          <div className="text-[15px] font-semibold text-pepo-t1 mb-1">Geofence til stempel-ur</div>
          <div className="text-[12.5px] text-pepo-t2 mb-4 leading-relaxed">
            Når aktiveret, skal freelanceren være fysisk til stede på event-stedet (inden for radius nedenfor),
            før knappen &quot;Start vagt&quot; i freelancer-appen bliver aktiv. Kræver at freelanceren tillader
            lokationsdeling i browseren, og at eventets venue har en gyldig, Google-valideret adresse.
          </div>

          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              role="switch"
              aria-checked={form.checkinGeofenceEnabled}
              onClick={() => setForm((f) => ({ ...f, checkinGeofenceEnabled: !f.checkinGeofenceEnabled }))}
              className={
                "w-10 h-6 rounded-full flex-shrink-0 relative transition-colors " +
                (form.checkinGeofenceEnabled ? "bg-pepo-p" : "bg-pepo-bd")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform " +
                  (form.checkinGeofenceEnabled ? "translate-x-4" : "translate-x-0")
                }
              />
            </button>
            <span className="text-[13.5px] text-pepo-t1">
              {form.checkinGeofenceEnabled ? "Aktiveret" : "Deaktiveret"}
            </span>
          </div>

          <Field label="Radius (km)" className="w-48">
            <input
              value={form.checkinRadiusKm}
              onChange={(e) => setForm((f) => ({ ...f, checkinRadiusKm: e.target.value }))}
              inputMode="decimal"
              disabled={!form.checkinGeofenceEnabled}
              className={inputClass + (!form.checkinGeofenceEnabled ? " opacity-50" : "")}
            />
          </Field>
        </div>

        {error && (
          <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="h-11 px-4 rounded-[10px] text-[13px] font-medium bg-pepo-p text-white flex items-center gap-1.5 disabled:opacity-40"
        >
          <Icon name="check" size={16} />
          {isSaving ? "Gemmer..." : saved ? "Gemt" : "Gem ændringer"}
        </button>
      </div>
    </div>
  );
}

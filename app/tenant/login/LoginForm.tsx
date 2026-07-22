"use client";

import { useState, useTransition } from "react";
import { login } from "./actions";

export default function LoginForm({
  initialError,
  companyName,
}: {
  initialError: string | null;
  companyName?: string | null;
}) {
  const [error, setError] = useState<string | null>(initialError);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form
      action={handleSubmit}
      className="bg-pepo-wh rounded-[20px] w-full max-w-[380px] p-8 shadow-[0_4px_32px_rgba(62,31,138,0.10)]"
    >
      <div className="flex items-center gap-2.5 mb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pepo-admin-logo.svg" alt="Pepo Admin" className="w-10 h-10 flex-shrink-0" />
        <span className="text-xl font-medium text-pepo-t1">
          {companyName ?? "pepo"} <span className="text-pepo-t3 font-normal">admin</span>
        </span>
      </div>

      <div className="mb-5">
        <div className="text-xl font-medium text-pepo-t1 tracking-tight">
          Log ind
        </div>
        <div className="text-sm text-pepo-t2 mt-1">
          {companyName ? `Adgang for ${companyName}s team` : "Adgang for Pepos interne team"}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-[13px] font-medium text-pepo-t1 mb-[5px]">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          className="w-full border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-sm text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p"
          placeholder="kasper@hjortenfeldt.com"
        />
      </div>

      <div className="mb-5">
        <label className="block text-[13px] font-medium text-pepo-t1 mb-[5px]">
          Adgangskode
        </label>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-sm text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-[46px] rounded-[10px] text-[15px] font-medium bg-pepo-p text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {isPending ? "Logger ind..." : "Log ind"}
      </button>
    </form>
  );
}

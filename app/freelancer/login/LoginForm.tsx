"use client";

import { useRef, useState, useTransition } from "react";
import { sendLoginCode, verifyLoginCode } from "./actions";

export default function LoginForm() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const codeInputRef = useRef<HTMLInputElement>(null);

  function submitEmail(formData: FormData) {
    setError(null);
    const value = String(formData.get("email") || "");
    startTransition(async () => {
      const res = await sendLoginCode(value);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setEmail(value);
      setStep("code");
      setTimeout(() => codeInputRef.current?.focus(), 50);
    });
  }

  function submitCode(formData: FormData) {
    setError(null);
    const value = String(formData.get("code") || "");
    startTransition(async () => {
      const res = await verifyLoginCode(email, value);
      if (!res.success) {
        setError(res.error);
        return;
      }
      window.location.href = "/";
    });
  }

  return (
    <div className="bg-pepo-wh rounded-[20px] w-full max-w-[380px] p-8 shadow-[0_4px_32px_rgba(62,31,138,0.10)] transition-all">
      <div className="flex items-center gap-2.5 mb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pepo-logo.svg" alt="Pepo" className="w-10 h-10 flex-shrink-0" />
        <span className="text-xl font-medium text-pepo-t1">
          pepo <span className="text-pepo-t3 font-normal">freelancer</span>
        </span>
      </div>

      {step === "email" ? (
        <form key="email" action={submitEmail} className="animate-[fadeIn_.25s_ease]">
          <div className="mb-5">
            <div className="text-xl font-medium text-pepo-t1 tracking-tight">Log ind</div>
            <div className="text-sm text-pepo-t2 mt-1">
              Indtast den email, du ansøgte med — vi sender dig en kode.
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-[13px] font-medium text-pepo-t1 mb-[5px]">Email</label>
            <input
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="username"
              className="w-full border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-sm text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p"
              placeholder="dit@navn.dk"
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
            {isPending ? "Sender kode..." : "Send login-kode"}
          </button>
        </form>
      ) : (
        <form key="code" action={submitCode} className="animate-[fadeIn_.25s_ease]">
          <div className="mb-5">
            <div className="text-xl font-medium text-pepo-t1 tracking-tight">Indtast koden</div>
            <div className="text-sm text-pepo-t2 mt-1">
              Vi har sendt en 6-cifret kode til <span className="text-pepo-t1 font-medium">{email}</span>
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-[13px] font-medium text-pepo-t1 mb-[5px]">Kode</label>
            <input
              ref={codeInputRef}
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              className="w-full border border-pepo-bds rounded-[10px] px-[13px] py-2.5 text-[20px] text-pepo-t1 bg-pepo-wh outline-none transition-colors focus:border-pepo-p tracking-[0.3em] text-center font-medium"
              placeholder="000000"
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

          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
            className="w-full h-9 mt-2 text-[13px] font-medium text-pepo-t2 hover:text-pepo-t1 transition-colors"
          >
            Brug en anden email
          </button>
        </form>
      )}
    </div>
  );
}

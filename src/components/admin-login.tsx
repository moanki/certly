"use client";

import type React from "react";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

export function AdminLogin({
  email,
  setEmail,
  password,
  setPassword,
  busy,
  status,
  onSubmit,
}: {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  status: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  return (
    <section className="admin-login relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0716] px-4 py-16">
      {/* animated gradient glow field */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob-anim absolute -left-24 top-[-10%] h-80 w-80 rounded-full bg-[#ff5fae] opacity-40 blur-[90px]" />
        <div className="blob-anim-delay absolute right-[-10%] top-1/3 h-96 w-96 rounded-full bg-[#7c5cff] opacity-40 blur-[100px]" />
        <div className="blob-anim-slow absolute bottom-[-15%] left-1/3 h-96 w-96 rounded-full bg-[#33e8c9] opacity-30 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:24px_24px]" />
      </div>

      <Link className="absolute left-6 top-6 z-10 text-xl font-semibold text-white sm:left-8 sm:top-8" href="/">
        Certly
      </Link>

      <div className="login-card-enter relative w-full max-w-md">
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_80px_-20px_rgba(124,92,255,0.45)] backdrop-blur-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff5fae] via-[#a06bff] to-[#33e8c9] shadow-lg shadow-[#a06bff]/30">
              <ShieldCheck className="h-5 w-5 text-white" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              <Sparkles className="h-3 w-3 text-[#ffd166]" /> Admin access
            </span>
          </div>

          <h2 className="mt-6 bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-white/50">Sign in to manage the Certly question bank.</p>

          <form className="mt-7 grid gap-4" onSubmit={onSubmit}>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">Email</span>
              <div
                className={`flex items-center gap-3 rounded-2xl border bg-white/[0.04] px-4 py-3 transition-all duration-300 ${
                  focusedField === "email" ? "border-[#a06bff] shadow-[0_0_0_4px_rgba(160,107,255,0.15)]" : "border-white/10"
                }`}
              >
                <Mail className={`h-4 w-4 shrink-0 transition-colors ${focusedField === "email" ? "text-[#a06bff]" : "text-white/30"}`} />
                <input
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">Password</span>
              <div
                className={`flex items-center gap-3 rounded-2xl border bg-white/[0.04] px-4 py-3 transition-all duration-300 ${
                  focusedField === "password" ? "border-[#33e8c9] shadow-[0_0_0_4px_rgba(51,232,201,0.15)]" : "border-white/10"
                }`}
              >
                <Lock className={`h-4 w-4 shrink-0 transition-colors ${focusedField === "password" ? "text-[#33e8c9]" : "text-white/30"}`} />
                <input
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="text-white/30 transition-colors hover:text-white/70"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <button
              className="group relative mt-2 flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#ff5fae] via-[#a06bff] to-[#33e8c9] bg-[length:200%_100%] px-4 py-3.5 text-sm font-bold text-white transition-[background-position,transform] duration-500 hover:bg-right active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              type="submit"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-[shine_1.1s_ease]" />
              <span className="relative">{busy ? "Signing in..." : "Sign in"}</span>
            </button>

            <p aria-live="polite" className="min-h-[1.2em] text-center text-xs text-white/40">
              {status}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

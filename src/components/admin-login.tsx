"use client";

import type React from "react";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/lib/theme";

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
    <section className="relative flex min-h-[calc(100vh-73px)] items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-16 transition-colors duration-500">
      {/* animated gradient glow field */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="blob-anim absolute -left-24 top-[-10%] h-80 w-80 rounded-full blur-[90px] transition-opacity duration-500"
          style={{ background: "var(--blob-1)", opacity: "var(--blob-opacity)" }}
        />
        <div
          className="blob-anim-delay absolute right-[-10%] top-1/3 h-96 w-96 rounded-full blur-[100px] transition-opacity duration-500"
          style={{ background: "var(--blob-2)", opacity: "var(--blob-opacity)" }}
        />
        <div
          className="blob-anim-slow absolute bottom-[-15%] left-1/3 h-96 w-96 rounded-full blur-[100px] transition-opacity duration-500"
          style={{ background: "var(--blob-3)", opacity: "calc(var(--blob-opacity) * 0.8)" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--hero-grid)_1px,transparent_0)] [background-size:24px_24px]" />
      </div>

      <ThemeToggle className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-soft)] backdrop-blur-xl transition-colors hover:text-[var(--text)]" />

      <div className="login-card-enter relative w-full max-w-md">
        <div
          className="relative overflow-hidden rounded-[28px] border p-8 backdrop-blur-2xl transition-colors duration-500"
          style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-2">
            <span className="float-icon flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff5fae] via-[#a06bff] to-[#33e8c9] shadow-lg shadow-[#a06bff]/30">
              <ShieldCheck className="h-5 w-5 text-white" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              <Sparkles className="h-3 w-3 text-[#ffd166]" /> Admin access
            </span>
          </div>

          <h2 className="animate-gradient-text mt-6 bg-gradient-to-r from-[#ff5fae] via-[#a06bff] to-[#33e8c9] bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">Sign in to manage the Certly question bank.</p>

          <form className="mt-7 grid gap-4" onSubmit={onSubmit}>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Email</span>
              <div
                className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-300"
                style={{
                  borderColor: focusedField === "email" ? "var(--accent)" : "var(--input-border)",
                  background: "var(--input-bg)",
                  boxShadow: focusedField === "email" ? "0 0 0 4px var(--accent-soft)" : "none",
                }}
              >
                <Mail className={`h-4 w-4 shrink-0 transition-colors ${focusedField === "email" ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}`} />
                <input
                  className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
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
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Password</span>
              <div
                className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-300"
                style={{
                  borderColor: focusedField === "password" ? "var(--success)" : "var(--input-border)",
                  background: "var(--input-bg)",
                  boxShadow: focusedField === "password" ? "0 0 0 4px var(--success-soft)" : "none",
                }}
              >
                <Lock className={`h-4 w-4 shrink-0 transition-colors ${focusedField === "password" ? "text-[var(--success)]" : "text-[var(--text-faint)]"}`} />
                <input
                  className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
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
                  className="text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
                  onClick={() => setShowPassword((value) => !value)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
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

            <p aria-live="polite" className="min-h-[1.2em] text-center text-xs text-[var(--text-faint)]">
              {status}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

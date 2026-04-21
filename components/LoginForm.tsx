// C:\Users\Varun Shetty\Desktop\New folder\bludash\components\LoginForm.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CLIENTS, ClientKey } from "@/lib/auth";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleLogin = () => {
    setLoading(true);
    setError("");
    const client = CLIENTS[username as ClientKey];
    if (!client || client.password !== password) {
      setError("Invalid username or password");
      setLoading(false);
      return;
    }
    localStorage.setItem("bludash_user", JSON.stringify({ username, clientKey: client.clientKey, name: client.name }));
    router.push("/dashboard");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <>
      <style>{`
        .bludash-grid-bg {
          background-image:
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .bludash-grid-bg-light {
          background-image:
            linear-gradient(rgba(30,41,59,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,41,59,0.055) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .bludash-input {
          font-family: var(--font-dm-sans), sans-serif;
        }
        .bludash-input::placeholder {
          font-weight: 300;
        }
        @keyframes bludash-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .bludash-anim-1 { animation: bludash-fade-up 0.5s ease 0.05s both; }
        .bludash-anim-2 { animation: bludash-fade-up 0.5s ease 0.10s both; }
        .bludash-anim-3 { animation: bludash-fade-up 0.5s ease 0.15s both; }
        .bludash-anim-4 { animation: bludash-fade-up 0.5s ease 0.20s both; }
        .bludash-anim-5 { animation: bludash-fade-up 0.5s ease 0.25s both; }
        .bludash-anim-6 { animation: bludash-fade-up 0.5s ease 0.30s both; }
        .bludash-anim-7 { animation: bludash-fade-up 0.5s ease 0.35s both; }
        @keyframes bludash-spin { to { transform: rotate(360deg); } }
        .bludash-spin { animation: bludash-spin 0.8s linear infinite; }
      `}</style>

      <div
        style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}
        className={`m-0 min-h-screen w-full flex items-center justify-center px-6 relative overflow-hidden transition-colors duration-300 ${
          dark ? "bg-[#06060c]" : "bg-[#eef0f6]"
        }`}
      >
        {/* Grid overlay */}
        <div className={`absolute inset-0 pointer-events-none ${dark ? "bludash-grid-bg" : "bludash-grid-bg-light"}`} />

        {/* Ambient glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {dark ? (
            <>
              <div className="absolute top-[20%] left-[30%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-900/18 rounded-full blur-[120px]" />
              <div className="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] bg-blue-950/15 rounded-full blur-[100px]" />
            </>
          ) : (
            <>
              <div className="absolute top-[20%] left-[30%] -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-blue-400/12 rounded-full blur-[130px]" />
              <div className="absolute bottom-[10%] right-[15%] w-[350px] h-[350px] bg-indigo-400/8 rounded-full blur-[110px]" />
            </>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setDark(!dark)}
          className={`absolute top-5 right-5 p-2 rounded-lg border transition-all duration-200 flex items-center justify-center ${
            dark
              ? "bg-white/5 border-white/8 text-white/35 hover:text-white/70 hover:bg-white/8"
              : "bg-slate-900/6 border-slate-900/12 text-slate-500 hover:text-slate-900 hover:bg-slate-900/10"
          }`}
        >
          {dark ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {/* Main content */}
        <div className="relative w-full max-w-[400px] z-10">

          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-8 bludash-anim-1">
            <div className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${dark ? "bg-blue-600" : "bg-blue-700"}`} />
            <span className={`text-[10px] tracking-[0.18em] uppercase font-medium ${dark ? "text-white/28" : "text-slate-500"}`}>
              Analytics Platform
            </span>
            <div className={`flex-1 h-px ${dark ? "bg-gradient-to-r from-white/10 to-transparent" : "bg-gradient-to-r from-slate-400/40 to-transparent"}`} />
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "var(--font-dm-serif), serif",
              fontWeight: 400,
              fontSize: "42px",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
            className={`mb-2 bludash-anim-2 ${dark ? "text-white" : "text-slate-900"}`}
          >
            Welcome to{" "}
            <em style={{
              fontStyle: "italic",
              color: dark ? "rgba(255,255,255,0.38)" : "rgba(71,85,105,0.65)",
            }}>
              Bludash
            </em>
          </h1>

          <p className={`text-[13.5px] font-normal mb-10 bludash-anim-3 ${dark ? "text-white/32" : "text-slate-500"}`}>
            Sign in to continue to your workspace.
          </p>

          {/* Username */}
          <div className="flex flex-col gap-2 mb-4 bludash-anim-4">
            <label className={`text-[10.5px] font-semibold tracking-[0.12em] uppercase ${dark ? "text-white/35" : "text-slate-500"}`}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your username"
              className={`bludash-input w-full px-4 py-3 rounded-[10px] text-sm outline-none transition-all duration-200 ${
                dark
                  ? "bg-white/[0.04] border border-white/9 text-white placeholder:text-white/18 focus:border-blue-500/50 focus:bg-white/[0.06]"
                  : "bg-white/80 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500/70 focus:bg-white"
              }`}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-2 mb-1 bludash-anim-5">
            <label className={`text-[10.5px] font-semibold tracking-[0.12em] uppercase ${dark ? "text-white/35" : "text-slate-500"}`}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your password"
                className={`bludash-input w-full px-4 py-3 pr-11 rounded-[10px] text-sm outline-none transition-all duration-200 ${
                  dark
                    ? "bg-white/[0.04] border border-white/9 text-white placeholder:text-white/18 focus:border-blue-500/50 focus:bg-white/[0.06]"
                    : "bg-white/80 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500/70 focus:bg-white"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 flex items-center justify-center transition-colors duration-200 ${
                  dark ? "text-white/25 hover:text-white/60" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20 mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-[12px] text-red-400">{error}</p>
            </div>
          )}

          {/* Sign in button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="bludash-anim-6 w-full mt-6 py-[13px] rounded-[10px] bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white text-sm font-medium tracking-wide transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
            style={{ boxShadow: "0 1px 3px rgba(29,78,216,0.25), inset 0 1px 0 rgba(255,255,255,0.1)" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="bludash-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Signing in…
              </span>
            ) : "Sign in"}
          </button>

          {/* Footer */}
          <div className="flex items-center gap-3 mt-8 bludash-anim-7">
            <div className={`flex-1 h-px ${dark ? "bg-white/6" : "bg-slate-300/70"}`} />
            <p className={`text-[10px] tracking-[0.05em] ${dark ? "text-white/20" : "text-slate-400"}`}>
              © {new Date().getFullYear()} Bludash
            </p>
            <div className={`flex-1 h-px ${dark ? "bg-white/6" : "bg-slate-300/70"}`} />
          </div>
        </div>
      </div>
    </>
  );
}
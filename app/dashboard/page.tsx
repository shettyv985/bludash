"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClientDropdown from "@/components/dashboard/ClientDropdown";
import OptionDropdown from "@/components/dashboard/OptionDropdown";
import DateRangePicker from "@/components/dashboard/DateRangePicker";
import PlatformToggle from "@/components/dashboard/PlatformToggle";
import SocialMediaReport from "@/components/dashboard/SocialMediaReport";

type Platform = "FB" | "IG" | "BOTH";

export default function DashboardPage() {
  const router = useRouter();
  const [dark, setDark] = useState(true);
  const [user, setUser] = useState<{ name: string; clientKey: string } | null>(null);

  const [client, setClient] = useState("");
  const [option, setOption] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [platform, setPlatform] = useState<Platform>("BOTH");
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("bludash_user");
    if (!stored) { router.push("/login"); return; }
    const parsed = JSON.parse(stored);
    setUser(parsed);
    if (parsed.clientKey !== "ALL") setClient(parsed.clientKey);
  }, [router]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleLogout = () => {
    localStorage.removeItem("bludash_user");
    router.push("/login");
  };

  const handleGenerate = () => {
    if (!client || !option || !fromDate || !toDate) return;
    setShowReport(true);
  };

  const handleBack = () => setShowReport(false);

  const isReady = client && option && fromDate && toDate;

  if (!user) return null;

  return (
    <>
      <style>{`
        .dash-grid-bg {
          background-image:
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .dash-grid-bg-light {
          background-image:
            linear-gradient(rgba(30,41,59,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,41,59,0.055) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        @keyframes dash-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dash-anim { animation: dash-fade-up 0.45s ease both; }
        .dash-anim-1 { animation: dash-fade-up 0.45s ease 0.05s both; }
        .dash-anim-2 { animation: dash-fade-up 0.45s ease 0.10s both; }
        .dash-anim-3 { animation: dash-fade-up 0.45s ease 0.15s both; }
        .dash-anim-4 { animation: dash-fade-up 0.45s ease 0.20s both; }
        .dash-anim-5 { animation: dash-fade-up 0.45s ease 0.25s both; }
        .dash-anim-6 { animation: dash-fade-up 0.45s ease 0.30s both; }
      `}</style>

      <div
        style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}
        className={`m-0 min-h-screen w-full flex flex-col transition-colors duration-300 relative overflow-x-hidden ${
          dark ? "bg-[#06060c]" : "bg-[#eef0f6]"
        }`}
      >
        {/* Grid overlay */}
        <div className={`absolute inset-0 pointer-events-none ${dark ? "dash-grid-bg" : "dash-grid-bg-light"}`} />

        {/* Ambient glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {dark ? (
            <>
              <div className="absolute top-[15%] left-[40%] -translate-x-1/2 w-[600px] h-[400px] bg-blue-900/18 rounded-full blur-[120px]" />
              <div className="absolute bottom-[20%] right-[10%] w-[300px] h-[300px] bg-blue-950/12 rounded-full blur-[100px]" />
            </>
          ) : (
            <>
              <div className="absolute top-[15%] left-[40%] -translate-x-1/2 w-[700px] h-[500px] bg-blue-400/12 rounded-full blur-[130px]" />
              <div className="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] bg-indigo-400/8 rounded-full blur-[110px]" />
            </>
          )}
        </div>

        {/* Navbar */}
        <nav className={`relative z-10 flex items-center justify-between px-6 py-4 border-b ${
          dark ? "border-white/[0.05]" : "border-slate-200/80"
        }`}>
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-[7px] h-[7px] rounded-full bg-blue-600 flex-shrink-0" />
            <div className="flex items-baseline gap-[1px]">
              <span
                style={{ fontFamily: "var(--font-dm-serif), serif", fontStyle: "italic" }}
                className={`text-[20px] font-normal tracking-tight ${dark ? "text-white" : "text-slate-900"}`}
              >
                Blu
              </span>
              <span
                style={{ fontFamily: "var(--font-dm-serif), serif" }}
                className="text-[20px] font-normal tracking-tight text-blue-600"
              >
                dash
              </span>
            </div>
          </div>

          {/* Nav right */}
          <div className="flex items-center gap-2">
            {/* User badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              dark ? "border-white/8 bg-white/[0.03]" : "border-slate-200 bg-white/60"
            }`}>
              <div className="w-[6px] h-[6px] rounded-full bg-emerald-500/80" />
              <span className={`text-[12px] font-normal ${dark ? "text-white/45" : "text-slate-500"}`}>
                {user.name}
              </span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={() => setDark(!dark)}
              className={`p-2 rounded-lg border transition-all duration-200 flex items-center justify-center ${
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

            {/* Logout */}
            <button
              onClick={handleLogout}
              className={`text-[12px] px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                dark
                  ? "border-white/8 text-white/35 hover:text-white/70 hover:border-white/15 hover:bg-white/[0.03]"
                  : "border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-100/60"
              }`}
            >
              Logout
            </button>
          </div>
        </nav>

        {/* Main */}
        <main className="relative z-10 flex-1 px-4 py-12">
          {!showReport ? (
            <div className="w-full max-w-[480px] mx-auto">

              {/* Page heading */}
              <div className="mb-8 dash-anim-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-[7px] h-[7px] rounded-full bg-blue-600 flex-shrink-0" />
                  <span className={`text-[10px] tracking-[0.18em] uppercase font-medium ${dark ? "text-white/28" : "text-slate-500"}`}>
                    Report Builder
                  </span>
                  <div className={`flex-1 h-px ${dark ? "bg-gradient-to-r from-white/10 to-transparent" : "bg-gradient-to-r from-slate-400/40 to-transparent"}`} />
                </div>
                <h1
                  style={{
                    fontFamily: "var(--font-dm-serif), serif",
                    fontWeight: 400,
                    fontSize: "32px",
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                  }}
                  className={dark ? "text-white" : "text-slate-900"}
                >
                  Generate a{" "}
                  <em style={{ fontStyle: "italic", color: dark ? "rgba(255,255,255,0.38)" : "rgba(71,85,105,0.65)" }}>
                    report
                  </em>
                </h1>
                <p className={`text-[13px] mt-1.5 font-normal ${dark ? "text-white/30" : "text-slate-500"}`}>
                  Configure the filters below to generate your analytics report.
                </p>
              </div>

              {/* Form fields */}
              <div className="flex flex-col gap-4">
                <div className="dash-anim-2">
                  <ClientDropdown clientKey={user.clientKey} value={client} onChange={setClient} dark={dark} />
                </div>
                <div className="dash-anim-3">
                  <OptionDropdown value={option} onChange={setOption} dark={dark} />
                </div>
                <div className="dash-anim-4">
                  <DateRangePicker from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} dark={dark} />
                </div>
                <div className="dash-anim-5">
                  <PlatformToggle value={platform} onChange={setPlatform} dark={dark} />
                </div>

                <div className="dash-anim-6">
                  {/* Divider */}
                  <div className={`h-px w-full mb-4 ${dark ? "bg-white/[0.05]" : "bg-slate-200/80"}`} />

                  <button
                    onClick={handleGenerate}
                    disabled={!isReady}
                    className="w-full py-[13px] rounded-[10px] bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white text-sm font-medium tracking-wide transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ boxShadow: isReady ? "0 1px 3px rgba(29,78,216,0.25), inset 0 1px 0 rgba(255,255,255,0.1)" : "none" }}
                  >
                    {isReady ? "Generate report" : "Complete all fields to continue"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <SocialMediaReport
              client={client}
              from={fromDate}
              to={toDate}
              platform={platform}
              dark={dark}
              onBack={handleBack}
            />
          )}
        </main>
      </div>
    </>
  );
}
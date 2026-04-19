"use client";

type Platform = "FB" | "IG" | "BOTH";

interface Props {
  value: Platform;
  onChange: (val: Platform) => void;
  dark: boolean;
}

export default function PlatformToggle({ value, onChange, dark }: Props) {
  const options: { label: string; value: Platform }[] = [
    { label: "Facebook", value: "FB" },
    { label: "Instagram", value: "IG" },
    { label: "Both", value: "BOTH" },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-[11px] font-semibold tracking-[2px] uppercase ${dark ? "text-white/35" : "text-black/35"}`}>
        Platform
      </label>
      <div className={`flex rounded-xl p-1 gap-1 ${dark ? "bg-white/[0.03] border border-white/[0.07]" : "bg-black/[0.03] border border-black/[0.08]"}`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              value === opt.value
                ? "bg-blue-600 text-white shadow-[0_2px_12px_rgba(59,130,246,0.35)]"
                : dark
                ? "text-white/30 hover:text-white/60"
                : "text-black/30 hover:text-black/60"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
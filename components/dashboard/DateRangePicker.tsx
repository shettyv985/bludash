"use client";

interface Props {
  from: string;
  to: string;
  onFromChange: (val: string) => void;
  onToChange: (val: string) => void;
  dark: boolean;
}

export default function DateRangePicker({ from, to, onFromChange, onToChange, dark }: Props) {
  const inputClass = `w-full px-4 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none cursor-pointer ${dark
    ? "bg-white/[0.03] border border-white/[0.07] text-white focus:border-blue-500/40 [color-scheme:dark]"
    : "bg-black/[0.03] border border-black/[0.08] text-[#0a0a14] focus:border-blue-500/50"
  }`;

  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-[11px] font-semibold tracking-[2px] uppercase ${dark ? "text-white/35" : "text-black/35"}`}>
        Date Range
      </label>
      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-1">
          <span className={`text-[10px] ${dark ? "text-white/20" : "text-black/25"}`}>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <span className={`text-[10px] ${dark ? "text-white/20" : "text-black/25"}`}>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
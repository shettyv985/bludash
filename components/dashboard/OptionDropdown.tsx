// C:\Users\Varun Shetty\Desktop\New folder\bludash\components\dashboard\OptionDropdown.tsx
"use client";

interface Props {
  value: string;
  onChange: (val: string) => void;
  dark: boolean;
}

export default function OptionDropdown({ value, onChange, dark }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-[11px] font-semibold tracking-[2px] uppercase ${dark ? "text-white/35" : "text-black/35"}`}>
        Report Type
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={dark ? { colorScheme: "dark" } : { colorScheme: "light" }}
        className={`w-full px-4 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none appearance-none cursor-pointer ${
          dark
            ? "bg-[#0f1017] border border-white/[0.07] text-white focus:border-blue-500/40 [&>option]:bg-[#0f1017] [&>option]:text-white"
            : "bg-white border border-black/[0.08] text-[#0a0a14] focus:border-blue-500/50 [&>option]:bg-white [&>option]:text-[#0a0a14]"
        }`}
      >
        <option value="" disabled>Select type</option>
        <option value="social_media">Social Media</option>
        <option value="performance">Performance</option>
      </select>
    </div>
  );
}
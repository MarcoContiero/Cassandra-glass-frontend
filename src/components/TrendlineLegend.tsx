// src/components/TrendlineLegend.tsx
"use client";

export default function TrendlineLegend() {
  return (
    <div className="rounded-2xl bg-black/70 text-white text-[10px] px-3 py-2 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="h-1 w-6 rounded-full bg-red-500" />
        Resistenze (dai massimi)
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="h-1 w-6 rounded-full bg-teal-400" />
        Supporti (dai minimi)
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="h-1 w-6 rounded-full bg-gray-400" />
        Storiche / ghost
      </div>
    </div>
  );
}

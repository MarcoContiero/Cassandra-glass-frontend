'use client';

export default function Tifide3Panel() {
  return (
    <div className="w-full h-[calc(100vh-56px)] flex flex-col gap-3 p-3 md:p-4">
      <div className="flex items-center gap-3">
        <span className="text-cyan-400/50 text-base">⬡</span>
        <span className="text-sm font-semibold text-white/80">Tifi 4.0</span>
        <a
          className="ml-auto text-xs text-white/30 hover:text-cyan-300 transition-colors"
          href="/tifide3"
          target="_blank"
          rel="noreferrer"
        >
          ↗ apri in tab
        </a>
      </div>

      <div
        className="flex-1 rounded-2xl overflow-hidden border border-white/[0.07]"
        style={{
          boxShadow: '0 0 0 1px rgba(6,182,212,0.04) inset',
        }}
      >
        <iframe src="/tifide3" className="w-full h-full" />
      </div>
    </div>
  );
}
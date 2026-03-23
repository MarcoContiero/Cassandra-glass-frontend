'use client';

export default function Tifide3Panel() {
  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col gap-3 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">TIFI 3.5</div>
        <a
          className="text-xs underline opacity-70 hover:opacity-100"
          href="/tifide3"
          target="_blank"
          rel="noreferrer"
        >
        </a>
      </div>

      <div className="flex-1 rounded-2xl border border-white/10 overflow-hidden">
        <iframe
          src="/tifide3"
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
// components/BoxDownloadButtons.tsx
'use client';
export default function BoxDownloadButtons({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const qs = `symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;
  return (
    <div className="flex gap-2">
      <a
        href={`/api/box/story.txt?${qs}`}
        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
        download
      >
        Scarica storia .txt
      </a>
      <a
        href={`/api/box/box.png?${qs}`}
        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
        download
      >
        Scarica immagine .png
      </a>
    </div>
  );
}

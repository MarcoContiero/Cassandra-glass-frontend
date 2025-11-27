// src/components/overlays/PatternsOverlay.tsx
"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { PatternItem } from "@/types/patterns";

export default function PatternsOverlay({
  open, onOpenChange, dataByTF
}: { open: boolean; onOpenChange: (v: boolean) => void; dataByTF: Record<string, PatternItem[]> }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed inset-2 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-[min(100vw,900px)] max-h-[85vh] overflow-auto rounded-2xl bg-zinc-900 p-4 md:p-6 shadow-2xl">
          <Dialog.Title className="text-white/90 text-lg md:text-xl font-semibold">📐 Pattern Riconosciuti</Dialog.Title>
          <div className="mt-4 space-y-6">
            {Object.entries(dataByTF).map(([tf, items]) => (
              <div key={tf}>
                <div className="text-white/60 text-xs mb-2">{tf} • {items.length} pattern</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((p, idx) => (
                    <div key={tf + idx} className="rounded-xl border border-white/10 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-white font-medium">{p.name}</div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.side === "long" ? "bg-emerald-500/20 text-emerald-300" :
                            p.side === "short" ? "bg-rose-500/20 text-rose-300" :
                              "bg-zinc-700 text-zinc-300"
                          }`}>{p.side}</span>
                      </div>
                      <div className="mt-1 text-white/70 text-xs">
                        {p.code} · {p.status} · conf {Math.round(p.confidence * 100)}%
                      </div>
                      <div className="mt-2 text-white/80 text-sm">
                        {p.levels?.trigger ? <>Trigger: <span className="font-mono">{p.levels.trigger}</span><br /></> : null}
                        {p.levels?.invalidation ? <>Invalid.: <span className="font-mono">{p.levels.invalidation}</span></> : null}
                      </div>
                      {p.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">
                        {p.tags.map((t, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/60">{t}</span>)}
                      </div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Dialog.Close className="absolute top-2 right-3 text-white/60 hover:text-white">✕</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

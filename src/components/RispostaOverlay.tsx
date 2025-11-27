import { X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ReactNode } from "react"

type Props = {
  titolo: string
  risposta?: string
  onClose: () => void
  children?: ReactNode            // 👈 add this
}

function LiquidityList({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-sm opacity-80">Nessun livello trovato.</div>;
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 text-xs uppercase opacity-60 px-1">
        <div>Prezzo</div><div>Lato</div><div>Tipi</div><div>Score</div><div>Status</div>
      </div>
      <div className="divide-y divide-white/10">
        {data.map((l: any, i: number) => (
          <div key={i} className="grid grid-cols-5 items-center px-1 py-2 text-sm">
            <div className="tabular-nums">{l.price?.toLocaleString?.() ?? l.price}</div>
            <div className={l.side === 'sell-side' ? 'text-red-400' : 'text-emerald-400'}>
              {l.side === 'sell-side' ? 'Sell-side' : 'Buy-side'}
            </div>
            <div className="truncate" title={Array.isArray(l.types) ? l.types.join(' + ') : ''}>
              {Array.isArray(l.types) ? l.types.join(' + ') : ''}
            </div>
            <div className="font-medium">{l.score}</div>
            <div className="opacity-80">{l.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RispostaOverlay({ titolo, risposta, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur">
      <Card className="relative w-full max-w-2xl p-5 bg-zinc-900/90 text-white">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 hover:opacity-80"
          aria-label="Chiudi"
        >
          <X />
        </button>

        <h2 className="text-xl font-semibold mb-4">{titolo}</h2>

        {/* If children are passed (like the SR panel), render them.
            Otherwise fall back to the text answer */}
        {children ? (
          <div>{children}</div>
        ) : (
          <pre className="whitespace-pre-wrap leading-6 text-zinc-200">
            {risposta}
          </pre>
        )}
      </Card>
    </div>
  )
}

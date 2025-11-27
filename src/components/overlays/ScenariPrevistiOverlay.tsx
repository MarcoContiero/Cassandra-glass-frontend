// src/components/overlays/ScenariPrevistiOverlay.tsx
"use client";

import { useMemo } from "react";
import SafeDialogContent from "@/components/ui/SafeDialogContent";

/* ======================= Tipi & util ======================= */
type Zona = [number, number] | null;

type ViewScenario = {
  title: string;
  subtitle?: string;
  sequence?: string;
  trigger?: string;
  entry?: string;          // testo esposto (range o numero)
  stop?: string;
  target?: string;
  invalidation?: string;
  reasons?: string;        // motivi sintetici
  explanation?: string;    // spiegazione estesa
  badge?: string;
  dir?: string;            // LONG | SHORT | NEUTRO
};

function fmtPrice(p?: number | null) {
  if (p == null || !Number.isFinite(p)) return "—";
  const dec = Math.abs(p) >= 10000 ? 0 : 2;
  return p.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtZona(z: Zona): string {
  if (!z) return "—";
  return `${fmtPrice(z[0])}–${fmtPrice(z[1])}`;
}

function normalizeScenario(raw: any, idx: number): ViewScenario {
  const titolo = raw?.titolo ?? raw?.nome ?? `Scenario ${String.fromCharCode(65 + idx)}`;
  const sottotitolo = raw?.sottotitolo ?? undefined;

  const sequence =
    raw?.sequenza ??
    (Array.isArray(raw?.path_steps) ? String(raw.path_steps.join(" → ")) : undefined);

  const trigger = raw?.trigger ?? undefined;
  const invalidation = raw?.invalidazione ?? raw?.invalida ?? undefined;

  const entry =
    raw?.entry ??
    (raw?.entry_zone ? fmtZona(raw.entry_zone as Zona) : undefined);
  const stop =
    raw?.stop ??
    (raw?.stop_zone ? fmtZona(raw.stop_zone as Zona) : undefined);
  const target =
    raw?.target ??
    (raw?.target_zone ? fmtZona(raw.target_zone as Zona) : undefined);

  const reasons =
    raw?.motivi ??
    (Array.isArray(raw?.motivazioni) ? raw.motivazioni.join(" • ") : undefined);

  const explanation =
    raw?.spiegazione ??
    raw?.explanation ??
    raw?.explain ??
    reasons ??
    undefined;

  const dir = String(raw?.direzione || "").toUpperCase();
  const badge = raw?.badge ?? (dir === "LONG" ? "LONG" : dir === "SHORT" ? "SHORT" : dir || undefined);

  return {
    title: String(titolo),
    subtitle: sottotitolo ? String(sottotitolo) : undefined,
    sequence: sequence ? String(sequence) : undefined,
    trigger: trigger ? String(trigger) : undefined,
    entry: entry ? String(entry) : undefined,
    stop: stop ? String(stop) : undefined,
    target: target ? String(target) : undefined,
    invalidation: invalidation ? String(invalidation) : undefined,
    reasons: reasons ? String(reasons) : undefined,
    explanation: explanation ? String(explanation) : undefined,
    badge,
    dir,
  };
}

/* ---- parser numeri (range IT “3.201,00–3.220,50”, ecc.) ---- */
const toNumber = (s: string): number | null => {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.,\-]/g, "");
  if (!cleaned) return null;

  if (cleaned.includes(".") && cleaned.includes(",")) {
    const js = cleaned.replace(/\./g, "").replace(",", ".");
    const n = Number(js);
    return Number.isFinite(n) ? n : null;
  }
  if (!cleaned.includes(".") && cleaned.includes(",")) {
    const js = cleaned.replace(",", ".");
    const n = Number(js);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const numbersFromText = (text?: string): number[] => {
  if (!text) return [];
  // spezza in possibili token e gestisci range "a–b"
  const parts = String(text).split(/[\s;\/]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const m = p.split(/[–—-]/).map((x) => x.trim()).filter(Boolean);
    if (m.length === 2) {
      const a = toNumber(m[0]);
      const b = toNumber(m[1]);
      if (a != null) out.push(a);
      if (b != null) out.push(b);
      continue;
    }
    const n = toNumber(p);
    if (n != null) out.push(n);
  }
  return out;
};

const midpoint = (a: number, b: number) => (a + b) / 2;
const valueForPlot = (text?: string): number | null => {
  const nums = numbersFromText(text);
  if (nums.length >= 2) return midpoint(nums[0], nums[1]); // midpoint del primo range
  if (nums.length === 1) return nums[0];
  return null;
};

/* ================= Mini-grafico SVG inline (con freccia) ================= */
function MiniScenarioSketch({
  points,             // [{ value:number, label:string }]
  dir = "NEUTRO",     // LONG | SHORT | NEUTRO (colore freccia)
  width = 620,
  height = 120,
  padding = 20,
  className = "",
}: {
  points: { value: number; label: string }[];
  dir?: string;
  width?: number;
  height?: number;
  padding?: number;
  className?: string;
}) {
  const vals = (points || []).map(p => p.value).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mid = (min + max) / 2;
  let range = max - min;

  // amplifica se troppo piatto (1% del valore medio)
  const minPct = 0.01;
  const minRange = Math.abs(mid) * minPct || 1;
  if (range < minRange) range = minRange;

  const w = width, h = height, pad = padding;
  const stepX = (w - pad * 2) / (vals.length - 1);

  const pts = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (p.value - min) / range);
    return { x, y, label: p.label, value: p.value };
  });

  // delta minimo visivo tra punti consecutivi
  const minDY = 8;
  for (let i = 1; i < pts.length; i++) {
    const dy = pts[i].y - pts[i - 1].y;
    if (Math.abs(dy) < minDY) {
      const dirSgn = dy === 0 ? (i % 2 ? -1 : 1) : Math.sign(dy);
      pts[i].y = Math.max(pad, Math.min(h - pad, pts[i - 1].y + dirSgn * minDY));
    }
  }

  const poly = pts.map(p => `${p.x},${p.y}`).join(" ");

  // freccia sull'ultimo segmento
  const pA = pts[pts.length - 2];
  const pB = pts[pts.length - 1];
  const vx = pB.x - pA.x;
  const vy = pB.y - pA.y;
  const len = Math.max(Math.hypot(vx, vy), 0.001);
  const ux = vx / len;
  const uy = vy / len;
  const arrowLen = 12;         // lunghezza freccia
  const arrowW = 6;            // metà larghezza
  const endX = pB.x;
  const endY = pB.y;
  const leftX = endX - arrowLen * ux + arrowW * uy;
  const leftY = endY - arrowLen * uy - arrowW * ux;
  const rightX = endX - arrowLen * ux - arrowW * uy;
  const rightY = endY - arrowLen * uy + arrowW * ux;

  const strokeColor = "#f0f0f0";
  const arrowColor =
    dir === "LONG" ? "#16a34a"   // verde
      : dir === "SHORT" ? "#ef4444" // rosso
        : "#9ca3af";                  // grigio

  return (
    <div className={`rounded-xl bg-black/30 border border-white/10 p-2 ${className}`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <polyline
          points={poly}
          fill="none"
          stroke={strokeColor}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* puntini */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.8} fill={strokeColor} />
        ))}
        {/* freccia finale */}
        <polygon
          points={`${endX},${endY} ${leftX},${leftY} ${rightX},${rightY}`}
          fill={arrowColor}
          opacity="0.9"
        />
        {/* etichette (testo identico a quello delle card) */}
        {pts.map((p, i) => (
          <text
            key={`t-${i}`}
            x={p.x}
            y={h - 10}
            textAnchor="middle"
            fontSize="13"
            fill="#ffb400"
            fontFamily="monospace"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ===================== Overlay principale ===================== */
export default function ScenariPrevistiOverlay({
  title = "Scenari previsti",
  data,
}: {
  title?: string;
  data?: any;
}) {
  const price: number | null = data?.prezzo_corrente ?? data?.last_price ?? null;
  const priceStr = useMemo(() => fmtPrice(price ?? undefined), [price]);

  const scenari: ViewScenario[] = useMemo(() => {
    const rawList =
      (Array.isArray(data?.scenari_previsti) && data.scenari_previsti) ||
      (Array.isArray(data?.scenari) && data.scenari) ||
      [];
    return rawList.map((s: any, i: number) => normalizeScenario(s, i));
  }, [data]);

  // 🔧 GUARD: nessuno scenario → empty state (deve stare dopo la dichiarazione di `scenari`)
  if (!Array.isArray(scenari) || scenari.length === 0) {
    return (
      <SafeDialogContent title={String(title)}>
        <div className="p-4 text-sm text-white/70">
          Nessuno scenario disponibile sui TF selezionati.
        </div>
      </SafeDialogContent>
    );
  }

  const narrativa: string | undefined =
    data?.narrativa_prevista || data?.narrativa || undefined;

  return (
    <SafeDialogContent title={String(title)} description={narrativa || undefined}>
      <section className="space-y-4 p-4">
        {/* Header prezzo */}
        {price != null && (
          <div className="text-sm text-white/80">
            <span className="opacity-70">Prezzo: </span>
            <span className="px-2 py-1 rounded bg-white/10 border border-white/15 font-mono tabular-nums">
              {priceStr}
            </span>
          </div>
        )}

        {/* Grid scenari */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          {scenari.map((s, idx) => {
            // punti: entry → stop → target (senza mettere il prezzo in testa)
            const pts: { value: number; label: string }[] = [];
            const entryVal = valueForPlot(s.entry);
            if (entryVal != null && s.entry) pts.push({ value: entryVal, label: s.entry });
            const stopVal = valueForPlot(s.stop);
            if (stopVal != null && s.stop) pts.push({ value: stopVal, label: s.stop });
            const targetVal = valueForPlot(s.target);
            if (targetVal != null && s.target) pts.push({ value: targetVal, label: s.target });

            const showSketch = pts.length >= 2;

            return (
              <article
                key={idx}
                className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 flex flex-col min-w-0 overflow-hidden"
              >
                {/* Titolo + badge */}
                <header className="flex items-start justify-between gap-3 mb-3">
                  <h4 className="text-base font-semibold leading-tight wrap-break-words">
                    {s.title}
                  </h4>
                  {s.badge && (
                    <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">
                      {s.badge}
                    </span>
                  )}
                </header>

                {/* Sottotitolo */}
                {s.subtitle && (
                  <p className="text-sm text-white/80 mb-2 leading-snug wrap-break-words">
                    {s.subtitle}
                  </p>
                )}

                {/* Sequenza */}
                {s.sequence && (
                  <p className="text-xs text-white/70 mb-3 leading-relaxed wrap-break-words">
                    <span className="opacity-70">Sequenza: </span>
                    {s.sequence}
                  </p>
                )}

                {/* Mini-grafico per questo scenario (con freccia) */}
                {showSketch && (
                  <MiniScenarioSketch points={pts} dir={s.dir ?? s.badge ?? "NEUTRO"} className="mb-3" />
                )}

                {/* Blocchi tecnici + SPIEGAZIONE (tutto DENTRO la card) */}
                <dl className="space-y-2 text-sm">
                  {s.trigger && (
                    <div className="rounded-lg bg-black/30 border border-white/10 p-2">
                      <dt className="text-xs uppercase tracking-wide opacity-70">Trigger</dt>
                      <dd className="wrap-break-words">{s.trigger}</dd>
                    </div>
                  )}

                  {(s.entry || s.stop || s.target) && (
                    <div className="grid grid-cols-3 gap-2">
                      {s.entry && (
                        <div className="rounded-lg bg-black/30 border border-white/10 p-2">
                          <dt className="text-xs uppercase tracking-wide opacity-70">Entry</dt>
                          <dd className="font-mono text-sm wrap-break-words">{s.entry}</dd>
                        </div>
                      )}
                      {s.stop && (
                        <div className="rounded-lg bg-black/30 border border-white/10 p-2">
                          <dt className="text-xs uppercase tracking-wide opacity-70">Stop</dt>
                          <dd className="font-mono text-sm wrap-break-words">{s.stop}</dd>
                        </div>
                      )}
                      {s.target && (
                        <div className="rounded-lg bg-black/30 border border-white/10 p-2">
                          <dt className="text-xs uppercase tracking-wide opacity-70">Target</dt>
                          <dd className="font-mono text-sm wrap-break-words">{s.target}</dd>
                        </div>
                      )}
                    </div>
                  )}

                  {s.invalidation && (
                    <div className="rounded-lg bg-black/30 border border-white/10 p-2">
                      <dt className="text-xs uppercase tracking-wide opacity-70">Invalidazione</dt>
                      <dd className="wrap-break-words">{s.invalidation}</dd>
                    </div>
                  )}

                  {/* Motivi sintetici (se presenti) */}
                  {s.reasons && (
                    <div className="rounded-lg bg-black/30 border border-white/10 p-2">
                      <dt className="text-xs uppercase tracking-wide opacity-70">Motivi</dt>
                      <dd className="wrap-break-words">{s.reasons}</dd>
                    </div>
                  )}

                  {/* ✅ Spiegazione estesa (SEMPRE dentro la card) */}
                  {s.explanation && (
                    <div className="rounded-lg bg-black/25 border border-white/10 p-3">
                      <dt className="text-xs uppercase tracking-wide opacity-70">Spiegazione</dt>
                      <dd className="text-[13px] leading-relaxed whitespace-pre-wrap wrap-break-words">
                        {s.explanation}
                      </dd>
                    </div>
                  )}
                </dl>
              </article>
            );
          })}
        </div>

        {/* Narrativa estesa complessiva (fuori dalle card per scelta) */}
        {narrativa && (
          <div className="rounded-xl bg-black/40 border border-white/10 p-3">
            <div className="text-xs font-mono whitespace-pre-wrap leading-relaxed wrap-break-words">
              {narrativa}
            </div>
          </div>
        )}
      </section>
    </SafeDialogContent>
  );
}

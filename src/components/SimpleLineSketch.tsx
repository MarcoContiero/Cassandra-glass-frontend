"use client";

type Props = {
  /** Valori in ordine: verranno spaziati orizzontalmente in modo uniforme */
  values: number[];
  /** Larghezza/altezza svg */
  width?: number;
  height?: number;
  /** Margine interno per non tagliare i label */
  padding?: number;
  /** Classe extra per container */
  className?: string;
};

export default function SimpleLineSketch({
  values,
  width = 640,
  height = 240,
  padding = 24,
  className = "",
}: Props) {
  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const dy = max - min || 1; // evita div/0
  const w = width;
  const h = height;
  const pad = padding;

  // punti uniformemente distanziati
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + stepX * i;
    // y invertito (alto=valori alti)
    const y = pad + (h - pad * 2) * (1 - (v - min) / dy);
    return { x, y, v };
  });

  const poly = points.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 ${className}`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* linea */}
        <polyline
          points={poly}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          className="text-zinc-200"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* punti + labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} className="fill-zinc-200" />
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="14"
              className="fill-amber-400"
            >
              {p.v.toLocaleString("it-IT")}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

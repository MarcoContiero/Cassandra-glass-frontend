'use client';

import { useEffect, useRef } from 'react';

// ── Definizione costellazioni ──────────────────────────────────────────────

type StarDef = {
  name: string;
  bayer: string;
  // coordinate normalizzate [0,1] relative al box
  x: number;
  y: number;
  size: number; // raggio base in px
};

type ConstellationDef = {
  name: string;
  stars: StarDef[];
  // coppie di indici per i collegamenti (linee)
  lines: [number, number][];
};

// Croce del Sud — 5 stelle
const CRUCE: ConstellationDef = {
  name: 'Croce del Sud',
  stars: [
    { name: 'Gacrux',  bayer: 'γ Crucis', x: 0.50, y: 0.12, size: 3.5 }, // cima
    { name: 'Acrux',   bayer: 'α Crucis', x: 0.50, y: 0.86, size: 4.5 }, // base (più luminosa)
    { name: 'Mimosa',  bayer: 'β Crucis', x: 0.82, y: 0.48, size: 4.0 }, // destra
    { name: 'Imai',    bayer: 'δ Crucis', x: 0.22, y: 0.52, size: 3.0 }, // sinistra
    { name: 'ε Crucis',bayer: 'ε Crucis', x: 0.64, y: 0.62, size: 2.5 }, // quinta stella
  ],
  lines: [[0,1],[2,3],[0,4]],
};

// Cigno — 10 stelle (forma a croce / cigno in volo)
const CIGNO: ConstellationDef = {
  name: 'Cigno',
  stars: [
    { name: 'Deneb',      bayer: 'α Cygni',  x: 0.72, y: 0.10, size: 4.5 }, // coda
    { name: 'Sadr',       bayer: 'γ Cygni',  x: 0.50, y: 0.44, size: 3.5 }, // petto (centro)
    { name: 'Albireo',    bayer: 'β Cygni',  x: 0.30, y: 0.82, size: 3.5 }, // testa
    { name: 'Fawaris',    bayer: 'δ Cygni',  x: 0.18, y: 0.38, size: 3.0 }, // ala sinistra
    { name: 'Aljanah',    bayer: 'ε Cygni',  x: 0.80, y: 0.52, size: 3.0 }, // ala destra
    { name: 'Azelfafage', bayer: 'π¹ Cygni', x: 0.88, y: 0.22, size: 2.5 },
    { name: 'ζ Cygni',    bayer: 'ζ Cygni',  x: 0.60, y: 0.70, size: 2.0 },
    { name: 'η Cygni',    bayer: 'η Cygni',  x: 0.38, y: 0.64, size: 2.0 },
    { name: 'ι Cygni',    bayer: 'ι Cygni',  x: 0.24, y: 0.22, size: 2.0 },
    { name: 'κ Cygni',    bayer: 'κ Cygni',  x: 0.10, y: 0.55, size: 2.0 },
  ],
  lines: [[0,1],[1,2],[3,1],[1,4],[0,5],[1,6],[2,7],[3,9]],
};

// Sagittario — 15 stelle (forma a teiera)
const SAGITTARIO: ConstellationDef = {
  name: 'Sagittario',
  stars: [
    { name: 'Kaus Australis', bayer: 'ε Sgr', x: 0.75, y: 0.78, size: 4.5 },
    { name: 'Nunki',          bayer: 'σ Sgr', x: 0.80, y: 0.22, size: 4.0 },
    { name: 'Ascella',        bayer: 'ζ Sgr', x: 0.60, y: 0.85, size: 3.5 },
    { name: 'Kaus Media',     bayer: 'δ Sgr', x: 0.65, y: 0.60, size: 3.5 },
    { name: 'Kaus Borealis',  bayer: 'λ Sgr', x: 0.58, y: 0.38, size: 3.0 },
    { name: 'Albaldah',       bayer: 'π Sgr', x: 0.72, y: 0.42, size: 3.0 },
    { name: 'Alnasl',         bayer: 'γ² Sgr',x: 0.42, y: 0.50, size: 3.0 },
    { name: 'Sephdar',        bayer: 'η Sgr', x: 0.30, y: 0.72, size: 2.5 },
    { name: 'Nanto',          bayer: 'φ Sgr', x: 0.48, y: 0.68, size: 2.5 },
    { name: 'Hecatebolus',    bayer: 'τ Sgr', x: 0.88, y: 0.55, size: 2.5 },
    { name: 'Polis',          bayer: 'μ Sgr', x: 0.35, y: 0.32, size: 2.5 },
    { name: 'Arkab Prior',    bayer: 'β¹ Sgr',x: 0.18, y: 0.58, size: 2.5 },
    { name: 'Rukbat',         bayer: 'α Sgr', x: 0.20, y: 0.78, size: 2.5 },
    { name: 'Arkab Posterior',bayer: 'β² Sgr',x: 0.22, y: 0.68, size: 2.0 },
    { name: 'Manubrium',      bayer: 'ο Sgr', x: 0.52, y: 0.22, size: 2.0 },
  ],
  lines: [
    [0,2],[2,3],[3,0],[3,4],[4,6],[6,7],[7,11],[11,12],[12,13],[13,7],
    [4,5],[5,1],[1,9],[9,0],[4,14],[14,10],
  ],
};

const CONSTELLATIONS: Record<string, ConstellationDef> = {
  orione:    CRUCE,
  argonauta: CIGNO,
  agema:     SAGITTARIO,
};

// ── Componente ────────────────────────────────────────────────────────────

interface TierConstellationProps {
  tier: 'orione' | 'argonauta' | 'agema';
  starsUsed: number;
  /** Se true, mostra i nomi delle stelle al hover (SVG statico, no canvas) */
  showNames?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const GOLD        = '#c9a84c';
const GOLD_BRIGHT = '#f0d080';
const DIM         = 'rgba(201,168,76,0.18)';
const LINE_LIT    = 'rgba(201,168,76,0.35)';
const LINE_DIM    = 'rgba(201,168,76,0.08)';

export default function TierConstellation({
  tier,
  starsUsed,
  showNames = false,
  className,
  style,
}: TierConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const phaseRef  = useRef(0);

  const constell = CONSTELLATIONS[tier] ?? CRUCE;
  const total = constell.stars.length;
  const lit   = Math.min(starsUsed, total);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, W, H);

      phaseRef.current += 0.018;
      const t = phaseRef.current;

      // Linee
      for (const [a, b] of constell.lines) {
        const sa = constell.stars[a];
        const sb = constell.stars[b];
        const bothLit = a < lit && b < lit;

        ctx.beginPath();
        ctx.moveTo(sa.x * W, sa.y * H);
        ctx.lineTo(sb.x * W, sb.y * H);
        ctx.strokeStyle = bothLit ? LINE_LIT : LINE_DIM;
        ctx.lineWidth = bothLit ? 0.8 : 0.5;
        ctx.stroke();
      }

      // Stelle
      constell.stars.forEach((s, i) => {
        const px = s.x * W;
        const py = s.y * H;
        const isLit = i < lit;

        if (isLit) {
          // Halo pulsante
          const pulse = 0.55 + 0.45 * Math.sin(t + i * 0.9);
          const grad = ctx.createRadialGradient(px, py, 0, px, py, s.size * 3.5 * pulse);
          grad.addColorStop(0, `rgba(240,208,128,${0.30 * pulse})`);
          grad.addColorStop(1, 'rgba(201,168,76,0)');
          ctx.beginPath();
          ctx.arc(px, py, s.size * 3.5 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();

          // Nucleo
          ctx.beginPath();
          ctx.arc(px, py, s.size, 0, Math.PI * 2);
          ctx.fillStyle = GOLD_BRIGHT;
          ctx.fill();
        } else {
          // Stella spenta
          ctx.beginPath();
          ctx.arc(px, py, s.size * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = DIM;
          ctx.fill();
        }
      });

      // Effetto completamento
      if (lit === total && total > 0) {
        const masterPulse = 0.5 + 0.5 * Math.sin(t * 1.3);
        ctx.strokeStyle = `rgba(201,168,76,${0.15 * masterPulse})`;
        ctx.lineWidth = 1;
        const cx = W / 2;
        const cy = H / 2;
        const r  = Math.min(W, H) * 0.42;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [lit, total, constell]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={260}
        height={260}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Label contatore */}
      <div style={{
        position: 'absolute',
        bottom: '8px',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        color: lit === total
          ? 'var(--color-gold)'
          : 'var(--color-text-dim)',
        pointerEvents: 'none',
      }}>
        {lit === total && total > 0
          ? `${constell.name} — completa`
          : `${lit} / ${total} stelle`}
      </div>

      {/* Nomi stelle (opzionale) */}
      {showNames && (
        <svg
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
          }}
          viewBox="0 0 260 260"
        >
          {constell.stars.map((s, i) => (
            <text
              key={s.bayer}
              x={s.x * 260 + 6}
              y={s.y * 260 - 4}
              fontSize="7"
              fill={i < lit ? 'rgba(201,168,76,0.8)' : 'rgba(201,168,76,0.2)'}
              fontFamily="monospace"
            >
              {s.name}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

// Esporta la lista stelle per uso esterno (es. per sapere quante stelle ha un tier)
export function getTierStars(tier: 'orione' | 'argonauta' | 'agema'): StarDef[] {
  return (CONSTELLATIONS[tier] ?? CRUCE).stars;
}

export function getTierTotal(tier: 'orione' | 'argonauta' | 'agema'): number {
  return getTierStars(tier).length;
}

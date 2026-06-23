'use client';

import React, { useEffect, useRef, useState } from 'react';

// ── Theme hook ────────────────────────────────────────────────────────────────

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

// ── Dark mode: canvas stellato ────────────────────────────────────────────────

// Costellazioni nominate, ognuna rappresenta un modulo di Cassandra
const CONSTELLATIONS = [
  {
    name: 'CASSANDRA',
    // W-shape simile a Cassiopeia
    stars: [[0.50, 0.10], [0.46, 0.15], [0.50, 0.19], [0.54, 0.15], [0.58, 0.11]],
    edges: [[0,1],[1,2],[2,3],[3,4]],
    color: '#c9a84c',
    labelStar: 4,
    period: 12000,
  },
  {
    name: 'ORIONE',
    // Forma di Orione: cintura + spalle + piedi
    stars: [
      [0.14, 0.39], [0.17, 0.41], [0.20, 0.43], // cintura
      [0.11, 0.33], [0.22, 0.34],                 // spalle
      [0.09, 0.50], [0.24, 0.52],                 // piedi
    ],
    edges: [[0,1],[1,2],[3,0],[4,2],[3,4],[0,5],[2,6]],
    color: '#0abfbc',
    labelStar: 4,
    period: 16000,
  },
  {
    name: 'ARGONAUTA',
    // Forma di nave a vela
    stars: [[0.80, 0.20], [0.75, 0.26], [0.85, 0.26], [0.77, 0.32], [0.83, 0.32], [0.80, 0.38]],
    edges: [[0,1],[0,2],[1,3],[2,4],[3,5],[4,5],[1,4],[2,3]],
    color: '#0abfbc',
    labelStar: 2,
    period: 20000,
  },
  {
    name: 'AGEMA',
    // Forma di scudo/formazione militare
    stars: [[0.22, 0.68], [0.27, 0.63], [0.32, 0.68], [0.27, 0.74]],
    edges: [[0,1],[1,2],[2,3],[3,0],[0,2]],
    color: '#0abfbc',
    labelStar: 2,
    period: 14000,
  },
  {
    name: 'LE TRE MOIRE',
    // Tre stelle in fila con connessioni
    stars: [[0.65, 0.70], [0.70, 0.65], [0.75, 0.70], [0.68, 0.76], [0.72, 0.76]],
    edges: [[0,1],[1,2],[0,3],[2,4],[3,4],[1,3],[1,4]],
    color: '#9a7a3a',
    labelStar: 2,
    period: 18000,
  },
  {
    name: 'PIZIA',
    // Forma di tripode (triangolo con vertice in alto)
    stars: [[0.88, 0.52], [0.84, 0.60], [0.92, 0.60], [0.88, 0.67]],
    edges: [[0,1],[0,2],[1,3],[2,3],[1,2]],
    color: '#9a7a3a',
    labelStar: 0,
    period: 22000,
  },
];

type BGStar = {
  x: number; y: number;
  size: number; brightness: number;
  twinkleSpeed: number; twinklePhase: number;
};
type ShootingStar = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; };

function StarryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const tRef      = useRef(0);
  const starsRef  = useRef<BGStar[]>([]);
  const shootRef  = useRef<ShootingStar[]>([]);
  const glowRef   = useRef<number[]>(CONSTELLATIONS.map(() => 0));
  const glowDirRef = useRef<number[]>(CONSTELLATIONS.map(() => 0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Stelle di sfondo
    starsRef.current = Array.from({ length: 380 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 0.25 + Math.random() * 1.1,
      brightness: 0.12 + Math.random() * 0.55,
      twinkleSpeed: 0.006 + Math.random() * 0.022,
      twinklePhase: Math.random() * Math.PI * 2,
    }));

    // Pianifica l'illuminazione a cascata delle costellazioni
    CONSTELLATIONS.forEach((_, i) => {
      const startDelay = 1500 + i * 2800 + Math.random() * 3000;
      const scheduleNext = (delay: number) => {
        setTimeout(() => {
          glowDirRef.current[i] = 1;
        }, delay);
      };
      scheduleNext(startDelay);
    });

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      tRef.current += 0.0004;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#02020e';
      ctx.fillRect(0, 0, W, H);

      // Via Lattea diagonale
      const mw = ctx.createLinearGradient(0, H, W, 0);
      mw.addColorStop(0,    'rgba(28,22,65,0)');
      mw.addColorStop(0.42, 'rgba(28,22,65,0.14)');
      mw.addColorStop(0.58, 'rgba(28,22,65,0.09)');
      mw.addColorStop(1,    'rgba(28,22,65,0)');
      ctx.fillStyle = mw;
      ctx.fillRect(0, 0, W, H);

      // Stelle di sfondo
      starsRef.current.forEach(s => {
        s.twinklePhase += s.twinkleSpeed;
        const tw = s.brightness * (0.55 + 0.45 * Math.sin(s.twinklePhase));
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(205,205,245,${tw})`;
        ctx.fill();
      });

      // Costellazioni
      const t = tRef.current;
      CONSTELLATIONS.forEach((def, ci) => {
        // Aggiorna glow
        let glow = glowRef.current[ci];
        const dir = glowDirRef.current[ci];
        if (dir === 1) {
          glow = Math.min(1, glow + 0.008);
          glowRef.current[ci] = glow;
          if (glow >= 1) glowDirRef.current[ci] = -1;
        } else if (dir === -1) {
          glow = Math.max(0, glow - 0.004);
          glowRef.current[ci] = glow;
          if (glow <= 0) {
            glowDirRef.current[ci] = 0;
            // Prossima illuminazione
            const next = def.period + (Math.random() - 0.5) * def.period * 0.4;
            setTimeout(() => { glowDirRef.current[ci] = 1; }, next);
          }
        }

        const baseA = 0.12 + glow * 0.65;
        const edgeA = 0.06 + glow * 0.28;

        // Leggero drift lento per ogni costellazione
        const dx = Math.sin(t * 0.25 + ci * 1.3) * 0.0018 * W;
        const dy = Math.cos(t * 0.18 + ci * 1.1) * 0.001 * H;

        const pts = def.stars.map(([nx, ny]) => ({ x: nx * W + dx, y: ny * H + dy }));

        // Linee di connessione
        const edgeHex = Math.round(edgeA * 255).toString(16).padStart(2, '0');
        ctx.strokeStyle = def.color + edgeHex;
        ctx.lineWidth = 0.4 + glow * 0.7;
        def.edges.forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        });

        // Stelle della costellazione
        pts.forEach(pt => {
          if (glow > 0.05) {
            const radius = (2 + glow * 14);
            const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
            grd.addColorStop(0, def.color + Math.round(glow * 70).toString(16).padStart(2, '0'));
            grd.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = grd;
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5 + glow * 1.2, 0, Math.PI * 2);
          ctx.fillStyle = def.color + Math.round(baseA * 255).toString(16).padStart(2, '0');
          ctx.fill();
        });

        // Etichetta (appare solo quando brilla abbastanza)
        if (glow > 0.25) {
          const lp = pts[def.labelStar];
          const labelA = Math.min(1, (glow - 0.25) * 1.5);
          ctx.fillStyle = def.color + Math.round(labelA * 180).toString(16).padStart(2, '0');
          ctx.font = `300 7.5px 'JetBrains Mono', monospace`;
          ctx.letterSpacing = '0.18em';
          ctx.fillText(def.name, lp.x + 9, lp.y + 3);
        }
      });

      // Stelle cadenti
      if (Math.random() < 0.0025) {
        const sx = Math.random() * W * 0.75;
        const sy = Math.random() * H * 0.35;
        const angle = Math.PI * 0.14 + Math.random() * 0.22;
        const speed = 4.5 + Math.random() * 4;
        shootRef.current.push({
          x: sx, y: sy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0, maxLife: 28 + Math.random() * 22,
        });
      }
      shootRef.current = shootRef.current.filter(s => {
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        const prog  = s.life / s.maxLife;
        const alpha = prog < 0.25 ? prog / 0.25 : 1 - (prog - 0.25) / 0.75;
        // Scia
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 7, s.y - s.vy * 7);
        grad.addColorStop(0, `rgba(201,168,76,${alpha * 0.85})`);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 7, s.y - s.vy * 7);
        ctx.strokeStyle = grad as unknown as string;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Punto luminoso
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.5 * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,220,160,${alpha})`;
        ctx.fill();
        return s.life < s.maxLife;
      });

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', display: 'block' }}
    />
  );
}

// ── Light mode: vasi greci ────────────────────────────────────────────────────

const FIGURE_COLOR = '#6b3a0f'; // terracotta scuro

function Fig({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', pointerEvents: 'none', opacity: 0.13, zIndex: 0, ...style }}>
      {children}
    </div>
  );
}

// Cassandra — profetessa con le braccia alzate
function SvgCassandra() {
  return (
    <svg width="90" height="185" viewBox="0 0 90 185" fill="none">
      {/* Testa */}
      <circle cx="45" cy="16" r="11" fill={FIGURE_COLOR} />
      {/* Velo/capelli */}
      <path d="M35 10 Q45 3 55 10" stroke={FIGURE_COLOR} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M34 12 Q22 8 18 18" stroke={FIGURE_COLOR} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M56 12 Q68 8 72 18" stroke={FIGURE_COLOR} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Collo */}
      <rect x="42" y="26" width="6" height="6" rx="1" fill={FIGURE_COLOR} />
      {/* Corpo — chitone drappeggiato */}
      <path d="M20 33 L32 30 L45 30 L58 30 L70 33 L72 108 L18 108 Z" fill={FIGURE_COLOR} />
      {/* Cintura */}
      <path d="M22 52 Q45 48 68 52" stroke="#f8f6f0" strokeWidth="1.5" fill="none" />
      {/* Drappeggio linee */}
      <path d="M25 60 L28 105 M38 58 L39 107 M52 58 L51 107 M65 60 L62 105" stroke="#f8f6f0" strokeWidth="1" opacity="0.6" />
      {/* Braccio sinistro alzato */}
      <path d="M22 40 Q12 28 8 16" stroke={FIGURE_COLOR} strokeWidth="6" strokeLinecap="round" fill="none" />
      {/* Braccio destro alzato */}
      <path d="M68 40 Q78 28 82 16" stroke={FIGURE_COLOR} strokeWidth="6" strokeLinecap="round" fill="none" />
      {/* Mani */}
      <circle cx="7" cy="14" r="4" fill={FIGURE_COLOR} />
      <circle cx="83" cy="14" r="4" fill={FIGURE_COLOR} />
      {/* Gambe */}
      <path d="M35 108 L32 148 L28 172" stroke={FIGURE_COLOR} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M55 108 L58 148 L62 172" stroke={FIGURE_COLOR} strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Piedi / sandali */}
      <path d="M22 172 L36 172" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" />
      <path d="M58 172 L72 172" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" />
      {/* Orlo decorativo */}
      <path d="M18 108 L72 108" stroke={FIGURE_COLOR} strokeWidth="2" />
    </svg>
  );
}

// Orione — cacciatore con lancia
function SvgOrione() {
  return (
    <svg width="95" height="195" viewBox="0 0 95 195" fill="none">
      {/* Elmo con cimiero */}
      <path d="M24 18 Q40 12 58 16 L60 28 L40 30 L22 28 Z" fill={FIGURE_COLOR} />
      <path d="M40 12 L38 3 L43 1 L45 10" fill={FIGURE_COLOR} />
      {/* Pennacchio */}
      <path d="M41 3 Q35 -3 40 -8 Q46 -3 44 3" fill={FIGURE_COLOR} />
      {/* Testa */}
      <circle cx="41" cy="38" r="13" fill={FIGURE_COLOR} />
      {/* Corpo — corazza */}
      <path d="M20 52 L41 50 L62 52 L66 98 L16 98 Z" fill={FIGURE_COLOR} />
      {/* Dettaglio corazza */}
      <path d="M24 65 Q41 60 58 65" stroke="#f8f6f0" strokeWidth="1.5" fill="none" />
      <path d="M26 75 Q41 71 56 75" stroke="#f8f6f0" strokeWidth="1" fill="none" />
      {/* Pauldron sinistro */}
      <path d="M20 52 L6 58 L10 66 L22 60 Z" fill={FIGURE_COLOR} />
      {/* Lancia (braccio destro esteso verso l'alto) */}
      <path d="M62 58 L84 14" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" />
      <path d="M84 14 L87 4 L78 10 Z" fill={FIGURE_COLOR} />
      {/* Scudo (braccio sinistro) */}
      <path d="M20 58 L2 60 L-1 80 L2 98 L20 98 Z" fill={FIGURE_COLOR} />
      {/* Emblema scudo */}
      <circle cx="9" cy="78" r="7" stroke="#f8f6f0" strokeWidth="1.5" fill="none" />
      <path d="M9 72 L9 84 M3 78 L15 78" stroke="#f8f6f0" strokeWidth="1" />
      {/* Ptèruges */}
      <path d="M20 98 L18 118 M28 98 L27 120 M36 98 L36 121 M46 98 L46 121 M54 98 L54 120 M62 98 L64 118" stroke={FIGURE_COLOR} strokeWidth="5" strokeLinecap="round" />
      {/* Gambe */}
      <path d="M32 118 L29 162 L26 186" stroke={FIGURE_COLOR} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M50 118 L53 162 L56 186" stroke={FIGURE_COLOR} strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* Schinieri */}
      <path d="M22 150 L36 150" stroke={FIGURE_COLOR} strokeWidth="2" />
      <path d="M49 150 L63 150" stroke={FIGURE_COLOR} strokeWidth="2" />
      {/* Sandali */}
      <path d="M20 186 L34 186" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" />
      <path d="M52 186 L66 186" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Argo — la nave degli Argonauti
function SvgArgo() {
  return (
    <svg width="300" height="115" viewBox="0 0 300 115" fill="none">
      {/* Scafo */}
      <path d="M12 70 Q35 80 90 83 Q150 87 210 83 Q255 80 288 70 L278 90 Q210 105 150 107 Q90 105 22 90 Z" fill={FIGURE_COLOR} />
      {/* Decorazione scafo — fascia */}
      <path d="M25 85 Q150 93 275 85" stroke="#f8f6f0" strokeWidth="1.5" strokeDasharray="5 8" fill="none" />
      {/* Linea chiglia */}
      <path d="M22 90 Q150 108 278 90" stroke={FIGURE_COLOR} strokeWidth="3" fill="none" />
      {/* Albero maestro */}
      <line x1="150" y1="83" x2="150" y2="6" stroke={FIGURE_COLOR} strokeWidth="4" />
      {/* Antenna di trinchetto */}
      <line x1="112" y1="22" x2="188" y2="22" stroke={FIGURE_COLOR} strokeWidth="2.5" />
      {/* Vela */}
      <path d="M113 22 Q148 28 150 58 Q152 72 150 80 Q130 70 112 55 Q108 38 113 22 Z" fill={FIGURE_COLOR} opacity="0.82" />
      <path d="M187 22 Q152 28 150 58 Q148 72 150 80 Q170 70 188 55 Q192 38 187 22 Z" fill={FIGURE_COLOR} opacity="0.82" />
      {/* Cuciture vela */}
      <line x1="150" y1="22" x2="150" y2="80" stroke="#f8f6f0" strokeWidth="1.5" />
      <line x1="118" y1="38" x2="182" y2="38" stroke="#f8f6f0" strokeWidth="1" />
      <line x1="114" y1="56" x2="186" y2="56" stroke="#f8f6f0" strokeWidth="1" />
      {/* Remi */}
      <path d="M58 83 L42 108" stroke={FIGURE_COLOR} strokeWidth="3" strokeLinecap="round" />
      <path d="M85 85 L75 112" stroke={FIGURE_COLOR} strokeWidth="3" strokeLinecap="round" />
      <path d="M215 85 L225 112" stroke={FIGURE_COLOR} strokeWidth="3" strokeLinecap="round" />
      <path d="M242 83 L258 108" stroke={FIGURE_COLOR} strokeWidth="3" strokeLinecap="round" />
      {/* Polena (testa di ariete) */}
      <path d="M12 70 Q2 60 6 50 Q14 44 20 52 Q16 58 12 65" fill={FIGURE_COLOR} />
      {/* Aplustro (decorazione di poppa) */}
      <path d="M288 70 Q298 60 295 50 L288 54 Q292 62 288 70" fill={FIGURE_COLOR} />
      {/* Equipaggio (figure semplificate) */}
      <circle cx="108" cy="68" r="5.5" fill={FIGURE_COLOR} />
      <rect x="104" y="72" width="8" height="9" rx="1" fill={FIGURE_COLOR} />
      <circle cx="135" cy="66" r="5.5" fill={FIGURE_COLOR} />
      <rect x="131" y="70" width="8" height="9" rx="1" fill={FIGURE_COLOR} />
      <circle cx="165" cy="66" r="5.5" fill={FIGURE_COLOR} />
      <rect x="161" y="70" width="8" height="9" rx="1" fill={FIGURE_COLOR} />
      <circle cx="192" cy="68" r="5.5" fill={FIGURE_COLOR} />
      <rect x="188" y="72" width="8" height="9" rx="1" fill={FIGURE_COLOR} />
    </svg>
  );
}

// Tre Moire — tre figure femminili con fuso, misura e forbici
function SvgTreMoire() {
  function Moira({ ox, tool }: { ox: number; tool: 'fuso' | 'misura' | 'forbici' }) {
    return (
      <>
        <circle cx={ox} cy={16} r={10} fill={FIGURE_COLOR} />
        <path d={`M${ox-8} 11 Q${ox} 5 ${ox+8} 11`} stroke={FIGURE_COLOR} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d={`M${ox-16} 28 L${ox-10} 26 L${ox} 26 L${ox+10} 26 L${ox+16} 28 L${ox+18} 96 L${ox-18} 96 Z`} fill={FIGURE_COLOR} />
        <path d={`M${ox-15} 45 Q${ox} 41 ${ox+15} 45`} stroke="#f8f6f0" strokeWidth="1.5" fill="none" />
        <path d={`M${ox-14} 68 Q${ox} 65 ${ox+14} 68`} stroke="#f8f6f0" strokeWidth="1" fill="none" />
        <path d={`M${ox-18} 90 L${ox+18} 90`} stroke="#f8f6f0" strokeWidth="1.5" />
        <path d={`M${ox-7} 96 L${ox-8} 130`} stroke={FIGURE_COLOR} strokeWidth="6" strokeLinecap="round" />
        <path d={`M${ox+7} 96 L${ox+8} 130`} stroke={FIGURE_COLOR} strokeWidth="6" strokeLinecap="round" />
        {tool === 'fuso' && (
          <>
            <path d={`M${ox+10} 34 L${ox+24} 16`} stroke={FIGURE_COLOR} strokeWidth="2.5" strokeLinecap="round" />
            <ellipse cx={ox+27} cy={13} rx={5} ry={3} fill={FIGURE_COLOR} />
            <circle cx={ox+12} cy={38} r={3} fill={FIGURE_COLOR} />
          </>
        )}
        {tool === 'misura' && (
          <>
            <path d={`M${ox-10} 32 L${ox-28} 52`} stroke={FIGURE_COLOR} strokeWidth="3.5" strokeLinecap="round" />
            <path d={`M${ox-28} 52 L${ox-32} 48 M${ox-28} 52 L${ox-32} 56`} stroke={FIGURE_COLOR} strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {tool === 'forbici' && (
          <>
            <path d={`M${ox+10} 34 L${ox+28} 20`} stroke={FIGURE_COLOR} strokeWidth="2.5" strokeLinecap="round" />
            <path d={`M${ox+10} 40 L${ox+28} 28`} stroke={FIGURE_COLOR} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={ox+12} cy={37} r={3.5} fill={FIGURE_COLOR} />
          </>
        )}
      </>
    );
  }
  return (
    <svg width="230" height="145" viewBox="0 0 230 145" fill="none">
      <Moira ox={38} tool="fuso" />
      <Moira ox={115} tool="misura" />
      <Moira ox={192} tool="forbici" />
      {/* Il filo del destino che le collega */}
      <path d="M62 32 Q78 18 88 36 Q100 22 115 30 Q130 20 142 34 Q155 18 168 32" stroke={FIGURE_COLOR} strokeWidth="1.5" strokeDasharray="4 5" fill="none" opacity="0.7" />
    </svg>
  );
}

// Pizia — l'oracolo sul tripode
function SvgPizia() {
  return (
    <svg width="130" height="185" viewBox="0 0 130 185" fill="none">
      {/* Gambe del tripode */}
      <path d="M65 172 L22 172 L42 102" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M65 172 L108 172 L88 102" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* Barra trasversale */}
      <path d="M42 102 L88 102" stroke={FIGURE_COLOR} strokeWidth="3.5" />
      {/* Calderone sul tripode */}
      <path d="M32 102 Q65 96 98 102 Q96 118 65 122 Q34 118 32 102 Z" fill={FIGURE_COLOR} />
      {/* Vapori sacri */}
      <path d="M52 122 Q47 135 53 147 Q58 136 55 124" stroke={FIGURE_COLOR} strokeWidth="1.5" strokeDasharray="3 4" fill="none" opacity="0.55" />
      <path d="M78 122 Q83 135 77 148 Q72 136 75 124" stroke={FIGURE_COLOR} strokeWidth="1.5" strokeDasharray="3 4" fill="none" opacity="0.55" />
      {/* Figura seduta */}
      <path d="M32 80 L65 78 L98 80 L98 102 L32 102 Z" fill={FIGURE_COLOR} />
      {/* Drappeggio */}
      <path d="M36 85 L38 100 M50 83 L51 101 M80 83 L79 101 M94 85 L92 100" stroke="#f8f6f0" strokeWidth="1" opacity="0.6" />
      {/* Testa */}
      <circle cx="65" cy="62" r="15" fill={FIGURE_COLOR} />
      {/* Corona d'alloro */}
      <path d="M52 54 Q55 46 65 50 Q75 46 78 54" stroke="#f8f6f0" strokeWidth="2" fill="none" />
      <path d="M52 54 L48 50 M57 50 L54 45 M65 48 L65 43 M73 50 L76 45 M78 54 L82 50" stroke={FIGURE_COLOR} strokeWidth="2" strokeLinecap="round" />
      {/* Braccio con ramo di alloro */}
      <path d="M32 88 L12 78 L6 68" stroke={FIGURE_COLOR} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M6 68 Q-2 58 4 46" stroke={FIGURE_COLOR} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M5 62 L0 56 M3 56 L-2 50 M6 50 L2 44" stroke={FIGURE_COLOR} strokeWidth="2" strokeLinecap="round" />
      {/* Altro braccio */}
      <path d="M98 88 L118 84 L122 78" stroke={FIGURE_COLOR} strokeWidth="6" strokeLinecap="round" fill="none" />
      {/* Bordo decorativo del tripode */}
      <path d="M32 102 Q42 108 65 110 Q88 108 98 102" stroke="#f8f6f0" strokeWidth="1" fill="none" />
    </svg>
  );
}

// Agema — guerriero con scudo e lancia
function SvgAgema() {
  return (
    <svg width="95" height="200" viewBox="0 0 95 200" fill="none">
      {/* Elmo corinzio */}
      <path d="M26 22 Q42 14 60 18 L62 28 L42 30 L24 28 Z" fill={FIGURE_COLOR} />
      {/* Cimiero */}
      <path d="M42 14 Q36 4 40 -2 Q44 4 46 12" fill={FIGURE_COLOR} />
      <path d="M40 14 Q35 7 38 1 Q43 7 44 14" fill={FIGURE_COLOR} opacity="0.6" />
      {/* Testa */}
      <circle cx="42" cy="38" r="14" fill={FIGURE_COLOR} />
      {/* Paragnatidi dell'elmo */}
      <path d="M30 25 Q26 32 28 40" stroke={FIGURE_COLOR} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M54 25 Q58 32 56 40" stroke={FIGURE_COLOR} strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Corpo — linothorax */}
      <path d="M18 52 L42 50 L66 52 L70 98 L14 98 Z" fill={FIGURE_COLOR} />
      {/* Dettagli corazza */}
      <path d="M22 62 Q42 57 62 62" stroke="#f8f6f0" strokeWidth="1.5" fill="none" />
      <path d="M20 73 Q42 69 64 73" stroke="#f8f6f0" strokeWidth="1" fill="none" />
      {/* Spallaccio sinistro */}
      <path d="M18 52 L4 56 L8 66 L20 60 Z" fill={FIGURE_COLOR} />
      {/* Lancia */}
      <path d="M66 58 L90 10" stroke={FIGURE_COLOR} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M90 10 L93 1 L83 7 Z" fill={FIGURE_COLOR} />
      {/* Scudo (forma ovale allungata) */}
      <path d="M18 56 L0 58 L-4 80 L0 100 L18 98 Z" fill={FIGURE_COLOR} />
      <ellipse cx="8" cy="78" rx="8" ry="10" stroke="#f8f6f0" strokeWidth="1.5" fill="none" />
      <path d="M8 70 L8 86 M1 78 L15 78" stroke="#f8f6f0" strokeWidth="1" />
      {/* Ptèruges */}
      <path d="M16 98 L14 120 M24 98 L23 122 M32 98 L32 122 M42 98 L42 122 M52 98 L52 122 M62 98 L64 120 M70 98 L73 118" stroke={FIGURE_COLOR} strokeWidth="5" strokeLinecap="round" />
      {/* Gambe */}
      <path d="M30 120 L27 165 L24 188" stroke={FIGURE_COLOR} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M54 120 L57 165 L60 188" stroke={FIGURE_COLOR} strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* Schinieri */}
      <path d="M20 150 L35 150" stroke={FIGURE_COLOR} strokeWidth="2" />
      <path d="M52 150 L66 150" stroke={FIGURE_COLOR} strokeWidth="2" />
      {/* Sandali */}
      <path d="M18 188 L32 188" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" />
      <path d="M56 188 L70 188" stroke={FIGURE_COLOR} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Bordo meandro greco (decorativo)
function Meander({ w = 1600 }: { w?: number }) {
  const unit = 20;
  const reps = Math.ceil(w / unit);
  const parts: string[] = [];
  for (let i = 0; i < reps; i++) {
    const x = i * unit;
    parts.push(`M${x},18 L${x},4 L${x+8},4 L${x+8},14 L${x+16},14 L${x+16},0 L${x+20},0`);
  }
  return (
    <svg width={w} height={22} viewBox={`0 0 ${w} 22`} fill="none" style={{ display: 'block' }}>
      <path d={parts.join(' ')} stroke={FIGURE_COLOR} strokeWidth="1.8" fill="none" />
    </svg>
  );
}

function GreekBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Bordo meandro in alto */}
      <div style={{ position: 'absolute', top: 58, left: 0, right: 0, opacity: 0.09 }}>
        <Meander />
      </div>
      {/* Bordo meandro in basso */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: 0.09, transform: 'scaleY(-1)' }}>
        <Meander />
      </div>

      {/* Cassandra — in basso a sinistra */}
      <Fig style={{ bottom: '4%', left: '1.5%' }}>
        <SvgCassandra />
      </Fig>

      {/* Agema — in basso a destra */}
      <Fig style={{ bottom: '3%', right: '1.5%' }}>
        <SvgAgema />
      </Fig>

      {/* Orione — in alto a destra */}
      <Fig style={{ top: '7%', right: '1%' }}>
        <SvgOrione />
      </Fig>

      {/* Pizia — a destra, metà pagina */}
      <Fig style={{ top: '38%', right: '0.5%' }}>
        <SvgPizia />
      </Fig>

      {/* Tre Moire — a sinistra, metà pagina */}
      <Fig style={{ top: '42%', left: '0.5%' }}>
        <SvgTreMoire />
      </Fig>

      {/* Argo — in basso, centrata */}
      <Fig style={{ bottom: '20%', left: '50%', transform: 'translateX(-50%)' }}>
        <SvgArgo />
      </Fig>
    </div>
  );
}

// ── Export principale ─────────────────────────────────────────────────────────

export default function CassandraBackground() {
  const theme = useTheme();
  if (theme === 'light') return <GreekBackground />;
  return <StarryCanvas />;
}

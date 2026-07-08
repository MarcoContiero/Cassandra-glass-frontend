'use client';

import { useEffect, useRef } from 'react';
import StarfieldBackground from './StarfieldBackground';

export type StarHomeModule = 'cassandra' | 'orione' | 'argonauta' | 'agema' | 'dna' | 'costellazioni';

interface StarHomeProps {
  isFirstVisit: boolean;
  onModuleSelect: (module: StarHomeModule) => void;
}

type StarPoint = { x: number; y: number };

type ConstellationDef = {
  key: StarHomeModule;
  name: string;
  color: string;
  points: StarPoint[];
  edges: [number, number][];
  orbit: 'inner' | 'outer' | null; // null = Cassandra, fissa al centro
  initialAngleDeg: number;
};

// Coordinate/edge/colori 1:1 dalla spec (cassandra-home-stellare-spec.md, sez. "Le 6 costellazioni")
const CONSTELLATIONS: ConstellationDef[] = [
  {
    key: 'cassandra', name: 'CASSANDRA', color: '#c9a84c', orbit: null, initialAngleDeg: 0,
    points: [
      { x: 0, y: 0 },      // 0 centro
      { x: 0, y: -2 },     // 1 N
      { x: 1.4, y: -1.4 }, // 2 NE
      { x: 2, y: 0 },      // 3 E
      { x: 1.4, y: 1.4 },  // 4 SE
      { x: 0, y: 2 },      // 5 S
      { x: -1.4, y: 1.4 }, // 6 SO
      { x: -2, y: 0 },     // 7 O
      { x: -1.4, y: -1.4 }, // 8 NO
    ],
    edges: [[1, 5], [2, 6], [3, 7], [4, 8]],
  },
  {
    key: 'orione', name: 'ORIONE', color: '#0abfbc', orbit: 'inner', initialAngleDeg: 0,
    points: [
      { x: -1.2, y: -2 },  // 0 Betelgeuse
      { x: 1.2, y: -1.8 }, // 1 Bellatrix
      { x: -0.6, y: 0 },   // 2 Alnitak
      { x: 0, y: 0 },      // 3 Alnilam
      { x: 0.6, y: 0 },    // 4 Mintaka
      { x: -1, y: 2 },     // 5 Saiph
      { x: 1.2, y: 2.2 },  // 6 Rigel
    ],
    edges: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]],
  },
  {
    key: 'argonauta', name: 'ARGONAUTA', color: '#c9a84c', orbit: 'inner', initialAngleDeg: 180,
    points: [
      { x: 0, y: -2.5 },  // 0 punta
      { x: -1.5, y: 1.5 }, // 1 base_sx
      { x: 1.5, y: 1.5 },  // 2 base_dx
      { x: 0, y: 0 },      // 3 albero
    ],
    edges: [[0, 3], [3, 1], [3, 2], [1, 2]],
  },
  {
    key: 'agema', name: 'AGEMA', color: '#0abfbc', orbit: 'outer', initialAngleDeg: 60,
    points: [
      { x: 0, y: -2 },   // 0 top
      { x: 1.5, y: 0 },  // 1 right
      { x: 0, y: 2 },    // 2 bottom
      { x: -1.5, y: 0 }, // 3 left
      { x: 0, y: 0 },    // 4 center
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
  },
  {
    key: 'dna', name: 'DNA COIN', color: '#c9a84c', orbit: 'outer', initialAngleDeg: 180,
    points: [
      { x: -1, y: -3 },   // 0 A1
      { x: -1.2, y: -1 }, // 1 A2
      { x: -1, y: 1 },    // 2 A3
      { x: -0.8, y: 3 },  // 3 A4
      { x: 1, y: -2 },    // 4 B1
      { x: 1.2, y: 0 },   // 5 B2
      { x: 1, y: 2 },     // 6 B3
      { x: 0.8, y: 3 },   // 7 B4
    ],
    edges: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [1, 4], [2, 5], [3, 6]],
  },
  {
    key: 'costellazioni', name: 'TIFIDE', color: '#0abfbc', orbit: 'outer', initialAngleDeg: 300,
    points: [
      { x: 0, y: 2.5 },    // 0 punta (verso il basso)
      { x: -1, y: 0.5 },   // 1 sx_1
      { x: 1, y: 0.5 },    // 2 dx_1
      { x: -1.8, y: -1.5 }, // 3 sx_2
      { x: 1.8, y: -1.5 },  // 4 dx_2
    ],
    edges: [[0, 1], [0, 2], [1, 3], [2, 4]],
  },
];

const ORBIT_SPEED_DEG_S = { inner: 4.5, outer: 2.8 };
const MIN_HIT_SIZE = 44; // px — target minimo accessibilità touch
const STAGGER_MS = 80;
const REVEAL_MS = 300;

type Bbox = { x0: number; y0: number; x1: number; y1: number };

export default function StarHome({ isFirstVisit, onModuleSelect }: StarHomeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const frameRef = useRef<number>(0);
  const mountTimeRef = useRef<number>(0);
  const anglesRef = useRef<number[]>(CONSTELLATIONS.map(c => c.initialAngleDeg));
  const bboxesRef = useRef<Bbox[]>([]);
  const dimsRef = useRef({ w: 0, h: 0 });
  const stoppedRef = useRef(false);
  const glowUntilRef = useRef(0);
  const glowKeyRef = useRef<StarHomeModule | null>(null);
  const clickedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    mountTimeRef.current = performance.now();

    const resize = () => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      dimsRef.current = { w: canvas.width, h: canvas.height };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let lastT = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(now - lastT, 50); // clamp per evitare salti dopo un tab in background
      lastT = now;
      const { w: W, h: H } = dimsRef.current;
      const mobile = W < 640;
      const cx = W / 2;
      const cy = H * 0.42; // Cassandra leggermente sopra il centro verticale
      const radiusInner = mobile ? 120 : 180;
      const radiusOuter = mobile ? 220 : 320;
      const scale = mobile ? 9 : 13;
      const cassandraScale = scale * 1.35;

      if (!stoppedRef.current) {
        anglesRef.current = anglesRef.current.map((a, i) => {
          const c = CONSTELLATIONS[i];
          if (!c.orbit) return a;
          const speed = ORBIT_SPEED_DEG_S[c.orbit];
          // antiorario su canvas y-down: decrementare l'angolo
          return a - speed * (dt / 1000);
        });
      }

      ctx.clearRect(0, 0, W, H);

      // pulsazione Cassandra: 1.0 -> 1.08 -> 1.0, 3s
      const pulse = 1 + 0.04 * (1 + Math.sin(((now / 1000) * (2 * Math.PI / 3)) - Math.PI / 2));

      const centers: { x: number; y: number }[] = CONSTELLATIONS.map((c, i) => {
        if (!c.orbit) return { x: cx, y: cy };
        const R = c.orbit === 'inner' ? radiusInner : radiusOuter;
        const rad = (anglesRef.current[i] * Math.PI) / 180;
        return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
      });

      // linee radiali Cassandra -> ogni costellazione in orbita (raggi della ruota)
      ctx.strokeStyle = 'rgba(201,168,76,0.1)';
      ctx.lineWidth = 1;
      centers.forEach((p, i) => {
        if (!CONSTELLATIONS[i].orbit) return;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });

      const newBboxes: Bbox[] = [];

      CONSTELLATIONS.forEach((c, i) => {
        const center = centers[i];
        const sizeMultiplier = c.orbit ? 1 : pulse;
        const s = (c.orbit ? scale : cassandraScale) * sizeMultiplier;
        const screenPts = c.points.map(p => ({ x: center.x + p.x * s, y: center.y + p.y * s }));

        let alpha = 1;
        if (isFirstVisit) {
          const elapsed = now - mountTimeRef.current - i * STAGGER_MS;
          alpha = Math.max(0, Math.min(1, elapsed / REVEAL_MS));
        }
        ctx.globalAlpha = alpha;

        // edges
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.35;
        c.edges.forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(screenPts[a].x, screenPts[a].y);
          ctx.lineTo(screenPts[b].x, screenPts[b].y);
          ctx.stroke();
        });

        // glow extra se questa costellazione è stata appena cliccata
        const isGlowing = glowKeyRef.current === c.key && now < glowUntilRef.current;

        screenPts.forEach((p, pi) => {
          ctx.globalAlpha = alpha;
          const isHub = c.orbit === null && pi === 0;
          const r = (isHub ? 3.2 : 2) * (c.orbit ? 1 : pulse) + (isGlowing ? 1.5 : 0);

          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * (isGlowing ? 5 : 3.2));
          grd.addColorStop(0, c.color + (isGlowing ? 'aa' : '55'));
          grd.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * (isGlowing ? 5 : 3.2), 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = c.color;
          ctx.fill();
        });

        ctx.globalAlpha = 1;

        // bounding box con padding minimo 44px per hit-test/touch
        const xs = screenPts.map(p => p.x);
        const ys = screenPts.map(p => p.y);
        let x0 = Math.min(...xs), x1 = Math.max(...xs);
        let y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (x1 - x0 < MIN_HIT_SIZE) { const m = (MIN_HIT_SIZE - (x1 - x0)) / 2; x0 -= m; x1 += m; }
        if (y1 - y0 < MIN_HIT_SIZE) { const m = (MIN_HIT_SIZE - (y1 - y0)) / 2; y0 -= m; y1 += m; }
        newBboxes[i] = { x0, y0, x1, y1 };

        // label DOM — mutazione diretta, niente setState
        const label = labelRefs.current[i];
        if (label) {
          const labelY = c.orbit === null ? center.y + 26 * pulse : y1 + 14;
          label.style.left = `${center.x}px`;
          label.style.top = `${labelY}px`;
          label.style.opacity = String(alpha);
        }
      });

      bboxesRef.current = newBboxes;

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (clickedRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitIdx = bboxesRef.current.findIndex(b => b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
    if (hitIdx === -1) return;

    const module = CONSTELLATIONS[hitIdx].key;
    clickedRef.current = true;
    stoppedRef.current = true;
    glowKeyRef.current = module;
    glowUntilRef.current = performance.now() + 300;

    setTimeout(() => {
      const container = containerRef.current;
      if (container) container.style.opacity = '0';
    }, 300);

    setTimeout(() => {
      if (isFirstVisit) {
        try { sessionStorage.setItem('cassandra_starhome_seen', '1'); } catch { /* ignore */ }
      }
      onModuleSelect(module);
    }, 700);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '70vh',
        overflow: 'hidden',
        opacity: 1,
        transition: 'opacity 400ms ease',
      }}
    >
      <StarfieldBackground />

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
      />

      {CONSTELLATIONS.map((c, i) => (
        <div
          key={c.key}
          ref={el => { labelRefs.current[i] = el; }}
          style={{
            position: 'absolute',
            transform: 'translate(-50%, 0)',
            pointerEvents: 'none',
            fontFamily: 'var(--font-display, Cinzel, serif)',
            fontSize: c.key === 'cassandra' ? '13px' : '10px',
            fontWeight: 400,
            letterSpacing: '0.2em',
            color: 'var(--color-text-dim)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {c.name}
        </div>
      ))}

      {/* Saluto di Pizia — testo passivo, non blocca l'interazione */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '6%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: '13px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: 'var(--color-text-dim)',
            textAlign: 'center',
            maxWidth: '320px',
          }}
        >
          Le stelle sono allineate. Scegli da dove guardare.
        </p>
      </div>
    </div>
  );
}

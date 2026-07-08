'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import StarfieldBackground from './StarfieldBackground';

export type StarHomeModule = 'cassandra' | 'orione' | 'argonauta' | 'agema' | 'dna' | 'costellazioni';

interface StarHomeProps {
  isFirstVisit: boolean;
  onModuleSelect: (module: StarHomeModule) => void;
}

type StarHomeState = 'narrative' | 'transitioning' | 'navigation';

type StarDef = {
  key: StarHomeModule;
  name: string;
  theta: number;
  phi: number;
  size: number;
  color: string;
};

// Stessi theta/phi di HeroPlanetarium per i 6 nodi condivisi (senza "Le Tre Moire",
// non presente tra i moduli della Home Stellare)
const STARS: StarDef[] = [
  { key: 'cassandra',     name: 'CASSANDRA',  theta: 0,   phi: 0.18, size: 7, color: '#c9a84c' },
  { key: 'orione',        name: 'ORIONE',     theta: 0.8, phi: 0.55, size: 4.5, color: '#0abfbc' },
  { key: 'argonauta',     name: 'ARGONAUTA',  theta: 2.1, phi: 0.45, size: 4.5, color: '#0abfbc' },
  { key: 'agema',         name: 'AGEMA',      theta: 3.4, phi: 0.52, size: 4.5, color: '#0abfbc' },
  { key: 'dna',           name: 'DNA COIN',   theta: 5.4, phi: 0.60, size: 4,   color: '#9a7a3a' },
  { key: 'costellazioni', name: 'TIFIDE',     theta: 1.5, phi: 0.70, size: 4,   color: '#9a7a3a' },
];

// indici in STARS — Cassandra hub verso tutte + relazione narrativa Orione-Argonauta
const EDGES: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2]];

function azimuthalProject(theta: number, phi: number, t: number, pmx: number, pmy: number) {
  const thetaR = theta + t;
  const x = Math.sin(phi) * Math.cos(thetaR) + pmx * 0.04;
  const y = Math.sin(phi) * Math.sin(thetaR) + pmy * 0.04;
  const z = Math.cos(phi);
  const r = Math.sqrt(x * x + y * y);
  const angle = Math.atan2(y, x);
  const rProj = r > 0 ? Math.atan2(r, z) / (Math.PI / 2) : 0;
  return { px: rProj * Math.cos(angle), py: rProj * Math.sin(angle) };
}

const GREETING = 'Le stelle sono allineate. Scegli da dove guardare.';

export default function StarHome({ isFirstVisit, onModuleSelect }: StarHomeProps) {
  const [state, setState] = useState<StarHomeState>(isFirstVisit ? 'narrative' : 'navigation');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const starRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);
  const frameRef = useRef<number>(0);
  const tRef = useRef(0);
  const pmxRef = useRef(0);
  const pmyRef = useRef(0);
  const dimsRef = useRef({ w: 0, h: 0 });

  // loop di posizionamento — le stelle si muovono sempre, in tutti gli stati
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      pmxRef.current = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pmyRef.current = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    const resize = () => {
      dimsRef.current = { w: container.offsetWidth, h: container.offsetHeight };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = () => {
      tRef.current += 0.0015;
      const t = tRef.current;
      const pmx = pmxRef.current;
      const pmy = pmyRef.current;
      const { w: W, h: H } = dimsRef.current;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.34;

      const positions = STARS.map(s => {
        const { px, py } = azimuthalProject(s.theta, s.phi, t, pmx, pmy);
        return { x: cx + px * R, y: cy + py * R };
      });

      positions.forEach((p, i) => {
        const el = starRefs.current[i];
        if (el) {
          el.style.left = `${p.x}px`;
          el.style.top = `${p.y}px`;
        }
      });

      EDGES.forEach(([a, b], i) => {
        const line = lineRefs.current[i];
        if (line) {
          line.setAttribute('x1', String(positions[a].x));
          line.setAttribute('y1', String(positions[a].y));
          line.setAttribute('x2', String(positions[b].x));
          line.setAttribute('y2', String(positions[b].y));
        }
      });

      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      ro.disconnect();
    };
  }, []);

  const handleEnter = useCallback(() => {
    setState('transitioning');
    // step 1 (0-300ms): fade out testi — gestito via className su state 'transitioning'
    // step 2 (300-900ms): zoom leggero — idem
    // step 3 (900-1300ms): materializzazione icone (stagger via tagReveal)
    const timer = setTimeout(() => {
      setState('navigation');
      try { sessionStorage.setItem('cassandra_starhome_seen', '1'); } catch { /* ignore */ }
    }, 1300);
    return () => clearTimeout(timer);
  }, []);

  const isNarrative = state === 'narrative';
  const isTransitioning = state === 'transitioning';
  const isNavigation = state === 'navigation';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '70vh',
        overflow: 'hidden',
        transform: isTransitioning ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 600ms ease-in-out',
      }}
    >
      <StarfieldBackground />

      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {EDGES.map((_, i) => (
          <line
            key={i}
            ref={el => { lineRefs.current[i] = el; }}
            stroke="var(--color-gold, #c9a84c)"
            strokeOpacity={0.25}
            strokeWidth={1}
          />
        ))}
      </svg>

      {STARS.map((s, i) => {
        const hovered = hoverIdx === i;
        return (
          <div
            key={s.key}
            ref={el => { starRefs.current[i] = el; }}
            onMouseEnter={() => isNavigation && setHoverIdx(i)}
            onMouseLeave={() => isNavigation && setHoverIdx(null)}
            onClick={() => isNavigation && onModuleSelect(s.key)}
            className={isNavigation ? 'starhome-icon-reveal' : undefined}
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              cursor: isNavigation ? 'pointer' : 'default',
              animationDelay: isNavigation ? `${i * 80}ms` : undefined,
              opacity: isNarrative || isNavigation ? 1 : 0,
              transition: 'opacity 300ms ease',
            }}
          >
            <div
              style={{
                width: `${s.size * (hovered ? 3.6 : 3)}px`,
                height: `${s.size * (hovered ? 3.6 : 3)}px`,
                borderRadius: '50%',
                background: s.color,
                boxShadow: `0 0 ${hovered ? 18 : 10}px ${s.color}`,
                transition: 'width 200ms ease, height 200ms ease, box-shadow 200ms ease',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-display, Cinzel, serif)',
                fontSize: s.key === 'cassandra' ? '13px' : '10px',
                letterSpacing: '0.2em',
                color: hovered ? 'var(--color-gold, #c9a84c)' : 'var(--color-text-dim)',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                transition: 'color 200ms ease',
              }}
            >
              {s.name}
            </span>
          </div>
        );
      })}

      {/* Saluto + ENTRA — solo stato narrativo, sparisce in transizione */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '14%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          opacity: isNarrative ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: isNarrative ? 'auto' : 'none',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: '14px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: 'var(--color-text-dim)',
            textAlign: 'center',
            maxWidth: '320px',
          }}
        >
          {GREETING}
        </p>
        <button
          onClick={handleEnter}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-gold-dim, rgba(201,168,76,0.4))',
            color: 'var(--color-gold, #c9a84c)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            padding: '10px 28px',
            cursor: 'pointer',
          }}
        >
          Entra
        </button>
      </div>
    </div>
  );
}

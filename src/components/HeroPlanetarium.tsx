'use client';

import { useEffect, useRef } from 'react';

const NODES = [
  { name: 'CASSANDRA', theta: 0,   phi: 0.18, size: 5,   color: '#c9a84c' },
  { name: 'ORIONE',    theta: 0.8, phi: 0.55, size: 3.5, color: '#0abfbc' },
  { name: 'ARGONAUTA', theta: 2.1, phi: 0.45, size: 3.5, color: '#0abfbc' },
  { name: 'AGEMA',     theta: 3.4, phi: 0.52, size: 3.5, color: '#0abfbc' },
  { name: 'CLOTO',     theta: 4.5, phi: 0.38, size: 3,   color: '#9a7a3a' },
  { name: 'LACHESI',   theta: 5.4, phi: 0.60, size: 3,   color: '#9a7a3a' },
  { name: 'ATROPO',    theta: 1.5, phi: 0.70, size: 3,   color: '#9a7a3a' },
];

const STAR_COUNT = 420;

type Star = {
  x: number; y: number; z: number;
  size: number; brightness: number;
  twinkleSpeed: number; twinklePhase: number;
};

type ShootingStar = {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
};

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

export default function HeroPlanetarium() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const tRef      = useRef(0);
  const pmxRef    = useRef(0);
  const pmyRef    = useRef(0);
  const starsRef  = useRef<Star[]>([]);
  const shootRef  = useRef<ShootingStar[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Generate stars
    starsRef.current = Array.from({ length: STAR_COUNT }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(1 - Math.random() * 1.6);
      const r     = Math.sin(phi);
      return {
        x: r * Math.cos(theta),
        y: r * Math.sin(theta),
        z: Math.cos(phi),
        size:          0.3 + Math.random() * 1.4,
        brightness:    0.3 + Math.random() * 0.7,
        twinkleSpeed:  0.01 + Math.random() * 0.03,
        twinklePhase:  Math.random() * Math.PI * 2,
      };
    });

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pmxRef.current = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
      pmyRef.current = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      tRef.current += 0.003;
      const t   = tRef.current;
      const pmx = pmxRef.current;
      const pmy = pmyRef.current;
      const W   = canvas.width;
      const H   = canvas.height;
      const cx  = W / 2;
      const cy  = H / 2;
      const R   = Math.min(W, H) * 0.48;

      ctx.clearRect(0, 0, W, H);

      // Draw stars
      starsRef.current.forEach(s => {
        const thetaS = Math.atan2(s.y, s.x) + t + pmx * 0.04;
        const phi    = Math.acos(Math.max(-1, Math.min(1, s.z)));
        const r      = Math.sin(phi);
        const rProj  = Math.atan2(r, s.z) / (Math.PI / 2);
        const px     = cx + rProj * Math.cos(thetaS) * R + pmy * 0.04 * R;
        const py     = cy + rProj * Math.sin(thetaS) * R;

        s.twinklePhase += s.twinkleSpeed;
        const tw = s.brightness * (0.6 + 0.4 * Math.sin(s.twinklePhase));
        const a  = Math.max(0, Math.min(1, tw));

        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,200,240,${a})`;
        ctx.fill();
      });

      // Draw constellation edges
      const projected = NODES.map(n => {
        const { px, py } = azimuthalProject(n.theta, n.phi, t, pmx, pmy);
        return { ...n, spx: cx + px * R, spy: cy + py * R };
      });

      ctx.strokeStyle = 'rgba(201,168,76,0.12)';
      ctx.lineWidth   = 0.5;
      const edges = [[0,1],[0,2],[0,3],[1,4],[2,5],[3,6]];
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(projected[a].spx, projected[a].spy);
        ctx.lineTo(projected[b].spx, projected[b].spy);
        ctx.stroke();
      });

      // Draw nodes
      projected.forEach(n => {
        // Glow
        const grd = ctx.createRadialGradient(n.spx, n.spy, 0, n.spx, n.spy, n.size * 6);
        grd.addColorStop(0, n.color + '55');
        grd.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(n.spx, n.spy, n.size * 6, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(n.spx, n.spy, n.size, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        // Label
        if (n.name !== 'CASSANDRA') {
          ctx.fillStyle   = n.color + 'aa';
          ctx.font        = `300 9px 'JetBrains Mono', monospace`;
          ctx.letterSpacing = '0.2em';
          ctx.fillText(n.name, n.spx + n.size + 5, n.spy + 3);
        }
      });

      // Shooting stars
      if (Math.random() < 0.004) {
        const sx = Math.random() * W;
        const sy = Math.random() * H * 0.6;
        const angle = Math.PI * 0.2 + Math.random() * 0.3;
        shootRef.current.push({
          x: sx, y: sy,
          vx: Math.cos(angle) * 6,
          vy: Math.sin(angle) * 6,
          life: 0, maxLife: 30 + Math.random() * 20,
        });
      }
      shootRef.current = shootRef.current.filter(s => {
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        const prog  = s.life / s.maxLife;
        const alpha = prog < 0.3 ? prog / 0.3 : 1 - (prog - 0.3) / 0.7;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 8, s.y - s.vy * 8);
        ctx.strokeStyle = `rgba(201,168,76,${alpha * 0.8})`;
        ctx.lineWidth   = 1;
        ctx.stroke();
        return s.life < s.maxLife;
      });

      // Horizon glow
      const hg = ctx.createLinearGradient(0, H * 0.75, 0, H);
      hg.addColorStop(0, 'transparent');
      hg.addColorStop(1, 'rgba(10,191,188,0.06)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, H * 0.75, W, H * 0.25);

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}

'use client';

import { useEffect, useRef } from 'react';

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

/** Sfondo stellato animato — estratto da HeroPlanetarium (solo stelle di sfondo,
 * senza i nodi/costellazione, disegnati separatamente da StarHome come elementi DOM). */
export default function StarfieldBackground() {
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

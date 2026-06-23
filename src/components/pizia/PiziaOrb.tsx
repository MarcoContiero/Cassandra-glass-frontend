'use client';

import { useEffect, useRef } from 'react';

export type OrbState = 'ambient' | 'active' | 'thinking';

interface Props {
  size: number;
  state: OrbState;
}

const GOLD    = '#c9a84c';
const GOLD_DIM = 'rgba(201,168,76,0.4)';
const CYAN    = '#0abfbc';
const CYAN_DIM = 'rgba(10,191,188,0.35)';

const SATELLITES = [
  { angle: 0,          r: 0.30, color: GOLD,     size: 1.8,  speed: 0.008 },
  { angle: Math.PI / 3, r: 0.28, color: CYAN,     size: 1.4,  speed: -0.006 },
  { angle: 2*Math.PI/3, r: 0.32, color: GOLD,     size: 1.6,  speed: 0.007 },
  { angle: Math.PI,    r: 0.27, color: CYAN,     size: 1.3,  speed: -0.009 },
  { angle: 4*Math.PI/3, r: 0.31, color: GOLD_DIM, size: 1.5,  speed: 0.005 },
  { angle: 5*Math.PI/3, r: 0.29, color: CYAN_DIM, size: 1.2,  speed: -0.007 },
];

export default function PiziaOrb({ size, state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const tRef      = useRef<number>(0);
  const anglesRef = useRef<number[]>(SATELLITES.map(s => s.angle));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;

    // Speed multiplier per stato
    const speedMul = state === 'ambient' ? 0.4 : state === 'thinking' ? 2.2 : 1.0;
    // Pulse intensity
    const pulseAmp = state === 'ambient' ? 0.08 : state === 'thinking' ? 0.18 : 0.12;
    const pulseFreq = state === 'ambient' ? 0.025 : state === 'thinking' ? 0.09 : 0.045;

    function draw() {
      ctx.clearRect(0, 0, size, size);
      const t = tRef.current;

      // ── Halo ring ───────────────────────────────────────────────────
      const haloR = size * 0.46 + Math.sin(t * pulseFreq) * size * pulseAmp * 0.5;
      const haloAlpha = state === 'ambient' ? 0.18 : state === 'thinking' ? 0.5 : 0.32;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(201,168,76,${haloAlpha})`;
      ctx.lineWidth = state === 'active' ? 0.8 : 0.5;
      ctx.stroke();

      // Second halo (cyan, counter-rotating)
      const haloR2 = size * 0.42 + Math.cos(t * pulseFreq * 1.3) * size * pulseAmp * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(10,191,188,${haloAlpha * 0.6})`;
      ctx.lineWidth = 0.4;
      ctx.stroke();

      // ── Satellites ─────────────────────────────────────────────────
      const orbitR = size * 0.33 + Math.sin(t * pulseFreq * 0.7) * size * 0.02;
      const angles = anglesRef.current;
      SATELLITES.forEach((sat, i) => {
        angles[i] += sat.speed * speedMul;
        const ax = cx + Math.cos(angles[i]) * orbitR * sat.r / 0.30;
        const ay = cy + Math.sin(angles[i]) * orbitR * sat.r / 0.30;
        const tw = Math.sin(t * 0.07 + i * 1.1) * 0.4 + 0.8;
        ctx.beginPath();
        ctx.arc(ax, ay, sat.size * tw, 0, Math.PI * 2);
        ctx.fillStyle = sat.color;
        ctx.fill();
      });

      // ── Nucleus ────────────────────────────────────────────────────
      const nucleusR = size * (0.16 + Math.sin(t * pulseFreq) * pulseAmp * 0.5);
      // Outer glow
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucleusR * 2.2);
      grd.addColorStop(0, `rgba(201,168,76,${state === 'ambient' ? 0.25 : 0.45})`);
      grd.addColorStop(1, 'rgba(201,168,76,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, nucleusR * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      // Core
      ctx.beginPath();
      ctx.arc(cx, cy, nucleusR, 0, Math.PI * 2);
      ctx.fillStyle = state === 'thinking'
        ? `rgba(232,201,106,${0.7 + Math.sin(t * 0.12) * 0.3})`
        : GOLD;
      ctx.fill();
      // Center point
      ctx.beginPath();
      ctx.arc(cx, cy, nucleusR * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();

      tRef.current += 1;
      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [size, state]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}

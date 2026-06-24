'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import dynamic from 'next/dynamic';
import { RevealOnScroll } from '@/components/RevealOnScroll';
import { ThemeToggle } from '@/components/ThemeToggle';

const HeroPlanetarium = dynamic(() => import('@/components/HeroPlanetarium'), { ssr: false });

// ── Data ─────────────────────────────────────────────────────────────────────

const MODULES = [
  {
    index: 'I', name: 'Orione', role: 'Scanner · Pattern Recognition',
    desc: 'Il cacciatore. Scandaglia il mercato in tempo reale su tutti i timeframe, identificando pattern candlestick, incroci EMA e confluenze strutturali prima che il segnale sia confermato.',
  },
  {
    index: 'II', name: 'Argonauta', role: 'Setup AI · Risk/Reward',
    desc: "Gli eroi che cercano il vello d'oro. Setup operativi generati dall'AI con entry precisa, TP multipli, SL ottimizzato e R/R calcolato in tempo reale.",
  },
  {
    index: 'III', name: 'Agema', role: 'Ciclica · Fase di Mercato',
    desc: 'Il reparto scelto. Fase ciclica di ogni coin — espansione, distribuzione, accumulazione. Solo i setup allineati alla fase vengono promossi.',
  },
  {
    index: 'IV', name: 'Cloto', role: 'DNA Coin · Storia',
    desc: 'Fila il filo. Win rate per sessione, profit factor storico, correlazione BTC/ETH, distribuzione oraria dei trade. La memoria della coin.',
  },
  {
    index: 'V', name: 'Lachesi', role: 'DNA Coin · Presente',
    desc: 'Misura il filo. Sessione attuale, regime di volatilità, fase del ciclo corrente, bias direzionale multi-timeframe in tempo reale.',
  },
  {
    index: 'VI', name: 'Atropo', role: 'DNA Coin · Proiezione',
    desc: 'Taglia il filo. Proiezione probabilistica basata su Cloto e Lachesi: la stima del prossimo movimento secondo la storia della coin.',
  },
];

const STATS = [
  { value: '1,220+', label: 'Trade Analizzati' },
  { value: '60.5%',  label: 'Win Rate' },
  { value: '1.119',  label: 'Profit Factor' },
  { value: '3.04%',  label: 'Avg PnL / Trade' },
];

const TIERS = [
  {
    name: 'Orione', sub: 'Segnali & Pattern', price: 39, featured: false,
    features: [
      { on: true,  text: 'Scanner pattern real-time su qualsiasi coin' },
      { on: true,  text: 'Bias MTF su tutti i timeframe' },
      { on: true,  text: 'Alert contestualizzati con score' },
      { on: true,  text: 'Supporti e resistenze dinamici' },
      { on: false, text: 'Setup Argonauta con R/R' },
      { on: false, text: 'DNA Coin (Le Tre Moire)' },
      { on: false, text: 'Radar ciclico Agema' },
    ],
    cta: 'Prova gratis 14 giorni',
  },
  {
    name: 'Argonauta', sub: 'Suite Completa', price: 89, featured: true,
    features: [
      { on: true, text: 'Tutto di Orione incluso' },
      { on: true, text: 'Setup AI con entry/TP/SL/R:R' },
      { on: true, text: 'Pool di liquidità con magnete' },
      { on: true, text: 'DNA Coin completo (Cloto · Lachesi · Atropo)' },
      { on: true, text: 'Performance per sessione USA/EU/ASIA' },
      { on: false, text: 'Radar ciclico Agema' },
    ],
    cta: 'Prova gratis 14 giorni',
  },
  {
    name: 'Agema', sub: 'Elite · Ciclica', price: 129, featured: false,
    features: [
      { on: true, text: 'Tutto di Argonauta incluso' },
      { on: true, text: 'Radar ciclico su tutte le coins' },
      { on: true, text: 'Fase espansiva/distributiva real-time' },
      { on: true, text: 'Segnali qualificati da fase ciclica' },
      { on: true, text: 'Accesso anticipato nuove features' },
      { on: true, text: 'Supporto prioritario' },
    ],
    cta: 'Prova gratis 14 giorni',
  },
];

const TF_MOCK = [
  { tf: '15m', bias: 'LONG',  color: '#3da866' },
  { tf: '1h',  bias: 'LONG',  color: '#3da866' },
  { tf: '4h',  bias: 'SHORT', color: '#a83d3d' },
  { tf: '12h', bias: 'SHORT', color: '#a83d3d' },
  { tf: '1d',  bias: 'SHORT', color: '#a83d3d' },
  { tf: '1w',  bias: 'NEUTRO', color: '#5a5a8a' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function useEntraHref() {
  const { isSignedIn } = useAuth();
  return isSignedIn ? '/app' : '/sign-in';
}

function HomeNav() {
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const entraHref = useEntraHref();

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderBottom: scrolled ? '1px solid var(--color-gold-dim)' : '1px solid transparent',
        backdropFilter: scrolled ? 'none' : 'none',
        background: scrolled ? 'var(--color-gold)' : 'transparent',
        transition: 'all 300ms ease',
        padding: '0 32px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span style={{ fontFamily: 'var(--font-decorative)', fontSize: '14px', fontWeight: 300, color: 'var(--color-gold)', letterSpacing: '0.2em' }}>
        CASSANDRA
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        {['Sistema', 'Stats', 'Analisi', 'Prezzi'].map(label => (
          <a
            key={label}
            href={`#${label.toLowerCase()}`}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: scrolled ? 'rgba(2,2,14,0.55)' : 'var(--color-text-dim)', textDecoration: 'none', transition: 'color 200ms ease' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = scrolled ? 'var(--color-void)' : 'var(--color-gold)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = scrolled ? 'rgba(2,2,14,0.55)' : 'var(--color-text-dim)'; }}
          >
            {label}
          </a>
        ))}

        <ThemeToggle />

        <button
          onClick={() => router.push(entraHref)}
          className="btn-cassandra"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'var(--color-gold)', color: 'var(--color-void)', border: 'none', padding: '10px 24px', cursor: 'pointer', transition: 'background 200ms ease' }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'var(--color-gold-bright)'; }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'var(--color-gold)'; }}
        >
          Entra
        </button>
      </div>
    </nav>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const entraHref = useEntraHref();

  return (
    <div style={{ color: 'var(--color-text)', minHeight: '100vh', overflowX: 'hidden', position: 'relative' }}>
      <HomeNav />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', height: '100vh', minHeight: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <HeroPlanetarium />

        {/* Vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 30%, rgba(2,2,14,0.7) 100%)', pointerEvents: 'none', zIndex: 1 }} />

        {/* Text overlay */}
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <span
            style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.6em', textTransform: 'uppercase', color: 'var(--color-cyan)', animation: 'fadeUp 1.2s ease 0.5s both' }}
          >
            Sistema di analisi algoritmica crypto
          </span>

          <h1
            style={{
              fontFamily: 'var(--font-decorative)',
              fontSize: 'clamp(52px, 9vw, 110px)',
              fontWeight: 300,
              color: 'var(--color-gold)',
              letterSpacing: '0.2em',
              lineHeight: 1,
              textShadow: '0 0 80px rgba(201,168,76,0.3)',
              animation: 'fadeUp 1.2s ease 0.7s both',
              margin: 0,
            }}
          >
            CASSANDRA
          </h1>

          <div style={{ width: '1px', height: '48px', background: 'linear-gradient(to bottom, var(--color-gold), transparent)', animation: 'fadeUp 1.2s ease 0.9s both' }} />

          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(14px, 2vw, 20px)',
              fontWeight: 300,
              color: 'var(--color-text)',
              letterSpacing: '0.5em',
              textTransform: 'uppercase',
              maxWidth: '600px',
              lineHeight: 1.9,
              animation: 'fadeUp 1.2s ease 1.0s both',
              margin: 0,
            }}
          >
            <em style={{ color: 'var(--color-gold)', fontStyle: 'normal' }}>Vede ciò che gli altri non vedono.</em>
            <br />
            Pattern, cicli, liquidità — unificati.
          </p>

          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', animation: 'fadeUp 1.2s ease 1.2s both' }}>
            <button
              onClick={() => router.push(entraHref)}
              className="btn-cassandra"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', background: 'var(--color-gold)', color: 'var(--color-void)', border: 'none', padding: '18px 40px', cursor: 'pointer', transition: 'background 200ms ease' }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'var(--color-gold-bright)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'var(--color-gold)'; }}
            >
              Accedi al Sistema
            </button>
            <a
              href="#sistema"
              className="btn-cassandra"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', background: 'transparent', color: 'var(--color-text-dim)', border: '1px solid var(--color-text-faint)', padding: '18px 40px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', transition: 'all 200ms ease' }}
              onMouseEnter={e => { const el = e.target as HTMLElement; el.style.color = 'var(--color-gold)'; el.style.borderColor = 'var(--color-gold-dim)'; }}
              onMouseLeave={e => { const el = e.target as HTMLElement; el.style.color = 'var(--color-text-dim)'; el.style.borderColor = 'var(--color-text-faint)'; }}
            >
              Esplora
            </a>
          </div>
        </div>
      </section>

      {/* ── SISTEMA ───────────────────────────────────────────────────── */}
      <section id="sistema" style={{ background: 'linear-gradient(to bottom, var(--bg-section-main), var(--bg-section-accent), var(--bg-section-main))', borderTop: '1px solid var(--color-border-dim)', borderBottom: '1px solid var(--color-border-dim)', padding: '100px 32px' }}>
        <RevealOnScroll>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <span className="section-tag" style={{ display: 'inline-block', marginBottom: '16px' }}>Il Sistema</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 300, color: 'var(--color-gold)', letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0 }}>
              La Costellazione
            </h2>
          </div>
        </RevealOnScroll>

        <div style={{ maxWidth: '1200px', margin: '0 auto', border: '1px solid var(--color-border-dim)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {MODULES.map((mod, i) => (
            <RevealOnScroll key={mod.index} delay={i * 80}>
              <div
                style={{ padding: '44px', borderRight: (i % 3 !== 2) ? '1px solid var(--color-border-dim)' : 'none', borderBottom: i < 3 ? '1px solid var(--color-border-dim)' : 'none', position: 'relative', overflow: 'hidden', cursor: 'default', transition: 'background 200ms ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,10,30,0.9)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Large index in background */}
                <span style={{ position: 'absolute', top: '16px', right: '20px', fontFamily: 'var(--font-display)', fontSize: '72px', color: 'var(--color-text-faint)', opacity: 0.5, lineHeight: 1, userSelect: 'none' }}>
                  {mod.index}
                </span>

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 400, color: 'var(--color-gold)', letterSpacing: '0.2em', marginBottom: '6px', marginTop: 0 }}>
                    {mod.name}
                  </h3>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--color-cyan)', marginBottom: '20px', margin: '0 0 20px' }}>
                    {mod.role}
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.8, color: 'var(--color-text-dim)', margin: 0 }}>
                    {mod.desc}
                  </p>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────── */}
      <section id="stats" style={{ padding: '100px 32px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          {STATS.map((s, i) => (
            <RevealOnScroll key={s.label} delay={i * 100}>
              <div className="cassandra-card cassandra-card-corners" style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 300, color: 'var(--color-gold)', lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: '12px' }}>
                  {s.label}
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* ── ANALISI ───────────────────────────────────────────────────── */}
      <section id="analisi" style={{ background: 'var(--bg-section-accent)', borderTop: '1px solid var(--color-border-cyan)', borderBottom: '1px solid var(--color-border-cyan)', padding: '100px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }}>
          {/* Text */}
          <RevealOnScroll>
            <div>
              <span className="section-tag" style={{ marginBottom: '20px' }}>Analisi live</span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3.5vw, 36px)', fontWeight: 300, color: 'var(--color-gold)', letterSpacing: '0.2em', marginBottom: '24px', marginTop: 0 }}>
                Ogni segnale ha un contesto
              </h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.9, color: 'var(--color-text-dim)', margin: '0 0 16px' }}>
                Cassandra non si limita al pattern. Ogni segnale viene valutato su <em style={{ color: 'var(--color-text)', fontStyle: 'normal' }}>supporti e resistenze</em>, pool di liquidità, fase ciclica e bias multi-timeframe.
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.9, color: 'var(--color-text-dim)', margin: 0 }}>
                Il risultato: meno rumore, più <em style={{ color: 'var(--color-gold)', fontStyle: 'normal' }}>precisione operativa</em>.
              </p>
            </div>
          </RevealOnScroll>

          {/* Mock panel */}
          <RevealOnScroll delay={200}>
            <div className="cassandra-card cassandra-card-corners" style={{ padding: '28px' }}>
              <span className="cassandra-panel-header">CASSANDRA · ANALISI LIVE</span>
              <div style={{ marginTop: '12px' }}>
                {/* Coin + price */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--color-gold)' }}>BTC/USDT</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', color: 'var(--color-text)' }}>62,169.90</span>
                </div>
                {/* Direction */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span className="bias-short" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', padding: '3px 8px' }}>SHORT</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#a83d3d' }}>10.16</span>
                </div>
                {/* S/R */}
                <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { label: 'Supporto',   value: '62,141.40', color: '#3da866' },
                    { label: 'Resistenza', value: '63,080.10', color: '#a83d3d' },
                    { label: 'Pool LIQ',   value: '63,080 · M:74', color: '#c9a84c' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-text-faint)', paddingBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)' }}>{row.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                {/* TF grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                  {TF_MOCK.map(tf => (
                    <div key={tf.tf} style={{ textAlign: 'center', padding: '6px 4px', border: `1px solid ${tf.color}44`, background: `${tf.color}0d` }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--color-text-dim)', marginBottom: '2px' }}>{tf.tf}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: tf.color, letterSpacing: '0.1em' }}>{tf.bias}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="prezzi" style={{ padding: '100px 32px' }}>
        <RevealOnScroll>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <span className="section-tag" style={{ display: 'inline-block', marginBottom: '16px' }}>Accesso</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3.5vw, 36px)', fontWeight: 300, color: 'var(--color-gold)', letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0 }}>
              Scegli il tuo livello
            </h2>
          </div>
        </RevealOnScroll>

        {/* Banner prova gratuita */}
        <RevealOnScroll delay={100}>
          <div style={{ maxWidth: '1100px', margin: '0 auto 32px', border: '1px solid var(--color-border-cyan)', background: 'var(--color-cyan-faint)', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.4em', textTransform: 'uppercase', color: 'var(--color-cyan)', display: 'block', marginBottom: '6px' }}>
                Prova gratuita
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--color-text)', fontWeight: 300 }}>
                14 giorni su Argonauta completo — senza carta di credito
              </span>
            </div>
            <button
              onClick={() => router.push(entraHref)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'var(--color-cyan)', color: 'var(--color-void)', border: 'none', padding: '12px 28px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 200ms ease' }}
              onMouseEnter={e => { (e.currentTarget).style.background = 'var(--color-cyan-bright)'; }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'var(--color-cyan)'; }}
            >
              Inizia gratis
            </button>
          </div>
        </RevealOnScroll>

        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'start' }}>
          {TIERS.map((tier, i) => (
            <RevealOnScroll key={tier.name} delay={i * 120}>
              <div
                className="cassandra-card cassandra-card-corners"
                style={{ padding: '40px 32px', position: 'relative', background: tier.featured ? 'var(--color-surface)' : 'var(--color-deep)' }}
              >
                {/* Founding member badge — tutti i tier */}
                <div style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid var(--color-gold-dim)', background: 'var(--color-gold-faint)', padding: '3px 10px' }}>
                  <span style={{ color: 'var(--color-gold)', fontSize: '8px' }}>✦</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-gold-dim)' }}>
                    Founding member · prezzo bloccato per sempre · primi 100
                  </span>
                </div>

                {tier.featured && (
                  <div
                    className="btn-cassandra"
                    style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--color-gold)', color: 'var(--color-void)', fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', padding: '4px 16px', whiteSpace: 'nowrap' }}
                  >
                    Consigliato
                  </div>
                )}

                <div style={{ marginBottom: '8px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 400, color: 'var(--color-gold)', letterSpacing: '0.2em', margin: '0 0 4px' }}>{tier.name}</h3>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)', letterSpacing: '0.3em', textTransform: 'uppercase' }}>{tier.sub}</span>
                </div>

                <div style={{ margin: '28px 0', borderTop: '1px solid var(--color-border-dim)', borderBottom: '1px solid var(--color-border-dim)', padding: '20px 0' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 400, color: 'var(--color-text-dim)', letterSpacing: '0.2em' }}>TBA</span>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {tier.features.map(f => (
                    <li key={f.text} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: f.on ? 'var(--color-gold)' : 'var(--color-text-faint)', flexShrink: 0 }}>
                        {f.on ? '✦' : '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: f.on ? 'var(--color-text)' : 'var(--color-text-dim)' }}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => router.push(entraHref)}
                  className={tier.featured ? 'btn-cassandra' : undefined}
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    padding: '14px',
                    cursor: 'pointer',
                    border: tier.featured ? 'none' : '1px solid var(--color-border)',
                    background: tier.featured ? 'var(--color-gold)' : 'transparent',
                    color: tier.featured ? 'var(--color-void)' : 'var(--color-text-dim)',
                    transition: 'all 200ms ease',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    if (tier.featured) { el.style.background = 'var(--color-gold-bright)'; }
                    else { el.style.color = 'var(--color-gold)'; el.style.borderColor = 'var(--color-gold-dim)'; }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    if (tier.featured) { el.style.background = 'var(--color-gold)'; }
                    else { el.style.color = 'var(--color-text-dim)'; el.style.borderColor = 'var(--color-border)'; }
                  }}
                >
                  {tier.cta}
                </button>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--color-border-dim)', padding: '40px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-decorative)', fontSize: '12px', fontWeight: 300, color: 'var(--color-gold-dim)', letterSpacing: '0.2em' }}>
          CASSANDRA
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-faint)', letterSpacing: '0.1em', maxWidth: '600px', textAlign: 'right', lineHeight: 1.6 }}>
          © 2026 · Le analisi sono fornite a scopo informativo e non costituiscono consulenza finanziaria
        </span>
      </footer>
    </div>
  );
}

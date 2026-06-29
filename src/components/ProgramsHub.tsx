'use client';

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { ThemeToggle } from './ThemeToggle';
import CassandraUI from './CassandraUI';
import ArgonautaPanel from './ArgonautaPanel';
import OrionePanel from './orione/OrionePanel';
import AgemaPanel from './agema/AgemaPanel';
import DnaPanel from './dna/DnaPanel';
import TreMoirePanel from './moire/TreMoirePanel';
import Tifide3Panel from '@/app/tifide3/page';
import Orione2Page from '@/app/orione2/patterns/page';
import PiziaCompanion from './pizia/PiziaCompanion';
import AvvisiPanel from './avvisi/AvvisiPanel';
import CostellazioniPage from './tifide3/CostellazioniPage';
import SegnalaProblema from './SegnalaProblema';
import { posthog } from '@/lib/posthog';

type AppKey = 'argonauta' | 'cassandra' | 'orione' | 'agema' | 'dna' | 'moire' | 'orione2' | 'tifide3' | 'avvisi' | 'costellazioni';

const APPS: { key: AppKey; label: string }[] = [
  { key: 'cassandra',     label: 'Cassandra' },
  { key: 'argonauta',     label: 'Argonauta' },
  { key: 'orione',        label: 'Orione' },
  { key: 'costellazioni', label: 'Tifide' },
  { key: 'agema',         label: 'Agema' },
  { key: 'dna',           label: 'DNA Coin' },
  { key: 'moire',         label: 'Tre Moire' },
  { key: 'avvisi',        label: 'Avvisi' },
  { key: 'tifide3',       label: 'Tifi 4.0' },
  { key: 'orione2',       label: 'Pattern & EMA' },
];

const ALERT_POLL_MS = 60_000; // polling unread count ogni 60s

export default function ProgramsHub() {
  const [activeApp, setActiveApp] = useState<AppKey>('cassandra');
  const [cassandraContext, setCassandraContext] = useState<string>('');
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const { user, isLoaded } = useUser();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handlePiziaContext = useCallback((ctx: string) => {
    setCassandraContext(ctx);
  }, []);

  // Polling unread alert count
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;

    async function fetchUnread() {
      try {
        const res = await fetch('/api/alerts/unread-count', {
          headers: { 'X-User-Id': uid },
        });
        if (res.ok) {
          const data = await res.json();
          setUnreadAlerts(data.count ?? 0);
        }
      } catch { /* ignore */ }
    }

    fetchUnread();
    pollRef.current = setInterval(fetchUnread, ALERT_POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user?.id]);

  // Ottimistico: mentre Clerk carica teniamo il tab visibile per evitare il flash.
  // Solo dopo il caricamento completo filtriamo in base a tifide_access.
  const hasTifideAccess = !isLoaded || user?.publicMetadata?.tifide_access === true;
  const visibleApps = useMemo(
    () => APPS.filter(a => a.key !== 'tifide3' || hasTifideAccess),
    [hasTifideAccess],
  );

  const handleUnreadChange = useCallback((count: number) => {
    setUnreadAlerts(count);
  }, []);

  function handleTabChange(key: AppKey) {
    posthog.capture('tab_changed', { tab: key });
    setActiveApp(key);
    setCassandraContext('');
  }

  const isWide = activeApp === 'tifide3';

  const content = useMemo(() => {
    switch (activeApp) {
      case 'argonauta': return <ArgonautaPanel onPiziaContext={handlePiziaContext} />;
      case 'orione':    return <OrionePanel onPiziaContext={handlePiziaContext} />;
      case 'tifide3':   return <Tifide3Panel />;
      case 'agema':     return <AgemaPanel onPiziaContext={handlePiziaContext} />;
      case 'dna':       return <DnaPanel onPiziaContext={handlePiziaContext} />;
      case 'moire':     return <TreMoirePanel onPiziaContext={handlePiziaContext} />;
      case 'orione2':   return <Orione2Page />;
      case 'costellazioni': return <CostellazioniPage />;
      case 'avvisi':    return <AvvisiPanel onUnreadChange={handleUnreadChange} />;
      case 'cassandra':
      default:          return <CassandraUI onPiziaContext={handlePiziaContext} />;
    }
  }, [activeApp, handlePiziaContext, handleUnreadChange]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-section-main)', color: 'var(--color-text)' }}>

      {/* ── Navbar ────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          borderBottom: '1px solid var(--color-gold-dim)',
          background: 'var(--color-gold)',
        }}
      >
        <div
          style={{
            maxWidth: '1600px',
            margin: '0 auto',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingRight: '24px',
              marginRight: '8px',
              borderRight: '1px solid rgba(2,2,14,0.15)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-decorative)',
                fontSize: '13px',
                fontWeight: 300,
                letterSpacing: '0.2em',
                color: 'var(--color-void)',
                whiteSpace: 'nowrap',
              }}
            >
              CASSANDRA
            </span>
          </div>

          {/* Nav tabs */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              flex: 1,
            }}
          >
            {visibleApps.map((app) => {
              const isActive = activeApp === app.key;
              const showBadge = app.key === 'avvisi' && unreadAlerts > 0 && !isActive;
              return (
                <button
                  key={app.key}
                  onClick={() => handleTabChange(app.key)}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: isActive ? 400 : 300,
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    color: isActive ? 'var(--color-void)' : 'rgba(2,2,14,0.5)',
                    padding: '0 16px',
                    border: 'none',
                    borderBottom: isActive ? '2px solid var(--color-void)' : '2px solid transparent',
                    background: isActive ? 'rgba(2,2,14,0.1)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'color 200ms ease, background 200ms ease',
                    whiteSpace: 'nowrap',
                    alignSelf: 'stretch',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    position: 'relative',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget).style.color = 'var(--color-void)';
                      (e.currentTarget).style.background = 'rgba(2,2,14,0.06)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget).style.color = 'rgba(2,2,14,0.5)';
                      (e.currentTarget).style.background = 'transparent';
                    }
                  }}
                >
                  {app.label}
                  {showBadge && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '14px',
                      height: '14px',
                      borderRadius: '7px',
                      background: 'var(--color-void)',
                      color: 'var(--color-gold)',
                      fontSize: '8px',
                      fontWeight: 600,
                      letterSpacing: 0,
                      padding: '0 3px',
                      lineHeight: 1,
                    }}>
                      {unreadAlerts > 9 ? '9+' : unreadAlerts}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Theme toggle + segnala + live indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              paddingLeft: '16px',
              marginLeft: 'auto',
              borderLeft: '1px solid rgba(2,2,14,0.15)',
            }}
          >
            <SegnalaProblema />
            <ThemeToggle />
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--color-void)',
                opacity: 0.6,
                animation: 'cassandraPulse 2s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.3em',
                color: 'rgba(2,2,14,0.5)',
                textTransform: 'uppercase',
              }}
            >
              live
            </span>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <main
        style={
          isWide
            ? { position: 'relative', zIndex: 1, flex: 1, width: '100%', padding: '12px 8px' }
            : { position: 'relative', zIndex: 1, maxWidth: '1600px', margin: '0 auto', flex: 1, padding: '24px 20px', width: '100%' }
        }
      >
        {content}
      </main>

      <PiziaCompanion
        currentTab={activeApp}
        cassandraContext={cassandraContext}
        unreadAlerts={unreadAlerts}
        onAlertBadgeClick={() => handleTabChange('avvisi')}
      />
    </div>
  );
}

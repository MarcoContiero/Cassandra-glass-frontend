'use client';

import { useState } from 'react';
import AlertsPanel from './AlertsPanel';
import AlertFiltersConfig from './AlertFiltersConfig';

type Tab = 'eventi' | 'filtri';

type Props = {
  onUnreadChange?: (count: number) => void;
};

export default function AvvisiPanel({ onUnreadChange }: Props) {
  const [tab, setTab] = useState<Tab>('eventi');

  const tabStyle = (key: Tab): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: tab === key ? 'var(--color-void)' : 'rgba(2,2,14,0.5)',
    padding: '8px 20px',
    border: 'none',
    borderBottom: tab === key ? '2px solid var(--color-void)' : '2px solid transparent',
    background: tab === key ? 'rgba(2,2,14,0.08)' : 'transparent',
    cursor: 'pointer',
    transition: 'color 200ms ease',
  });

  return (
    <div style={{ color: 'var(--color-text)' }}>
      {/* Sub-tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--color-border)',
        marginBottom: '28px',
      }}>
        <button style={tabStyle('eventi')} onClick={() => setTab('eventi')}>
          I tuoi alert
        </button>
        <button style={tabStyle('filtri')} onClick={() => setTab('filtri')}>
          Configura filtri
        </button>
      </div>

      {tab === 'eventi' && <AlertsPanel onUnreadChange={onUnreadChange} />}
      {tab === 'filtri' && <AlertFiltersConfig />}
    </div>
  );
}

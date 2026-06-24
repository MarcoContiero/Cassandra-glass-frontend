'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('cassandra-theme') as 'dark' | 'light' | null;
    if (stored) {
      setTheme(stored);
      document.documentElement.dataset.theme = stored === 'light' ? 'light' : '';
    }
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next === 'light' ? 'light' : '';
    localStorage.setItem('cassandra-theme', next);
  }

  // Mostra il tema verso cui si switcha (call-to-action)
  const label = theme === 'dark' ? 'LIGHT' : 'DARK';

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      style={{
        background: 'transparent',
        border: '1px solid rgba(2,2,14,0.25)',
        color: 'rgba(2,2,14,0.55)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.08em',
        paddingInline: '10px',
        height: '32px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 200ms ease, border-color 200ms ease',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        (e.currentTarget).style.color = 'var(--color-void)';
        (e.currentTarget).style.borderColor = 'rgba(2,2,14,0.5)';
      }}
      onMouseLeave={e => {
        (e.currentTarget).style.color = 'rgba(2,2,14,0.55)';
        (e.currentTarget).style.borderColor = 'rgba(2,2,14,0.25)';
      }}
    >
      {label}
    </button>
  );
}

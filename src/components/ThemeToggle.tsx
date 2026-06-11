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

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      style={{
        background: 'transparent',
        border: '1px solid rgba(2,2,14,0.25)',
        color: 'rgba(2,2,14,0.55)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        width: '32px',
        height: '32px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 200ms ease, border-color 200ms ease',
        flexShrink: 0,
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
      {theme === 'dark' ? '◑' : '◐'}
    </button>
  );
}

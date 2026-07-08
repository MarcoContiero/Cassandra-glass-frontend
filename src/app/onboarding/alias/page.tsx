'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

export default function OnboardingAliasPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [alias, setAlias] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  const submit = async () => {
    const trimmed = alias.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/pizia/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: trimmed }),
      });
      if (!res.ok) {
        setError('Non sono riuscito a salvare — riprova.');
        return;
      }
      router.push('/app');
    } catch {
      setError('Non sono riuscito a salvare — riprova.');
    } finally {
      setSubmitting(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-void)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
        padding: '24px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-decorative, Cinzel Decorative, serif)',
          fontSize: '18px',
          fontWeight: 300,
          color: 'var(--color-gold, #c9a84c)',
          letterSpacing: '0.3em',
        }}
      >
        CASSANDRA
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', maxWidth: '360px', width: '100%', textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: '16px',
            fontWeight: 300,
            color: 'var(--color-text)',
            lineHeight: 1.6,
          }}
        >
          Come vuoi che Pizia ti chiami?
        </p>

        <input
          value={alias}
          onChange={e => setAlias(e.target.value)}
          onKeyDown={onKey}
          maxLength={40}
          autoFocus
          disabled={submitting}
          placeholder="Il tuo nome o soprannome…"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid rgba(201,168,76,0.25)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-display, serif)',
            fontSize: '14px',
            fontWeight: 300,
            textAlign: 'center',
            padding: '8px 0',
            letterSpacing: '0.02em',
            outline: 'none',
            opacity: submitting ? 0.5 : 1,
          }}
        />

        {error && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-short-bright, #a83d3d)' }}>
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!alias.trim() || submitting}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-gold-dim, rgba(201,168,76,0.4))',
            color: 'var(--color-gold, #c9a84c)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            padding: '10px 24px',
            cursor: alias.trim() && !submitting ? 'pointer' : 'default',
            opacity: alias.trim() && !submitting ? 1 : 0.4,
            transition: 'opacity 200ms ease',
          }}
        >
          {submitting ? 'Salvo…' : 'Continua'}
        </button>
      </div>
    </div>
  );
}

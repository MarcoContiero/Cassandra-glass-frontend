'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// Frontend minimale per la Fase 1 (§11 spec_canale_condiviso_finale.md):
// caricamento iniziale + polling incrementale, invio messaggio, reply
// minima. Badge di stato job (§8) arrivano con il worker (Fase 2).

interface ChannelModule {
  name: string;
  display_name: string;
}

interface ChannelMessage {
  id: number;
  author_type: 'user' | 'claude_code' | 'claude_advisor' | 'chatgpt_advisor';
  author_id: string | null;
  author_name: string | null;
  module: string;
  content: string;
  parent_message_id: number | null;
  reply_to_id: number | null;
  created_at: string;
}

const POLL_INTERVAL_MS = 4000;

const AUTHOR_LABEL: Record<ChannelMessage['author_type'], string> = {
  user: '',
  claude_code: 'Claude Code',
  claude_advisor: 'Claude',
  chatgpt_advisor: 'ChatGPT',
};

function displayAuthor(m: ChannelMessage): string {
  if (m.author_type === 'user') return m.author_name || m.author_id || 'Utente';
  return AUTHOR_LABEL[m.author_type];
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChannelPage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [modules, setModules] = useState<ChannelModule[]>([]);
  const [activeModule, setActiveModule] = useState<string>('generale');
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [content, setContent] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChannelMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  const cursorRef = useRef<number | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);
  const INITIAL_LIMIT = 50;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch('/api/channel/modules', { cache: 'no-store' })
      .then(r => r.json())
      .then(setModules)
      .catch(() => setModules([]));
  }, [isSignedIn]);

  // Caricamento iniziale: una volta per modulo selezionato, senza after_id.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    cursorRef.current = null;
    setMessages([]);
    setHasMoreOlder(true);
    fetch(`/api/channel/messages?module=${encodeURIComponent(activeModule)}&limit=${INITIAL_LIMIT}`, {
      cache: 'no-store',
    })
      .then(r => r.json())
      .then((rows: ChannelMessage[]) => {
        if (cancelled) return;
        setMessages(rows);
        if (rows.length > 0) cursorRef.current = rows[rows.length - 1].id;
        setHasMoreOlder(rows.length === INITIAL_LIMIT);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, activeModule]);

  // Storia precedente al caricamento iniziale (§9, before_id) — bottone esplicito, non infinite scroll.
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const earliestId = messages[0].id;
      const r = await fetch(
        `/api/channel/messages?module=${encodeURIComponent(activeModule)}&before_id=${earliestId}&limit=${INITIAL_LIMIT}`,
        { cache: 'no-store' }
      );
      const rows: ChannelMessage[] = await r.json();
      setMessages(prev => [...rows, ...prev]);
      setHasMoreOlder(rows.length === INITIAL_LIMIT);
    } catch {
      // best-effort: un fallimento isolato non blocca il resto della pagina
    } finally {
      setLoadingOlder(false);
    }
  }, [activeModule, loadingOlder, hasMoreOlder, messages]);

  // Polling incrementale con after_id, separato dal caricamento iniziale.
  useEffect(() => {
    if (!isSignedIn) return;
    const timer = setInterval(async () => {
      const after = cursorRef.current;
      if (after == null) return;
      try {
        const r = await fetch(
          `/api/channel/messages?module=${encodeURIComponent(activeModule)}&after_id=${after}&limit=200`,
          { cache: 'no-store' }
        );
        const rows: ChannelMessage[] = await r.json();
        if (rows.length > 0) {
          setMessages(prev => [...prev, ...rows]);
          cursorRef.current = rows[rows.length - 1].id;
        }
      } catch {
        // polling best-effort: un fallimento isolato non blocca il prossimo giro
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isSignedIn, activeModule]);

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/channel/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_message_id: crypto.randomUUID(),
          module: activeModule,
          content: trimmed,
          parent_message_id: replyTarget?.id ?? undefined,
          reply_to_id: replyTarget?.id ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.detail || `Invio fallito (${res.status})`);
        return;
      }
      const created: ChannelMessage = await res.json();
      setMessages(prev => (prev.some(m => m.id === created.id) ? prev : [...prev, created]));
      if (cursorRef.current == null || created.id > cursorRef.current) cursorRef.current = created.id;
      setContent('');
      setReplyTarget(null);
    } catch {
      setError('Invio fallito: errore di rete');
    } finally {
      setSending(false);
    }
  }, [content, sending, activeModule, replyTarget]);

  if (!isLoaded || !isSignedIn) return null;

  // Gate: stesso privilegio di Tifi 4.0 (tifide_access: true in Clerk public metadata)
  if (user?.publicMetadata?.tifide_access !== true) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-void)' }}>
        <div className="text-center">
          <span className="block mb-4 font-mono text-[9px] uppercase tracking-[0.5em] text-[var(--color-short-bright)]">
            Accesso non autorizzato
          </span>
          <span className="font-mono text-xs text-[var(--color-text-dim)]">
            Questa pagina richiede privilegi amministratore.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col p-4 gap-3">
      <div className="flex gap-2 items-center">
        {modules.map(m => (
          <Button
            key={m.name}
            variant={m.name === activeModule ? 'cassandra' : 'cassandra-outline'}
            size="sm"
            onClick={() => setActiveModule(m.name)}
          >
            {m.display_name}
          </Button>
        ))}
        <Link
          href="/app/channel/stats"
          className="ml-auto text-xs font-mono uppercase tracking-wide text-[var(--color-text-dim)] hover:text-[var(--color-gold)]"
        >
          costi &amp; latenza →
        </Link>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col p-0 bg-[var(--color-surface)] border-[var(--color-border-dim)]">
        <ScrollArea className="flex-1 min-h-0 p-4">
          <div className="flex flex-col gap-3">
            {hasMoreOlder && messages.length > 0 && (
              <button
                className="self-center text-xs text-[var(--color-text-faint)] hover:text-[var(--color-gold)] disabled:opacity-40"
                onClick={loadOlder}
                disabled={loadingOlder}
              >
                {loadingOlder ? 'carico…' : 'carica messaggi precedenti'}
              </button>
            )}
            {messages.map(m => (
              <div key={m.id} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-xs text-[var(--color-text-dim)]">
                  <span className="font-mono uppercase tracking-wide">{displayAuthor(m)}</span>
                  <span>{fmtTime(m.created_at)}</span>
                  {m.parent_message_id != null && <span>↳ in risposta a #{m.parent_message_id}</span>}
                </div>
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                <button
                  className="self-start text-xs text-[var(--color-text-faint)] hover:text-[var(--color-gold)]"
                  onClick={() => setReplyTarget(m)}
                >
                  rispondi
                </button>
              </div>
            ))}
            <div ref={scrollBottomRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-[var(--color-border-dim)] p-3 flex flex-col gap-2">
          {replyTarget && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
              <span>in risposta a #{replyTarget.id}: {replyTarget.content.slice(0, 60)}</span>
              <button className="hover:text-[var(--color-gold)]" onClick={() => setReplyTarget(null)}>
                annulla
              </button>
            </div>
          )}
          {error && <div className="text-xs text-[var(--color-short-bright)]">{error}</div>}
          <div className="flex gap-2">
            <textarea
              className="flex-1 resize-none rounded-none border border-[var(--color-border-dim)] bg-transparent p-2 text-sm outline-none"
              rows={2}
              value={content}
              maxLength={8000}
              placeholder="Scrivi un messaggio... (@claude, @chatgpt per menzionare un advisor)"
              onChange={e => setContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button variant="cassandra" onClick={sendMessage} disabled={sending || !content.trim()}>
              Invia
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

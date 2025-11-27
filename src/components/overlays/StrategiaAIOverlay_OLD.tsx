"use client";

import { useMemo, useState } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, Flame, TrendingDown, TrendingUp, Info, Target, Clock } from "lucide-react";

/**
 * STRATEGIA AI – Overlay principale
 *
 * Obiettivo: mostrare una selezione "ibrida" dei 3 scenari consigliati:
 *  1) Il più VICINO alla conferma nella direzione vincente (closestWinning)
 *  2) Il più FORTE nella direzione vincente (strongestWinning)
 *  3) Il più VICINO nella direzione perdente (closestLosing)
 *
 * Il componente è estremamente tollerante rispetto alla forma dell'oggetto `data`,
 * accettando più chiavi possibili (versioni vecchie/nuove del backend).
 */

export default function StrategiaOverlay({ title = "Strategia AI", data }: { title?: string; data: any }) {
  const [tab, setTab] = useState<string>("strategia");

  const {
    symbol,
    price,
    tfList,
    winningDirection,
    scenariosHybrid,
    confidenceOverall,
    narrative,
    debugBlob,
  } = useMemo(() => deriveStrategy(data), [data]);

  // ⬇︎ dentro il componente StrategiaOverlay, non fuori
  if (typeof window !== "undefined") {
    (window as any).__LAST_STRATEGIA_DATA__ = data;
    console.log("[STRATEGIA] data keys =", Object.keys(data || {}));
    console.log("[STRATEGIA] strategia_ai =", data?.strategia_ai);
    console.log("[STRATEGIA] longshort =", data?.longshort);
  }

  return (
    <DialogContent className="max-w-6xl w-[98vw] p-0 bg-zinc-900/95 text-white">
      <DialogHeader className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {symbol && (
            <Badge variant="secondary" className="bg-white/10 text-white/90">
              {symbol}
            </Badge>
          )}
          {Number.isFinite(price) && (
            <div className="text-white/70 text-sm">Prezzo attuale: <span className="font-mono">{fmtNum(price)}</span></div>
          )}
          {tfList.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-white/60 text-sm">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Timeframe analizzati:</span>
              <div className="flex gap-1">{tfList.map((tf) => (
                <Badge key={tf} className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">{tf}</Badge>
              ))}</div>
            </div>
          )}
        </div>
      </DialogHeader>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="px-4 pt-4">
          <TabsList className="bg-white/5">
            <TabsTrigger value="strategia">Strategia</TabsTrigger>
            <TabsTrigger value="dettagli">Dettagli</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
          </TabsList>
        </div>

        {/* TAB: STRATEGIA (riassunto compatto) */}
        <TabsContent value="strategia" className="p-4 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {scenariosHybrid.map((s, i) => (
              <ScenarioCard key={i} s={s} price={price} winningDirection={winningDirection} />
            ))}
          </div>

          <Separator className="my-4 bg-white/10" />

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4" /> Visione d'insieme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-white/70 text-sm">Confidenza complessiva</span>
                <div className="flex-1">
                  <Progress value={confidenceOverall} className="h-2 bg-white/10" />
                </div>
                <Badge className="bg-white/10 border-white/15">{Math.round(confidenceOverall)}%</Badge>
              </div>
              {narrative && (
                <p className="text-white/80 leading-relaxed text-sm whitespace-pre-wrap">
                  {narrative}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: DETTAGLI (contenuti estesi dei 3 scenari) */}
        <TabsContent value="dettagli" className="p-4 pt-2">
          <ScrollArea className="h-[58vh] pr-2">
            <div className="space-y-4">
              {scenariosHybrid.map((s, i) => (
                <ScenarioDetails key={i} s={s} price={price} />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* TAB: DEBUG (JSON grezzo utile quando qualcosa non quadra) */}
        <TabsContent value="debug" className="p-4 pt-2">
          <pre className="whitespace-pre-wrap-break-words text-white/80 text-xs bg-black/30 p-3 rounded-xl border border-white/10">
            {JSON.stringify(debugBlob, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

/* ------------------------------ Componenti UI ------------------------------ */

function ScenarioCard(
  { s, price, winningDirection }:
    { s: ScenarioLite; price?: number; winningDirection?: Dir }
) {
  const dirIsWinning = s.direction === winningDirection;
  const DirIcon = s.direction === "LONG" ? TrendingUp : TrendingDown;
  const accent = s.direction === "LONG" ? "emerald" : "rose";

  const entryLbl =
    Number.isFinite(price) && Number.isFinite(s.entry)
      ? ((s.entry as number) >= (price as number) ? "ENTRY SOPRA" : "ENTRY SOTTO")
      : "ENTRY";

  const distPct =
    Number.isFinite(price) && Number.isFinite(s.entry)
      ? Math.abs(((s.entry as number) - (price as number)) / (price as number)) * 100
      : null;

  return (
    <Card className="bg-white/5 border-white/10 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <DirIcon className={`w-4 h-4 text-${accent}-300`} />
          <span>
            {s.name || "Osservazione"}
            {s.direction ? ` (${String(s.direction).toLowerCase()})` : ""}
          </span>

          {dirIsWinning && (
            <Badge className={`bg-${accent}-500/15 text-${accent}-300 border border-${accent}-500/20`}>
              Vincente
            </Badge>
          )}

          {s.meta && (
            <Badge className="bg-white/10 text-white/80 border border-white/15">{s.meta}</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Confidenza & TF */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60 mb-1">CONFIDENZA</div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Progress value={s.confidence ?? 0} className="h-2 bg-white/10" />
              </div>
              <Badge className="bg-white/10 border-white/15">
                {Math.round(s.confidence ?? 0)}%
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs text-white/60 mb-1">TIMEFRAME</div>
            <div className="flex flex-wrap gap-1">
              {(s.tf ?? []).map((tf) => (
                <Badge key={tf} className="bg-white/10 text-white/80 border border-white/15">
                  {tf}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Spiegazione breve */}
        {s.explanation && (
          <p className="text-sm text-white/75 leading-snug">{s.explanation}</p>
        )}

        {/* Dettagli ricchi (come UI storica) */}
        {(s.trigger || s.triggerZone || s.invalidationText || s.invalidationZone || s.targetsText) && (
          <div className="mt-1 space-y-1.5 text-[13px] text-white/75">
            {s.trigger && (
              <div className="flex gap-2">
                <span className="shrink-0 text-white/50">Trigger:</span>
                <span className="truncate">{s.trigger}</span>
              </div>
            )}
            {s.triggerZone && (
              <div className="flex gap-2">
                <span className="shrink-0 text-white/50">Zona trigger:</span>
                <span className="truncate">{s.triggerZone}</span>
              </div>
            )}
            {s.invalidationText && (
              <div className="flex gap-2">
                <span className="shrink-0 text-white/50">Invalidazione:</span>
                <span className="truncate">{s.invalidationText}</span>
              </div>
            )}
            {s.invalidationZone && (
              <div className="flex gap-2">
                <span className="shrink-0 text-white/50">Zona invalidazione:</span>
                <span className="truncate">{s.invalidationZone}</span>
              </div>
            )}
            {s.targetsText && (
              <div className="flex gap-2">
                <span className="shrink-0 text-white/50">Targets:</span>
                <span className="truncate">{s.targetsText}</span>
              </div>
            )}
          </div>
        )}

        {/* Livelli (verticale) */}
        <div className="pt-1 space-y-2">
          {/* ENTRY */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] text-white/50">{entryLbl}</div>
            <div className="font-mono tabular-nums text-right min-w-[12ch]">
              {Number.isFinite(s.entry) ? fmtNum(s.entry as number) : "—"}
            </div>
          </div>

          {/* TP1 / TP2 affiancati stretti, ma "riga" verticale complessiva */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-2">
              <div className="text-[11px] text-white/50">TP1</div>
              <div className="font-mono tabular-nums text-right min-w-[12ch]">
                {Number.isFinite(s.tp1) ? fmtNum(s.tp1 as number) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-2">
              <div className="text-[11px] text-white/50">TP2</div>
              <div className="font-mono tabular-nums text-right min-w-[12ch]">
                {Number.isFinite(s.tp2) ? fmtNum(s.tp2 as number) : "—"}
              </div>
            </div>
          </div>

          {/* STOP in fondo */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] text-white/50">STOP</div>
            <div className="font-mono tabular-nums text-right min-w-[12ch]">
              {Number.isFinite(s.stop) ? fmtNum(s.stop as number) : "—"}
            </div>
          </div>
        </div>
        {/* Distanza da prezzo & RR */}
        <div className="flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span>Distanza dal prezzo:</span>
            <span className="font-mono">{distPct !== null ? `${distPct.toFixed(1)}%` : "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>RR:</span>
            <span className="font-mono">{Number.isFinite(s.rr) ? String(s.rr) : "—"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioDetails({ s, price }: { s: ScenarioLite; price?: number }) {
  const DirIcon = s.direction === "LONG" ? TrendingUp : TrendingDown;
  const accent = s.direction === "LONG" ? "emerald" : "rose";

  return (
    <Card className={`bg-${accent}-500/[0.06] border-${accent}-400/20`}>
      <CardHeader className="pb-1">
        <CardTitle className="text-base flex items-center gap-2">
          <DirIcon className={`w-4 h-4 text-${accent}-300`} />
          <span className={`text-${accent}-200`}>{s.meta ?? s.badge ?? labelBadge(s)}</span>
          <span className="text-white/70">— {s.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {s.explanation && (
          <p className="text-white/80 whitespace-pre-wrap leading-relaxed">{s.explanation}</p>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <KV k="Confidenza">
            <div className="flex items-center gap-2">
              <Progress value={s.confidence} className="h-2 bg-white/10" />
              <span className="text-white/80">{Math.round(s.confidence)}%</span>
            </div>
          </KV>
          <KV k="Timeframe">{s.tf?.join(", ") || "—"}</KV>
          <KV k="RR">{fmtMaybe(s.rr)}</KV>
          <KV k="Prezzo → Entry">
            {Number.isFinite(price) && Number.isFinite(s.entry) ? (
              <span>
                {fmtNum(price!)} → {fmtNum(s.entry!)} ({fmtPct((s.entry! - price!) / price!)})
              </span>
            ) : (
              "—"
            )}
          </KV>
          <KV k="TP1/TP2">
            {fmtMaybe(s.tp1)} / {fmtMaybe(s.tp2)}
          </KV>
          <KV k="Invalidazione">{fmtMaybe(s.stop)}</KV>
        </div>

        {s.narrative && (
          <div className="pt-1">
            <div className="flex items-center gap-2 text-white/70 mb-1">
              <Flame className="w-4 h-4" />
              <span>Narrativa</span>
            </div>
            <p className="text-white/80 whitespace-pre-wrap leading-relaxed">{s.narrative}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KV({ k, children }: { k: string; children: any }) {
  return (
    <div className="bg-black/20 border border-white/10 rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wide text-white/50 mb-1">{k}</div>
      <div className="text-white/90 text-sm">{children}</div>
    </div>
  );
}

/* ------------------------------ Types & Utils ------------------------------ */

type Dir = "LONG" | "SHORT" | undefined;

type ScenarioLite = {
  direction: Dir;
  meta?: string; // etichetta da mostrare
  badge?: string; // opzionale
  name?: string;
  tf?: string[];
  confidence: number; // 0..100
  rr?: number | null;
  entry?: number | null;
  stop?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  narrative?: string;
  explanation?: string;
  isClosest?: boolean;
  isStrongest?: boolean;
  trigger?: string;
  triggerZone?: string;
  invalidationText?: string;
  invalidationZone?: string;
  targetsText?: string;
};

function deriveStrategy(raw: any) {
  const r = unwrap(raw);

  const symbol = pickFirst<string>(r, [
    "symbol",
    "coin",
    "ticker",
    ["risposte", "symbol"],
    ["risposte", "coin"],
  ]);

  const price = pickFirst<number>(r, [
    "prezzo",
    "price",
    ["risposte", "prezzo"],
    ["risposte", "price"],
  ]);

  const tfList = (
    pickFirst<string[]>(r, [
      "timeframes",
      ["risposte", "timeframes"],
      ["trend_tf_score", "keys"], // fallback strano
    ]) || inferTFfromScores(r)
  ).filter(Boolean) as string[];

  // Direzione vincente globalmente (può arrivare come stringa o dal punteggio aggregato)
  const winningDirection: Dir = normalizeDir(
    pickFirst<string>(r, [
      "direzione_vincente",
      ["risposte", "direzione_vincente"],
      "dominant_direction",
      ["longshort", "direzione"],                // ← aggiunta utile per il tuo JSON
    ]) || inferWinningDirection(r)
  );


  const scenariosRaw = collectScenarios(r);
  const rawLite = collectScenarios(raw);
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];

  const supporti = Array.isArray(raw?.supporti) ? raw.supporti : [];
  const resistenze = Array.isArray(raw?.resistenze) ? raw.resistenze : [];

  const scenariosLite0 = fillLevelsFromEntries(rawLite, entries, supporti, resistenze, price);
  const scenariosHybrid0 = selectHybridScenarios(scenariosLite0, winningDirection, price);

  // 👉 Post-pass: completa STOP/TP anche per i placeholder creati dalla selezione
  const scenariosHybrid = scenariosHybrid0.map((s: ScenarioLite) => {
    // SR/RES ordinati intorno al prezzo (tipizzati)
    const isFiniteNumber = (n: unknown): n is number =>
      typeof n === "number" && Number.isFinite(n as number);

    const toNumSafe = (v: any): number | undefined => {
      const n = toNum(v);
      return isFiniteNumber(n) ? (n as number) : undefined;
    };

    const p: number | undefined = isFiniteNumber(price) ? (price as number) : undefined;

    const supVals: number[] = (supporti ?? [])
      .map((x: any) => toNumSafe(x?.valore))
      .filter((n: number | undefined): n is number => isFiniteNumber(n));

    const resVals: number[] = (resistenze ?? [])
      .map((x: any) => toNumSafe(x?.valore))
      .filter((n: number | undefined): n is number => isFiniteNumber(n));

    const below: number[] = supVals
      .filter((v: number) => (p !== undefined ? v <= p : true))
      .sort((a: number, b: number) => b - a);

    const above: number[] = resVals
      .filter((v: number) => (p !== undefined ? v >= p : true))
      .sort((a: number, b: number) => a - b);

    // 1) ENTRY: se mancante o ≈ al prezzo, scegli da SR/RES in base a pullback/breakout
    let entry: number | undefined = isFiniteNumber(s.entry) ? (s.entry as number) : undefined;

    const EPS = 1e-6;
    const sameAsPrice =
      entry !== undefined && p !== undefined && Math.abs(entry - p) < EPS;

    // segnali dal testo/meta + flag
    const metaStr = String(s.meta ?? "").toLowerCase();
    const isPullback =
      /pullback|rimbalzo|retest/.test(metaStr) || s.isClosest === true;
    const isBreakout =
      /break|breakout|sfond|supera|tenuta sopra|tenuta sotto/.test(metaStr) ||
      s.isStrongest === true;

    // SR/RES più vicini (se esistono)
    const firstBelow: number | undefined = below.length > 0 ? below[0] : undefined;
    const firstAbove: number | undefined = above.length > 0 ? above[0] : undefined;

    if (!isFiniteNumber(entry) || sameAsPrice) {
      // --- PUNTO 2: forza la differenza pullback/breakout sui LONG, e lato opposto sugli SHORT
      const metaStr = String(s.meta ?? "").toLowerCase();
      const isPullback = /pullback|rimbalzo|retest/.test(metaStr) || s.isClosest === true;
      // Tratto anche "osservazione" come breakout "di massima" se non è pullback
      const isBreakout = /break|breakout|sfond|supera|osservazione/.test(metaStr) || s.isStrongest === true;

      if (s.direction === "LONG") {
        // LONG: pullback = supporto sotto, breakout = resistenza sopra
        entry = isPullback
          ? firstBelow ?? entry
          : isBreakout
            ? firstAbove ?? entry
            : entry ?? (firstAbove ?? firstBelow);
      } else if (s.direction === "SHORT") {
        // SHORT: pullback = resistenza sopra, breakout = supporto sotto
        entry = isPullback
          ? firstAbove ?? entry
          : isBreakout
            ? firstBelow ?? entry
            : entry ?? (firstBelow ?? firstAbove);
      }
    }

    const withEntry: ScenarioLite = { ...s, entry };
    // 2) Completa STOP/TP (e RR) con il fallback SR/RES
    const completed = fallbackFromSR(withEntry, p, supporti, resistenze);

    // 3) Testo/meta: se il testo è “generico”, costruiscilo in base al tipo (pullback/breakout)
    const isGeneric = (t?: string) =>
      !t || /dati minimi disponibili|segnale preliminare/i.test(t);

    // Etichetta meta (se manca)
    const meta =
      s.meta ??
      (isPullback
        ? "Pullback (vincente)"
        : isBreakout
          ? "Breakout (vincente)"
          : "Osservazione");

    // Frase descrittiva se quella esistente è generica
    let explanation = completed.explanation;
    if (isGeneric(explanation)) {
      const dir = completed.direction === "LONG" ? "LONG" : "SHORT";
      const en = completed.entry;
      const st = completed.stop;
      const t1 = completed.tp1;
      const t2 = completed.tp2;

      if (isPullback) {
        explanation =
          dir === "LONG"
            ? `Pullback su supporto → conferma su re-test/close ↑ ${fmtNum(en)}. Inval: ${fmtNum(st)}. Targets: ${fmtNum(t1)} / ${fmtNum(t2)}.`
            : `Pullback su resistenza → conferma su re-test/close ↓ ${fmtNum(en)}. Inval: ${fmtNum(st)}. Targets: ${fmtNum(t1)} / ${fmtNum(t2)}.`;
      } else if (isBreakout) {
        explanation =
          dir === "LONG"
            ? `Breakout sopra resistenza → conferma su close ↑ ${fmtNum(en)}. Inval: ${fmtNum(st)}. Targets: ${fmtNum(t1)} / ${fmtNum(t2)}.`
            : `Breakdown sotto supporto → conferma su close ↓ ${fmtNum(en)}. Inval: ${fmtNum(st)}. Targets: ${fmtNum(t1)} / ${fmtNum(t2)}.`;
      } else {
        explanation = `Segnale in osservazione: attendere conferme (retest/close sul livello ${fmtNum(en)}).`;
      }
    }

    return { ...completed, meta, explanation };

  });

  // (facoltativo) esport per console
  ; (window as any).__SCENARIOS_LITE__ = scenariosLite0;
  ; (window as any).__SCENARIOS_HYBRID__ = scenariosHybrid;


  // Mappa i tre scenari selezionati (compatibilità con nomi storici)
  const breakoutWin = scenariosHybrid.find(s => (s.meta ?? "").toLowerCase().includes("breakout")) ?? null;
  const pullbackWin = scenariosHybrid.find(s => (s.meta ?? "").toLowerCase().includes("pullback")) ?? null;
  const strongestOpposite = scenariosHybrid.find(s => s.direction && s.direction !== winningDirection) ?? null;

  // Alias storici usati sotto
  const closestWinning = breakoutWin;
  const strongestWinning = pullbackWin;
  const closestLosing = strongestOpposite;

  // Confidenza complessiva = media delle 2 vincenti + la perdente pesata
  const confVals = [
    Number(closestWinning?.confidence ?? 0),
    Number(strongestWinning?.confidence ?? 0),
    Number(closestLosing?.confidence ?? 0) * 0.6,
  ].filter((v) => Number.isFinite(v)) as number[];

  const confidenceOverall = confVals.length ? clamp(avg(confVals), 0, 100) : 0;

  const narrative = pickFirst<string>(r, [
    "narrativa_globale",
    ["risposte", "narrativa_globale"],
    "spiegazione",
    ["risposte", "spiegazione"],
  ]);

  const debugBlob = { symbol, price, tfList, winningDirection, scenariosRaw, scenariosLite: scenariosLite0, scenariosHybrid };

  return { symbol, price, tfList, winningDirection, scenariosHybrid, confidenceOverall, narrative, debugBlob };
}

function labelBadge(s: ScenarioLite) {
  if (s.isStrongest) return s.direction === "LONG" ? "Più forte (long)" : "Più forte (short)";
  if (s.isClosest) return s.direction === "LONG" ? "Più vicino (long)" : "Più vicino (short)";
  return s.direction || "Scenario";
}

function collectScenarios(r: any): any[] {
  const cands: any[] = [];

  // 1) Nuovo formato: strategia_ai.items  (tuo backend attuale)
  const strat = r?.strategia_ai;
  if (strat && Array.isArray(strat.items)) {
    const dirFallback = normalizeDir(r?.longshort?.direzione);

    for (const it of strat.items) {
      cands.push({
        // direzione: item > fallback longshort
        direction: normalizeDir(pickFirst<string>(it, ["direzione", "direction"])) ?? dirFallback,

        // base
        name: pickFirst<string>(it, ["titolo", "title", "nome", "name"]),
        explanation: pickFirst<string>(it, ["spiegazione", "explanation", "descrizione", "description"]),
        narrative: pickFirst<string>(it, ["narrativa", "story"]),
        tf: (() => {
          const v = pickFirst<string | string[]>(it, ["tf", "timeframes"]);
          return Array.isArray(v) ? v : v ? [String(v)] : [];
        })(),
        confidence: (() => {
          const raw = pickFirst<number | string>(it, ["confidenza", "confidence", "score"]) ?? 0;
          const n = toNum(raw) ?? 0;
          return n <= 1 ? n * 100 : n;
        })(),

        // livelli numerici
        entry: toNum(pickFirst<number | string>(it, ["prezzo_riferimento", "entry", "ingresso"])),
        stop: toNum(pickFirst<number | string>(it, ["stop", "invalidazione_num", "inval"])),
        tp1: toNum(pickFirst<number | string>(it, ["tp1"])),
        tp2: toNum(pickFirst<number | string>(it, ["tp2"])),
        rr: toNum(pickFirst<number | string>(it, ["rr", "risk_reward", "rapporto"])),

        // ✦ campi “ricchi” (testo/zone) per parità con la UI storica
        trigger: pickFirst<string>(it, ["trigger", "condizione", "condizioni", "signal", "regole_trigger", "regole_attivazione"]),
        triggerZone: pickFirst<string>(it, ["zona_trigger", "trigger_zone", "area_trigger"]),
        invalidationText: pickFirst<string>(it, ["invalidazione", "invalidazione_testo", "invalidation_text"]),
        invalidationZone: pickFirst<string>(it, ["zona_invalidazione", "invalidation_zone"]),
        targetsText: pickFirst<string>(it, ["targets_text", "targets", "obiettivi", "target"]),

        // opzionale: etichetta meta se il selettore ibrido l'ha messa
        meta: pickFirst<string>(it, ["meta", "label", "tag"]),
      });
    }
  }

  // 2) Vecchi formati sotto strategia_ai / risposte.strategia_ai
  const one = pickFirst<any>(r, ["strategia_ai", ["risposte", "strategia_ai"]]);
  if (one && typeof one === "object") {
    if (Array.isArray(one)) {
      cands.push(...one);
    } else {
      for (const k of ["scenari", "scenari_attivi", "consigliati", "strategia", "items"]) {
        if (Array.isArray(one[k])) cands.push(...one[k]);
      }
      if (one["scenario"]) cands.push(one["scenario"]);
    }
  }

  // 3) Alias globali
  const two = pickFirst<any[]>(
    r,
    ["scenari_attivi", ["risposte", "scenari_attivi"], ["risposte", "scenari"]]
  );
  if (Array.isArray(two)) cands.push(...two);

  // dedup e pulizia
  return dedupArray(cands.filter(Boolean));
}

function toScenarioLite(x: any): ScenarioLite {
  const direction: Dir = normalizeDir(
    pickFirst<string>(x, ["direction", "direzione", "dir", "tipo"]) || undefined
  );

  const tf = (
    pickFirst<string[] | string>(x, ["tf", "timeframes"]) || []
  );
  const tfList = Array.isArray(tf) ? tf : String(tf).split(/[,\s]+/g).filter(Boolean);

  const confidence = clamp(
    toNum(
      pickFirst<number | string>(x, ["confidence", "confidenza", "score", ["punteggio", "totale"]]) || 0
    ) || 0,
    0,
    100
  );

  const entry = toNum(pickFirst<number | string>(x, ["entry", "ingresso", "prezzo_entry", ["setup", "entry"]]));
  const stop = toNum(pickFirst<number | string>(x, ["stop", "inval", "invalidazione", ["setup", "stop"]]));
  const tp1 = toNum(pickFirst<number | string>(x, ["tp1", ["targets", 0], ["setup", "tp1"]]));
  const tp2 = toNum(pickFirst<number | string>(x, ["tp2", ["targets", 1], ["setup", "tp2"]]));
  const rr = toNum(pickFirst<number | string>(x, ["rr", "risk_reward", "rapporto", ["setup", "rr"]]));

  const name = pickFirst<string>(x, ["name", "nome", "codice", "scenario"]);
  const narrative = pickFirst<string>(x, ["narrativa", "narration", "story"]);
  const explanation = pickFirst<string>(x, ["spiegazione", "explanation", "descrizione", "description"]);

  // Flags opzionali (se il backend li fornisce già)
  const isClosest = !!pickFirst<boolean>(x, ["isClosest", "closest"]);
  const isStrongest = !!pickFirst<boolean>(x, ["isStrongest", "strongest"]);

  return {
    direction,
    tf: tfList,
    confidence,
    entry,
    stop,
    tp1,
    tp2,
    rr,
    name,
    narrative,
    explanation,
    isClosest,
    isStrongest,
    badge: direction || "Scenario",
  };
}

function selectHybrid(items: ScenarioLite[], winning: Dir, price?: number) {
  const withDir = (d: Dir) => items.filter((s) => s.direction === d);
  const long = withDir("LONG");
  const short = withDir("SHORT");

  const byDistance = (a?: ScenarioLite | null, b?: ScenarioLite | null) => {
    const da = entryDistance(a, price);
    const db = entryDistance(b, price);
    return (da ?? Infinity) - (db ?? Infinity);
  };

  const strongest = (arr: ScenarioLite[]) => arr.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  const closest = (arr: ScenarioLite[]) => arr.slice().sort(byDistance)[0];

  const poolWin = winning === "SHORT" ? short : long;
  const poolLose = winning === "SHORT" ? long : short;

  const strongestWinning = markFlag(strongest(poolWin), "isStrongest");
  const closestWinning = markFlag(closest(poolWin), "isClosest");
  const closestLosing = markFlag(closest(poolLose), "isClosest");

  return { strongestWinning, closestWinning, closestLosing };
}

function markFlag<T extends object>(obj: T | undefined, key: keyof T) {
  if (!obj) return undefined as any;
  return { ...(obj as any), [key]: true };
}

/* ------------------------------ helpers generici ------------------------------ */

// helpers ─────────────────────────────────────────────────────────────────
function str(v?: unknown) { return String(v ?? '').toLowerCase(); }

// --- helpers per livelli ---
const isN = (x: any): x is number => Number.isFinite(x);

// distanza minima “tecnica” (0.1% del prezzo)
const gapFor = (p?: number) => (isN(p) ? Math.max(p * 0.001, 1e-8) : 0);

const nextAbove = (arr: number[], min: number) => arr.find(v => v > min);
const nextBelow = (arr: number[], max: number) => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] < max) return arr[i];
  return undefined;
};

// garantisce l’ordine e separa i livelli di almeno 'g'
function enforceMonotonic(
  dir: "LONG" | "SHORT",
  entry?: number, stop?: number, tp1?: number, tp2?: number,
  g: number = 0
) {
  if (!isN(entry)) return { entry, stop, tp1, tp2 };

  if (dir === "LONG") {
    if (!isN(stop) || stop >= entry - g) stop = entry - g;
    if (!isN(tp1) || tp1 <= entry + g) tp1 = entry + g;
    if (!isN(tp2) || tp2 <= tp1 + g) tp2 = tp1 + g;
  } else {
    if (!isN(stop) || stop <= entry + g) stop = entry + g;
    if (!isN(tp1) || tp1 >= entry - g) tp1 = entry - g;
    if (!isN(tp2) || tp2 >= tp1 - g) tp2 = tp1 - g;
  }
  return { entry, stop, tp1, tp2 };
}

function classifyScenario(s: ScenarioLite): "breakout" | "pullback" | "other" {
  const hay = [s.name, s.explanation, s.narrative, s.trigger].map(str).join(" ");
  const isBreakout =
    /\bbreak(out)?\b|chiusura sopra|close above|tenuta sopra|sfond|break & hold/.test(hay);
  const isPullback =
    /\bpullback\b|retest|re-test|retesto|re-entry|rientro|reclaim|ritracci|ritorno in zona|bounce/.test(hay);
  if (isBreakout && !isPullback) return "breakout";
  if (isPullback && !isBreakout) return "pullback";
  return "other";
}

function distancePctFromPrice(s: ScenarioLite, price?: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(s.entry)) return null;
  return Math.abs(((s.entry as number) - (price as number)) / (price as number)) * 100;
}

// score: conf (60%) + rr (30%) + vicinanza (10%, più vicino meglio)
function scoreScenario(s: ScenarioLite, price?: number): number {
  const conf = Math.max(0, Math.min(100, s.confidence ?? 0)) / 100;   // 0..1
  const rr = Math.max(0, Math.min(5, Number(s.rr ?? 0))) / 5;       // 0..1 (cap a 5)
  const dist = distancePctFromPrice(s, price);
  const prox = dist == null ? 0.0 : Math.max(0, Math.min(1, 1 - Math.min(dist, 10) / 10)); // 1 vicino
  return 0.6 * conf + 0.3 * rr + 0.1 * prox;
}

function makePlaceholder(direction: Dir | undefined, price?: number): ScenarioLite {
  return {
    direction,
    name: "Osservazione",
    explanation: "Segnale preliminare: in attesa di conferma (breakout/retest o livelli validati).",
    meta: "Osservazione",                // ← AGGIUNGI QUESTA
    tf: [],
    confidence: 50,
    entry: Number.isFinite(price) ? (price as number) : undefined,
  };
}

// SELEZIONE IBRIDA (3 fissi) ─────────────────────────────────────────────
function selectHybridScenarios(
  scenariosLite: ScenarioLite[],
  winningDirection: Dir | undefined,
  price?: number
): ScenarioLite[] {
  const win = scenariosLite.filter(s => s.direction === winningDirection);
  const lose = scenariosLite.filter(s => s.direction && s.direction !== winningDirection);

  // 1) vincente → breakout
  const breakout = win
    .filter(s => classifyScenario(s) === "breakout")
    .sort((a, b) => scoreScenario(b, price) - scoreScenario(a, price))[0];

  // 2) vincente → pullback
  const pullback = win
    .filter(s => classifyScenario(s) === "pullback" && s !== breakout)
    .sort((a, b) => scoreScenario(b, price) - scoreScenario(a, price))[0];

  // fallback se mancano: prendi “più vicino” nella direzione vincente
  const winByProximity = [...win].sort((a, b) => {
    const da = distancePctFromPrice(a, price) ?? 1e9;
    const db = distancePctFromPrice(b, price) ?? 1e9;
    return da - db;
  });

  const pickClosestWin = () => winByProximity.find(s => s !== breakout && s !== pullback);
  const selBreakout = breakout ?? pickClosestWin() ?? makePlaceholder(winningDirection, price);
  const selPullback = pullback ?? pickClosestWin() ?? makePlaceholder(winningDirection, price);

  // 3) opposta → più forte
  const strongestOpposite = lose
    .sort((a, b) => scoreScenario(b, price) - scoreScenario(a, price))[0]
    ?? makePlaceholder(winningDirection === "LONG" ? "SHORT" : "LONG", price);

  // etichette meta per la UI
  selBreakout.meta = "Breakout (vincente)";
  selPullback.meta = "Pullback (vincente)";
  strongestOpposite.meta = `Più forte (${(strongestOpposite.direction ?? "—").toString().toLowerCase()})`;

  // evita duplicati identici
  const uniq = new Map<string, ScenarioLite>();
  for (const s of [selBreakout, selPullback, strongestOpposite]) {
    const key = `${s.direction}|${s.name}|${s.entry}|${s.stop}|${s.tp1}|${s.tp2}`;
    if (!uniq.has(key)) uniq.set(key, s);
  }

  // se per caso sono <3, completa con placeholder
  while (uniq.size < 3) {
    uniq.set(`ph${uniq.size}`, makePlaceholder(winningDirection, price));
  }

  return Array.from(uniq.values()).slice(0, 3);
}

function computeRR(entry?: number, stop?: number, tp?: number): number | undefined {
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(tp)) return undefined;
  const risk = Math.abs((entry as number) - (stop as number));
  if (risk === 0) return undefined;
  const reward = Math.abs((tp as number) - (entry as number));
  return +((reward / risk).toFixed(2));
}

function fallbackFromSR(
  s: ScenarioLite,
  price?: number,
  supporti: any[] = [],
  resistenze: any[] = []
): ScenarioLite {
  if (!Number.isFinite(price)) return s;

  const toNumSafe = (v: any) => {
    const n = toNum(v);
    return Number.isFinite(n) ? (n as number) : undefined;
  };

  const supVals = supporti
    .map((x) => toNumSafe(x?.valore))
    .filter((n): n is number => Number.isFinite(n));

  const resVals = resistenze
    .map((x) => toNumSafe(x?.valore))
    .filter((n): n is number => Number.isFinite(n));

  const below = supVals.filter((v) => v <= (price as number)).sort((a, b) => b - a);
  const above = resVals.filter((v) => v >= (price as number)).sort((a, b) => a - b);

  // LONG: stop sotto, tp sopra. SHORT: stop sopra, tp sotto
  if (s.direction === "LONG") {
    const stop = Number.isFinite(s.stop) ? s.stop : below[0];
    const tp1 = Number.isFinite(s.tp1) ? s.tp1 : above[0];
    const tp2 = Number.isFinite(s.tp2) ? s.tp2 : above[1];

    const entryN = Number.isFinite(s.entry as any) ? (s.entry as number) : undefined;
    const rr = Number.isFinite(s.rr)
      ? (s.rr as number)
      : computeRR(entryN, stop ?? undefined, (tp1 ?? tp2) ?? undefined);

    return { ...s, stop, tp1, tp2, rr };
  } else if (s.direction === "SHORT") {
    const stop = Number.isFinite(s.stop) ? s.stop : above[0];
    const tp1 = Number.isFinite(s.tp1) ? s.tp1 : below[0];
    const tp2 = Number.isFinite(s.tp2) ? s.tp2 : below[1];

    const entryN = Number.isFinite(s.entry as any) ? (s.entry as number) : undefined;
    const rr = Number.isFinite(s.rr)
      ? (s.rr as number)
      : computeRR(entryN, stop ?? undefined, (tp1 ?? tp2) ?? undefined);

    return { ...s, stop, tp1, tp2, rr };
  }

  return s;
}

function fillLevelsFromEntries(
  scenarios: ScenarioLite[],
  entries: any[] = [],
  supporti: any[] = [],
  resistenze: any[] = [],
  price?: number
): ScenarioLite[] {

  const haveEntries = Array.isArray(entries) && entries.length > 0;

  const dirOf = (e: any) =>
    String(e?.direction ?? e?.dir ?? "").toUpperCase() as "LONG" | "SHORT" | "";

  const num = (v: any) => (Number.isFinite(v) ? Number(v) : undefined);

  return scenarios.map((s) => {
    // Se già completi, tienili
    const complete = Number.isFinite(s.stop as number) &&
      (Number.isFinite(s.tp1 as number) || Number.isFinite(s.tp2 as number));
    if (complete) return s;

    // --- 1) prova a riempire dai dati "entries" (se presenti) ---
    let stop: number | undefined;
    let tp1: number | undefined;
    let tp2: number | undefined;

    const num = (v: any) => {
      const n = toNum(v);
      return Number.isFinite(n as number) ? (n as number) : undefined;
    };

    if (haveEntries) {
      const sameDir = entries.filter(
        (e) => (String(e?.direction ?? e?.dir ?? "").toUpperCase()) === String(s.direction ?? "").toUpperCase()
      );

      if (sameDir.length > 0) {
        const target =
          sameDir
            .map((e: any) => ({
              e,
              d: (Number.isFinite(s.entry) && Number.isFinite(e?.entry))
                ? Math.abs((e.entry as number) - (s.entry as number))
                : Number.POSITIVE_INFINITY,
            }))
            .sort((a, b) => a.d - b.d)[0]?.e ?? sameDir[0];

        // alias comuni
        stop = num(target?.stop ?? target?.sl ?? target?.stop_loss ?? target?.invalidazione ?? target?.inval);
        tp1 = num(
          target?.tp1 ?? target?.tp_first ??
          (Array.isArray(target?.tp) ? target.tp[0] : undefined) ??
          (Array.isArray(target?.tps) ? target.tps[0] : undefined) ??
          (Array.isArray(target?.take_profit) ? target.take_profit[0] : undefined) ??
          (Array.isArray(target?.targets) ? target.targets[0] : undefined)
        );
        tp2 = num(
          target?.tp2 ?? target?.tp_second ??
          (Array.isArray(target?.tp) ? target.tp[1] : undefined) ??
          (Array.isArray(target?.tps) ? target.tps[1] : undefined) ??
          (Array.isArray(target?.take_profit) ? target.take_profit[1] : undefined) ??
          (Array.isArray(target?.targets) ? target.targets[1] : undefined)
        );
      }
    }

    // Merge preliminare
    const merged: ScenarioLite = {
      ...s,
      stop: Number.isFinite(s.stop as number) ? (s.stop as number) : (stop ?? undefined),
      tp1: Number.isFinite(s.tp1 as number) ? (s.tp1 as number) : (tp1 ?? undefined),
      tp2: Number.isFinite(s.tp2 as number) ? (s.tp2 as number) : (tp2 ?? undefined),
    };

    // RR se possibile
    let withRR: ScenarioLite = {
      ...merged,
      rr: Number.isFinite(merged.rr as number)
        ? (merged.rr as number)
        : computeRR(
          (merged.entry ?? undefined) as number | undefined,
          (merged.stop ?? undefined) as number | undefined,
          ((merged.tp1 ?? merged.tp2) ?? undefined) as number | undefined
        ),
    };

    // --- 2) fallback da Supporti/Resistenze se mancano ancora i livelli ---
    const needSR =
      !Number.isFinite(withRR.stop as number) ||
      (!Number.isFinite(withRR.tp1 as number) && !Number.isFinite(withRR.tp2 as number));

    if (needSR) {
      withRR = fallbackFromSR(withRR, price, supporti, resistenze);
    }

    return withRR;
  });
}

function unwrap(x: any) {
  if (!x) return {};
  // Accetta direttamente, oppure x.risposte, oppure x.data
  if (x.risposte && typeof x.risposte === "object") return x.risposte;
  if (x.data && typeof x.data === "object") return x.data;
  return x;
}

function pickFirst<T = any>(obj: any, keys: (string | (string | number)[])[]): T | undefined {
  for (const k of keys) {
    const val = Array.isArray(k) ? deepGet(obj, k) : obj?.[k];
    if (val !== undefined && val !== null) return val as T;
  }
  return undefined;
}

function deepGet(obj: any, path: (string | number)[]) {
  return path.reduce((acc, key) => (acc ? acc[key as any] : undefined), obj);
}

function dedupArray<T>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const k = JSON.stringify(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function fmtNum(n?: number | null) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n as number);
  } catch {
    return String(n);
  }
}

function fmtPct(n?: number | null) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 }).format(n as number);
  } catch {
    return `${(n * 100).toFixed(2)}%`;
  }
}

function fmtMaybe(n?: number | null) {
  return Number.isFinite(n as number) ? fmtNum(n as number) : "—";
}

function entryDistance(s?: ScenarioLite | null, price?: number) {
  if (!s || !Number.isFinite(price || NaN) || !Number.isFinite(s.entry || NaN)) return null;
  return Math.abs((s.entry as number) - (price as number));
}

function normalizeDir(x?: string): Dir {
  if (!x) return undefined;
  const s = String(x).toUpperCase();
  if (s.includes("LONG")) return "LONG";
  if (s.includes("SHORT")) return "SHORT";
  return undefined;
}

function inferTFfromScores(r: any): string[] {
  const sc = r?.trend_tf_score || r?.trend_tf || r?.tf_score;
  if (!sc || typeof sc !== "object") return [];
  return Object.keys(sc);
}

function inferWinningDirection(r: any): Dir {
  // prova a inferire dal punteggio aggregato: { long: x, short: y }
  const agg = r?.score_globale || r?.score || r?.punteggio_globale;
  if (agg && typeof agg === "object") {
    const L = toNum(agg.long) || 0;
    const S = toNum(agg.short) || 0;
    if (L > S) return "LONG";
    if (S > L) return "SHORT";
  }
  return undefined;
}

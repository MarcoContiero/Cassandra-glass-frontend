"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingDown, TrendingUp, Gauge, Flame } from "lucide-react";
import type { ScenarioLite } from "./types";
import { fmtNum, fmtMaybe, fmtPct } from "./utils";

export function ScenarioDetails({ s, price }: { s: ScenarioLite; price?: number }) {
  const DirIcon = s.direction === "LONG" ? TrendingUp : TrendingDown;
  const accent = s.direction === "LONG" ? "emerald" : "rose";

  const score = Number.isFinite(s.signalScore as number) ? Math.round(Number(s.signalScore)) : undefined;
  const confidence = s.confidence ?? 50;

  return (
    <Card className={`bg-${accent}-500/[0.06] border-${accent}-400/20`}>
      <CardHeader className="pb-1">
        <CardTitle className="text-base flex items-center gap-2">
          <DirIcon className={`w-4 h-4 text-${accent}-300`} />
          <span className={`text-${accent}-200`}>{s.meta ?? s.badge ?? (s.direction || "Scenario")}</span>
          {s.name && <span className="text-white/70">— {s.name}</span>}
          {s.status && <span className="text-white/60 text-xs rounded px-2 py-0.5 border border-white/15 bg-white/10">{s.status}</span>}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {s.explanation && (
          <p className="text-white/80 whitespace-pre-wrap leading-relaxed">{s.explanation}</p>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <KV k="Confidenza">
            <div className="flex items-center gap-2">
              <Progress value={confidence} className="h-2 bg-white/10" />
              <span className="text-white/80">{Math.round(confidence)}%</span>
            </div>
          </KV>

          <KV k="Punteggio segnale">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              <div className="flex-1"><Progress value={score ?? 0} className="h-2 bg-white/10" /></div>
              <span className="text-white/80">{score !== undefined ? `${score} / 100` : "—"}</span>
            </div>
            {s.signalScoreBreakdown && (
              <div className="text-xs text-white/60 mt-1">
                Prob: {(s.signalScoreBreakdown.prob * 100).toFixed(0)}% ·
                Payoff: {(s.signalScoreBreakdown.payoff * 100).toFixed(0)}% ·
                Prox: {(s.signalScoreBreakdown.prox * 100).toFixed(0)}%
              </div>
            )}
          </KV>

          <KV k="Timeframe">{s.tf?.join(", ") || "—"}</KV>
          <KV k="RR">{fmtMaybe(s.rr)}</KV>

          <KV k="Prezzo → Entry">
            {Number.isFinite(price) && Number.isFinite(s.entry) ? (
              <span>
                {fmtNum(price!)} → {fmtNum(s.entry!)} ({fmtPct(((s.entry! - price!) / price!))})
              </span>
            ) : (
              "—"
            )}
          </KV>

          <KV k="TP1/TP2">{fmtMaybe(s.tp1)} / {fmtMaybe(s.tp2)}</KV>
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

        {s.note && (
          <div className="text-xs text-white/70 bg-white/5 border border-white/10 rounded-lg p-2">
            {s.note}
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

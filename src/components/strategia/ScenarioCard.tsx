"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Gauge } from "lucide-react";
import type { ScenarioLite, Dir } from "./types";
import { fmtNum } from "./utils";

export function ScenarioCard(
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

  const confidence = s.confidence ?? 50;
  const signal = Number.isFinite(s.signalScore as number) ? Math.round(Number(s.signalScore)) : undefined;

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
          {s.status && (
            <Badge className="bg-white/10 text-white/70 border border-white/15">{s.status}</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60 mb-1">CONFIDENZA</div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Progress value={confidence} className="h-2 bg-white/10" />
              </div>
              <Badge className="bg-white/10 border-white/15">
                {Math.round(confidence)}%
              </Badge>
            </div>
          </div>

          <div>
            <div className="text-xs text-white/60 mb-1 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5" /> PUNTEGGIO SEGNALE
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Progress value={signal ?? 0} className="h-2 bg-white/10" />
              </div>
              <Badge className="bg-white/10 border-white/15">
                {signal !== undefined ? `${signal} / 100` : "—"}
              </Badge>
            </div>
          </div>
        </div>

        {s.explanation && (
          <p className="text-sm text-white/75 leading-snug whitespace-pre-wrap">{s.explanation}</p>
        )}

        {(s.trigger || s.triggerZone || s.invalidationText || s.invalidationZone || s.targetsText) && (
          <div className="mt-1 space-y-1.5 text-[13px] text-white/75">
            {s.trigger && (
              <div className="flex gap-2"><span className="shrink-0 text-white/50">Trigger:</span><span className="truncate">{s.trigger}</span></div>
            )}
            {s.triggerZone && (
              <div className="flex gap-2"><span className="shrink-0 text-white/50">Zona trigger:</span><span className="truncate">{s.triggerZone}</span></div>
            )}
            {s.invalidationText && (
              <div className="flex gap-2"><span className="shrink-0 text-white/50">Invalidazione:</span><span className="truncate">{s.invalidationText}</span></div>
            )}
            {s.invalidationZone && (
              <div className="flex gap-2"><span className="shrink-0 text-white/50">Zona invalidazione:</span><span className="truncate">{s.invalidationZone}</span></div>
            )}
            {s.targetsText && (
              <div className="flex gap-2"><span className="shrink-0 text-white/50">Targets:</span><span className="truncate">{s.targetsText}</span></div>
            )}
          </div>
        )}

        <div className="pt-1 space-y-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] text-white/50">{entryLbl}</div>
            <div className="font-mono tabular-nums text-right min-w-[12ch]">
              {Number.isFinite(s.entry) ? fmtNum(s.entry as number) : "—"}
            </div>
          </div>

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

          <div className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="text-[11px] text-white/50">STOP</div>
            <div className="font-mono tabular-nums text-right min-w-[12ch]">
              {Number.isFinite(s.stop) ? fmtNum(s.stop as number) : "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span>Distanza dal prezzo:</span>
            <span className="font-mono">
              {distPct !== null ? `${distPct.toFixed(1)}%` : "—"}
            </span>
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

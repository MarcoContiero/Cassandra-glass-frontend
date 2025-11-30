// src/components/ciclica/CiclicaPanel.tsx
"use client";

import * as React from "react";
import type {
  CiclicaViewModel,
  CiclicaTfBlock,
  CiclicaWindowVM,
  CiclicaTimelineVM,
} from "@/lib/ciclica/ciclicaViewModel";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

export interface CiclicaPanelProps {
  data: CiclicaViewModel | null;
  className?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function CiclicaPanel({ data, className }: CiclicaPanelProps) {
  if (!data) {
    return (
      <div className={className}>
        <Card>
          <CardHeader>
            <CardTitle>Analisi Ciclica</CardTitle>
            <CardDescription>
              Dati ciclici non disponibili per questo asset / combinazione di timeframe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Cassandra non ha rilevato informazioni cicliche sufficienti per costruire le finestre
              gassose. Riprova con un altro timeframe o dopo un nuovo aggiornamento dei dati.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { activeTimeframes, cyclesByTf, windows, timelineItems, scenariosCompatibility, strategiaAiCompat, narrative } =
    data;

  const activeWindows = windows.filter((w) => w.stateKey === "attiva" || w.stateKey === "in_arrivo");
  const historicalWindows = windows.filter((w) => w.stateKey === "storica");

  return (
    <div className={className}>
      <div className="flex flex-col gap-4">
        {/* Header ---------------------------------------------------------------- */}
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>Analisi Ciclica</CardTitle>
                <CardDescription>
                  Ritmo, fasi e finestre gassose su 1h, 4h, 1D e 12h (quando rilevante).
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeTimeframes.map((tf) => {
                  const block = cyclesByTf[tf] as CiclicaTfBlock | undefined;
                  return (
                    <Badge
                      key={tf}
                      variant="outline"
                      className="text-xs font-medium px-2 py-1 rounded-full"
                    >
                      {tf}{" "}
                      {block?.tfDescription ? (
                        <span className="ml-1 text-[0.7rem] text-muted-foreground">
                          {block.tfDescription}
                        </span>
                      ) : null}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Blocchi per TF -------------------------------------------------------- */}
        <CyclesByTfSection cyclesByTf={cyclesByTf} />

        {/* Finestre attive / in arrivo ----------------------------------------- */}
        <WindowsSection activeWindows={activeWindows} />

        {/* Timeline sintetica --------------------------------------------------- */}
        <TimelineSection items={timelineItems} />

        {/* Compatibilità scenari / Strategia AI -------------------------------- */}
        <CompatibilitySection
          scenarios={scenariosCompatibility}
          strategia={strategiaAiCompat ?? undefined}
        />

        {/* Narrativa gassosa ---------------------------------------------------- */}
        <NarrativeSection narrative={narrative} />

        {/* Storico (facoltativo / collapsible in futuro) ------------------------ */}
        {historicalWindows.length > 0 && (
          <HistoricalWindowsSection historicalWindows={historicalWindows} />
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sezioni
// -----------------------------------------------------------------------------

interface CyclesByTfSectionProps {
  cyclesByTf: Record<string, CiclicaTfBlock>;
}

function CyclesByTfSection({ cyclesByTf }: CyclesByTfSectionProps) {
  const entries = Object.values(cyclesByTf);

  if (!entries.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Stato dei cicli per timeframe</CardTitle>
        <CardDescription>
          Fase del ciclo, posizione nel range e qualità della lettura per ciascun timeframe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {entries.map((tfBlock) => (
            <div
              key={tfBlock.tfKey}
              className="flex flex-col gap-2 rounded-xl border bg-background/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tfBlock.tfLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tfBlock.tfDescription}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="text-[0.7rem] px-2 py-0.5 rounded-full"
                >
                  Qualità {Math.round(tfBlock.qualityScore)}
                </Badge>
              </div>

              <Separator className="my-1" />

              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fase</span>
                  <span className="font-medium">{tfBlock.phaseLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Posizione</span>
                  <span className="font-medium">{tfBlock.rangePositionLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Convergenza</span>
                  <span className="font-medium">{tfBlock.convergenceLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Distorsione</span>
                  <span className="font-medium">{tfBlock.distortionLabel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------

interface WindowsSectionProps {
  activeWindows: CiclicaWindowVM[];
}

function WindowsSection({ activeWindows }: WindowsSectionProps) {
  if (!activeWindows.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Finestre cicliche attive</CardTitle>
          <CardDescription>
            Nessuna finestra gassosa attiva o imminente al momento.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Finestre cicliche attive / in arrivo</CardTitle>
        <CardDescription>
          Cuspidi, Valli, Nodi e Sforzi che Cassandra considera temporaneamente rilevanti.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[320px] pr-2">
          <div className="flex flex-col gap-3">
            {activeWindows.map((win) => (
              <WindowCard key={win.id} window={win} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface WindowCardProps {
  window: CiclicaWindowVM;
}

function WindowCard({ window }: WindowCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {window.typeLabel} <span className="text-xs text-muted-foreground">({window.tfLabel})</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{window.uiSubtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <Badge
            variant={window.stateKey === "attiva" ? "default" : "outline"}
            className="text-[0.7rem] px-2 py-0.5 rounded-full"
          >
            {window.stateLabel}
          </Badge>
          <Badge
            variant="outline"
            className="text-[0.7rem] px-2 py-0.5 rounded-full"
          >
            {window.intensityLabel}
          </Badge>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1.5 text-[0.7rem]">
        <div className="flex flex-col">
          <span className="text-muted-foreground">Direzione</span>
          <span className="font-medium">{window.directionLabel}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Finestra temporale</span>
          <span className="font-medium">{window.timeRangeLabel}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Range prezzo</span>
          <span className="font-medium">{window.priceRangeLabel}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Confidenza</span>
          <span className="font-medium">{window.confidence}</span>
        </div>
      </div>

      {window.confluenzeBadges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {window.confluenzeBadges.map((badge) => (
            <Badge
              key={badge}
              variant="outline"
              className="text-[0.65rem] px-2 py-0.5 rounded-full"
            >
              {badge}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

interface TimelineSectionProps {
  items: CiclicaTimelineVM[];
}

function TimelineSection({ items }: TimelineSectionProps) {
  if (!items.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Timeline ciclica</CardTitle>
        <CardDescription>
          Panoramica temporale delle finestre attive, in arrivo e storiche (multi-TF raggruppate).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full max-w-full overflow-x-auto">
          <div className="flex items-stretch gap-2 py-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 rounded-full border bg-background/70 px-3 py-1.5 text-[0.7rem] min-w-[140px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{item.mainTypeLabel}</span>
                  <Badge
                    variant={item.stateKey === "attiva" ? "default" : "outline"}
                    className="text-[0.6rem] px-1.5 py-0.5 rounded-full"
                  >
                    {item.stateLabel}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 text-[0.65rem] text-muted-foreground">
                  <span>
                    {item.intensityLabel}
                    {item.multiTfTag ? ` · ${item.multiTfTag}` : null}
                  </span>
                  {item.tfCount > 1 && item.uiSubLabel && (
                    <span className="truncate">{item.uiSubLabel}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------

import type {
  CiclicaScenarioCompatVM,
  CiclicaStrategiaCompatVM,
} from "@/lib/ciclica/ciclicaViewModel";

// ...

interface CompatibilitySectionProps {
  scenarios: CiclicaScenarioCompatVM[];
  strategia?: CiclicaStrategiaCompatVM;
}

function CompatibilitySection({ scenarios, strategia }: CompatibilitySectionProps) {
  const hasScenarios = Array.isArray(scenarios) && scenarios.length > 0;
  const hasStrategia = !!strategia;

  if (!hasScenarios && !hasStrategia) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Compatibilità con scenari e Strategia AI</CardTitle>
        <CardDescription>
          Come la lettura ciclica si intreccia con gli scenari Cassandra 2.0 e con il setup
          operativo principale.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-xs">
        {hasScenarios && (
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-[0.75rem]">Scenari</span>
            <div className="flex flex-col gap-1.5">
              {scenarios.map((s) => (
                <div key={s.scenarioKey} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.scenarioLabel}</span>
                    <Badge
                      variant="outline"
                      className="text-[0.65rem] px-2 py-0.5 rounded-full"
                    >
                      {s.timingLabel}
                    </Badge>
                  </div>
                  <p className="text-[0.7rem] text-muted-foreground">{s.uiSummary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasStrategia && strategia && (
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-[0.75rem]">Strategia AI</span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  Setup {strategia.directionLabel} {strategia.tfLabel}
                </span>
                <Badge
                  variant="outline"
                  className="text-[0.65rem] px-2 py-0.5 rounded-full"
                >
                  {strategia.timingLabel}
                </Badge>
              </div>
              <p className="text-[0.7rem] text-muted-foreground">{strategia.uiSummary}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------- //
// ----------------------------------------------------------------------------- //
// test deploy ciclica 2


interface NarrativeSectionProps {
  narrative: string;
}

function NarrativeSection({ narrative }: NarrativeSectionProps) {
  if (!narrative) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Narrativa ciclica gassosa</CardTitle>
        <CardDescription>
          Sintesi ragionata del ritmo di mercato secondo X/Y/Z/D e finestre gassose.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {narrative}
        </p>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------

interface HistoricalWindowsSectionProps {
  historicalWindows: CiclicaWindowVM[];
}

function HistoricalWindowsSection({ historicalWindows }: HistoricalWindowsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Finestre storiche recenti</CardTitle>
        <CardDescription>
          Utili per analizzare come il prezzo ha reagito alle finestre cicliche passate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[220px] pr-2">
          <div className="flex flex-col gap-2">
            {historicalWindows.map((win) => (
              <div
                key={win.id}
                className="flex items-center justify-between gap-2 rounded-xl border bg-background/50 px-3 py-2 text-[0.7rem]"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {win.typeShortLabel} {win.tfLabel}
                  </span>
                  <span className="text-muted-foreground">
                    {win.directionLabel} · {win.timeRangeLabel}
                  </span>
                </div>
                <Badge variant="outline" className="text-[0.65rem] px-2 py-0.5 rounded-full">
                  Storica
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

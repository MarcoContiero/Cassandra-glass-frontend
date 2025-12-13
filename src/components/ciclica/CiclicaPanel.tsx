// src/components/ciclica/CiclicaPanel.tsx
"use client";

import * as React from "react";
import type {
  CiclicaViewModel,
  CiclicaTfBlock,
  CiclicaWindowVM,
  CiclicaTimelineVM,
  CiclicaNodoTransizioneVM,
  CiclicaCustomRoadmapVM,
  CiclicaReentryVM,
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

  const {
    activeTimeframes,
    cyclesByTf,
    windows,
    timelineItems,
    scenariosCompatibility,
    strategiaAiCompat,
    narrative,
    summary,
    roadmap,
    nodoTransizione,
    customRoadmap,
    reentryPath,
    // --- CICLICA 2.8: segnali globali ---
    pivotPred,
    qualitaMassimo,
    qualitaMinimo,
    energia,
    crossSync,
    eventRisk,
    gestioneOperativa,
  } = data as CiclicaViewModel;

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

        {/* Nodo di Transizione ciclica ----------------------------------------- */}
        <NodoTransizioneSection nodo={nodoTransizione} />

        {/* Compatibilità scenari / Strategia AI -------------------------------- */}
        <CompatibilitySection
          scenarios={scenariosCompatibility}
          strategia={strategiaAiCompat ?? undefined}
        />

        {/* Sintesi ciclica multi-timeframe ------------------------------------- */}
        <SummarySection summary={summary} />

        {/* Segnali di fine gamba / pivot (Ciclica 2.8) ------------------------- */}
        <GlobalSignalsSection
          pivotPred={pivotPred}
          qualitaMassimo={qualitaMassimo}
          qualitaMinimo={qualitaMinimo}
          energia={energia}
          crossSync={crossSync}
          eventRisk={eventRisk}
          gestioneOperativa={gestioneOperativa}
        />

        {/* Roadmap ciclica strutturata 2.5 (nuovo pannello) -------------------- */}
        {customRoadmap?.hasData && <CustomRoadmapSection data={customRoadmap} />}

        {/* 🔵 Percorso di rientro ciclico */}
        {reentryPath && <ReentryPathSection data={reentryPath} />}

        {/* Roadmap temporale del ciclo ----------------------------------------- */}
        <RoadmapSection roadmap={roadmap} />

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

              {/* Durata ciclo + residuo --------------------------------------- */}
              {tfBlock.cycleDurationLabel && (
                <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-dashed">
                  <span className="text-muted-foreground">Durata ciclo</span>
                  <span className="font-medium">{tfBlock.cycleDurationLabel}</span>
                </div>
              )}

              {tfBlock.cycleRemainingLabel && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Durata residua</span>
                  <span className="font-medium">{tfBlock.cycleRemainingLabel}</span>
                </div>
              )}

              {typeof tfBlock.completionPct === "number" && (
                <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
                  <span>Completamento</span>
                  <span className="font-medium">
                    {Math.round(tfBlock.completionPct)}%
                  </span>
                </div>
              )}

              {tfBlock.cycleRemainingLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Durata residua</span>
                  <span className="font-medium">{tfBlock.cycleRemainingLabel}</span>
                </div>
              )}
              {tfBlock.completionPct != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">% Completamento</span>
                  <span className="font-medium">{Math.round(tfBlock.completionPct)}%</span>
                </div>
              )}

              {tfBlock.phaseRemainingLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fase residua</span>
                  <span className="font-medium">{tfBlock.phaseRemainingLabel}</span>
                </div>
              )}

              {tfBlock.nextWindowCountdownLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Prossima finestra</span>
                  <span className="font-medium">{tfBlock.nextWindowCountdownLabel}</span>
                </div>
              )}
              {tfBlock.pivotCountdownLabel && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Prossimo pivot</span>
                  <span className="font-medium">{tfBlock.pivotCountdownLabel}</span>
                </div>
              )}

              {tfBlock.pivotFlagsLabel && (
                <div className="mt-1 text-[0.7rem] text-muted-foreground">
                  {tfBlock.pivotFlagsLabel}
                </div>
              )}
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
        <ScrollArea className="max-h-80 pr-2">
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

interface SummarySectionProps {
  summary: string;
}

function SummarySection({ summary }: SummarySectionProps) {
  if (!summary) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sintesi ciclica multi-timeframe</CardTitle>
        <CardDescription>
          Proiezione sintetica di durata e fase dei cicli sui timeframe monitorati.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-line">
          {summary}
        </p>
      </CardContent>
    </Card>
  );
}

interface GlobalSignalsSectionProps {
  pivotPred: CiclicaViewModel["pivotPred"] | undefined;
  qualitaMassimo: CiclicaViewModel["qualitaMassimo"] | undefined;
  qualitaMinimo: CiclicaViewModel["qualitaMinimo"] | undefined;
  energia: CiclicaViewModel["energia"] | undefined;
  crossSync: CiclicaViewModel["crossSync"] | undefined;
  eventRisk: CiclicaViewModel["eventRisk"] | undefined;
  gestioneOperativa: CiclicaViewModel["gestioneOperativa"] | undefined;
}

function GlobalSignalsSection({
  pivotPred,
  qualitaMassimo,
  qualitaMinimo,
  energia,
  crossSync,
  eventRisk,
  gestioneOperativa,
}: GlobalSignalsSectionProps) {
  const hasAny =
    pivotPred ||
    qualitaMassimo ||
    qualitaMinimo ||
    energia ||
    crossSync ||
    eventRisk ||
    gestioneOperativa;

  if (!hasAny) return null;

  const pivotSentence =
    pivotPred?.probabilita != null && pivotPred?.finestra
      ? `Pivot molto probabile${pivotPred.timeframe ? ` sul TF ${pivotPred.timeframe}` : ""
      } fra ${pivotPred.finestra} (probabilità ~${Math.round(
        pivotPred.probabilita * 100
      )}%).`
      : undefined;

  const qualitaSentence = qualitaMassimo?.tipo
    ? `Massimo ${qualitaMassimo.tipo}${qualitaMassimo.affidabilita != null
      ? ` (affidabilità ~${Math.round(
        qualitaMassimo.affidabilita * 100
      )}%)`
      : ""
    }.`
    : undefined;

  const minimoSentence = qualitaMinimo?.tipo
    ? `Minimo ${qualitaMinimo.tipo}${qualitaMinimo.affidabilita != null
      ? ` (affidabilità ~${Math.round(
        qualitaMinimo.affidabilita * 100
      )}%)`
      : ""
    }.`
    : undefined;

  const energiaSentence = energia?.tipo
    ? energia.tipo === "alta"
      ? "Energia alta → probabile breakout aggressivo della zona primaria."
      : energia.tipo === "bassa"
        ? "Energia bassa → massimo marginale, meglio proteggere i take-profit."
        : "Energia media → movimento regolare, gestione standard dei target."
    : undefined;

  const crossSentence = crossSync?.leader
    ? crossSync.implicazione ||
    `Sincronizzazione con ${crossSync.leader}: ritardo atteso ${crossSync.ritardoAtteso ?? "?"
    } barre.`
    : undefined;

  const eventSentence = eventRisk?.tipo
    ? eventRisk.implicazione ||
    `${eventRisk.tipo} in arrivo tra ${eventRisk.in ?? "?"} → possibile distorsione del ciclo.`
    : undefined;

  const gestioneSentence =
    gestioneOperativa?.tp1 ||
      gestioneOperativa?.tpFull ||
      gestioneOperativa?.slMove
      ? `TP1 su ${gestioneOperativa.tp1 ?? "zona primaria"}, TP full su ${gestioneOperativa.tpFull ?? "zona massima"
      }, spostamento SL sotto ${gestioneOperativa.slMove ?? "zona primaria low"
      }.`
      : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Segnali di fine gamba &amp; gestione</CardTitle>
        <CardDescription>
          Lettura qualitativa del massimo, energia del ciclo e indicazioni operative contestuali.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {pivotSentence && <p>{pivotSentence}</p>}
        {qualitaSentence && <p>{qualitaSentence}</p>}
        {minimoSentence && <p>{minimoSentence}</p>}
        {energiaSentence && <p>{energiaSentence}</p>}
        {crossSentence && <p>{crossSentence}</p>}
        {eventSentence && <p>{eventSentence}</p>}
        {gestioneSentence && <p>{gestioneSentence}</p>}
      </CardContent>
    </Card>
  );
}

interface RoadmapSectionProps {
  roadmap: string;
}

function RoadmapSection({ roadmap }: RoadmapSectionProps) {
  if (!roadmap) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Roadmap temporale del ciclo</CardTitle>
        <CardDescription>
          Sequenza sintetica degli eventi ciclici attesi (fase, pivot, nuova struttura).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-line">
          {roadmap}
        </p>
      </CardContent>
    </Card>
  );
}

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

interface NodoTransizioneSectionProps {
  nodo?: CiclicaNodoTransizioneVM;
}

function NodoTransizioneSection({ nodo }: NodoTransizioneSectionProps) {
  if (!nodo || !nodo.active) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Nodo di Transizione ciclica</CardTitle>
        <CardDescription>
          Finestra in cui il ciclo principale si chiude mentre i cicli intermedi e brevi si
          ricalibrano, generando un possibile cambio di regime.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 md:grid-cols-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Completamento ciclo daily</span>
            <span className="font-medium">{nodo.dailyCompletionLabel}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Fase ciclo daily</span>
            <span className="font-medium">{nodo.dailyPhaseLabel}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Residuo ciclo 12h</span>
            <span className="font-medium">{nodo.h12ResidualLabel}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Fase ciclo 12h</span>
            <span className="font-medium">{nodo.h12PhaseLabel}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Stato 4h</span>
            <span className="font-medium">{nodo.h4ClarityLabel}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Stato 1h</span>
            <span className="font-medium">{nodo.h1StartedLabel}</span>
          </div>

          <div className="flex flex-col gap-0.5 md:col-span-2">
            <span className="text-muted-foreground">Range di prezzo del nodo</span>
            <span className="font-medium">{nodo.priceRangeLabel}</span>
          </div>
        </div>

        {nodo.narrative && (
          <div className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {nodo.narrative}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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

interface CustomRoadmapSectionProps {
  data: CiclicaCustomRoadmapVM;
}

function CustomRoadmapSection({ data }: CustomRoadmapSectionProps) {
  const { phases, uiSummary, biasLabel, tpLevels, slLevels } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Roadmap ciclica strutturata</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Sequenza di fasi attese, derivata dalla lettura ciclica 2.5.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-xs">
        {biasLabel && (
          <div className="inline-flex items-center gap-2 text-[0.75rem]">
            <span className="font-semibold">Bias ciclico:</span>
            <Badge variant="outline" className="text-[0.7rem] px-2 py-0.5 rounded-full">
              {biasLabel}
            </Badge>
          </div>
        )}

        {uiSummary && (
          <p className="text-[0.75rem] text-muted-foreground leading-snug">
            {uiSummary}
          </p>
        )}

        {phases.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {phases.map((p) => (
              <div
                key={p.id}
                className="border rounded-xl px-3 py-2 flex flex-col gap-1 min-w-40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[0.75rem]">{p.label}</span>
                  {p.barsRangeLabel && (
                    <span className="text-[0.7rem] text-muted-foreground">
                      {p.barsRangeLabel}
                    </span>
                  )}
                </div>
                {p.tfLabel && (
                  <div className="text-[0.7rem] text-muted-foreground">{p.tfLabel}</div>
                )}
                {p.description && (
                  <div className="text-[0.7rem]">{p.description}</div>
                )}
                {p.impact && (
                  <div className="text-[0.7rem] text-muted-foreground">{p.impact}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {(tpLevels.length > 0 || slLevels.length > 0) && (
          <div className="flex flex-col gap-2">
            {tpLevels.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-semibold text-[0.75rem]">TP ciclici:</span>
                {tpLevels.map((tp) => (
                  <Badge
                    key={tp.key}
                    variant="outline"
                    className="text-[0.7rem] px-2 py-0.5 rounded-full"
                  >
                    {tp.label}
                  </Badge>
                ))}
              </div>
            )}
            {slLevels.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-semibold text-[0.75rem]">SL / zone chiave:</span>
                {slLevels.map((sl) => (
                  <Badge
                    key={sl.key}
                    variant="outline"
                    className="text-[0.7rem] px-2 py-0.5 rounded-full"
                  >
                    {sl.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ReentryPathSectionProps {
  data: CiclicaReentryVM;
}

function ReentryPathSection({ data }: ReentryPathSectionProps) {
  const {
    archetypeLabel,
    directionLabel,
    currentPhase,
    steps,
    tpLabel,
    reentryZoneLabel,
    roadmapLines,
    pivotWindowLabel,
    roadmapCategoryLines,
    roadmapSummary,
  } = data;
  if (!data.hasData) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Percorso ciclico &amp; rientro</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Sequenza di fasi tra nodo di ciclo (min/max) e zona di re-entry operativa
          (scenari principali + minori).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[0.7rem]">
            {archetypeLabel}
          </Badge>
          <Badge variant="outline" className="text-[0.7rem]">
            {directionLabel}
          </Badge>
          {pivotWindowLabel && (
            <Badge variant="outline" className="text-[0.7rem]">
              {pivotWindowLabel}
            </Badge>
          )}
        </div>

        {currentPhase && (
          <p className="text-[0.75rem] text-muted-foreground leading-snug">
            {currentPhase}
          </p>
        )}

        {steps.length === 0 ? (
          <div className="text-[0.75rem] text-muted-foreground leading-snug">
            Percorso non calcolato per questo ciclo (sequenza non disponibile).
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <li
                  key={s.id}
                  className="border rounded-xl px-3 py-2 flex flex-col gap-1 bg-background/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[0.75rem]">
                      {s.order}. {s.label}
                    </span>
                    {s.barsRangeLabel && (
                      <span className="text-[0.7rem] text-muted-foreground">
                        {s.barsRangeLabel}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <div className="text-[0.7rem] text-muted-foreground">
                      {s.description}
                    </div>
                  )}
                </li>
              ))}
          </ol>
        )}

        {roadmapLines && roadmapLines.length > 0 && (
          <div className="mt-1 flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
            <div className="font-semibold text-[0.7rem]">
              Roadmap temporale del re-entry (TF 1h)
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              {roadmapLines.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {roadmapCategoryLines && roadmapCategoryLines.length > 0 && (
          <div className="mt-1 flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
            <div className="font-semibold text-[0.7rem]">
              Categorie cicliche chiave
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              {roadmapCategoryLines.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {roadmapSummary && (
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            {roadmapSummary}
          </p>
        )}

        {(tpLabel || reentryZoneLabel) && (
          <div className="flex flex-wrap gap-2 items-center">
            {tpLabel && (
              <Badge variant="outline" className="text-[0.7rem] px-2 py-0.5 rounded-full">
                {tpLabel}
              </Badge>
            )}
            {reentryZoneLabel && (
              <Badge
                variant="outline"
                className="text-[0.7rem] px-2 py-0.5 rounded-full border-amber-500/70"
              >
                {reentryZoneLabel}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
'use client';

import React from 'react';

interface ScoreBarProps {
  longScore: number;
  shortScore: number;
  total: number;
  animated?: boolean;
}

export function ScoreBar({ longScore, shortScore, total, animated = false }: ScoreBarProps) {
  const safeTotal = total > 0 ? total : 1;
  const longPct  = Math.min(100, (longScore  / safeTotal) * 100);
  const shortPct = Math.min(100, (shortScore / safeTotal) * 100);

  return (
    <div className="flex h-[3px] gap-[1px] w-full">
      <div
        className={`score-bar-long ${animated ? 'score-bar-animated' : ''} transition-all duration-500`}
        style={{ width: `${longPct}%` }}
      />
      <div className="flex-1" style={{ background: 'var(--color-text-faint)' }} />
      <div
        className={`score-bar-short ${animated ? 'score-bar-animated' : ''} transition-all duration-500`}
        style={{ width: `${shortPct}%` }}
      />
    </div>
  );
}

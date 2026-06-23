'use client';

import React from 'react';

const biasConfig = {
  LONG:   { label: 'rialzista',   className: 'bias-long'    },
  SHORT:  { label: 'ribassista',  className: 'bias-short'   },
  NEUTRO: { label: 'neutro',      className: 'bias-neutral' },
  LONG_BIAS:  { label: 'rialzista',  className: 'bias-long'  },
  SHORT_BIAS: { label: 'ribassista', className: 'bias-short' },
} as const;

type BiasKey = keyof typeof biasConfig;

interface BiasChipProps {
  bias: string;
  forza?: number;
  className?: string;
}

export function BiasChip({ bias, forza, className = '' }: BiasChipProps) {
  const key = (String(bias || '').toUpperCase()) as BiasKey;
  const config = biasConfig[key] ?? biasConfig.NEUTRO;

  return (
    <span
      className={`
        ${config.className}
        font-mono text-[10px] font-medium tracking-[0.2em] uppercase
        px-2 py-0.5
        inline-flex items-center gap-1.5
        ${className}
      `}
    >
      {config.label}
      {forza !== undefined && (
        <span className="opacity-60 text-[9px]">{forza}%</span>
      )}
    </span>
  );
}

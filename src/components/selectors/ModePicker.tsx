'use client';
import React from 'react';


type Mode = 'CASSANDRA' | 'ORIONE' | 'ARGONAUTA';

export default function ModePicker({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
  const modes: Mode[] = ['CASSANDRA', 'ORIONE', 'ARGONAUTA'];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-1 py-1">
      {modes.map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`px-2.5 py-1 text-xs rounded-md transition ${
              active
                ? 'bg-white/20 border border-white/30 text-white'
                : 'text-white/80 hover:bg-white/10 border border-transparent'
            }`}
            title={m}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

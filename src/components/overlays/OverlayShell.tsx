// frontend/components/OverlayShell.tsx
import * as React from "react";

type OverlayShellProps = {
  children: React.ReactNode;
  className?: string; // per personalizzazioni future
};

export function OverlayShell({ children, className }: OverlayShellProps) {
  return (
    <div className="max-h-[80vh] overflow-y-auto pr-2">
      <div
        className={`mx-auto max-w-6xl rounded-3xl p-4 md:p-6 shadow-xl${className ? ` ${className}` : ''}`}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

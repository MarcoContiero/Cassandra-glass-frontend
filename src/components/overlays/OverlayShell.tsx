// frontend/components/OverlayShell.tsx
import * as React from "react";

type OverlayShellProps = {
  children: React.ReactNode;
  className?: string; // per personalizzazioni future
};

export function OverlayShell({ children, className }: OverlayShellProps) {
  const base =
    "mx-auto max-w-6xl rounded-3xl bg-zinc-900/95 p-4 md:p-6 shadow-xl border border-white/5";
  const innerClassName = className ? `${base} ${className}` : base;

  return (
    <div className="max-h-[80vh] overflow-y-auto pr-2">
      <div className={innerClassName}>{children}</div>
    </div>
  );
}

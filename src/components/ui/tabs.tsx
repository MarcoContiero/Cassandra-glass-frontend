"use client";
import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Semplice tabs headless (no Radix): Tabs, TabsList, TabsTrigger, TabsContent

type TabsContextType = {
  value: string;
  setValue: (v: string) => void;
};
const TabsCtx = React.createContext<TabsContextType | null>(null);

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const val = controlled ? (value as string) : internal;

  const set = (v: string) => {
    if (!controlled) setInternal(v);
    onValueChange?.(v);
  };

  React.useEffect(() => {
    if (!controlled && !internal) {
      // attiva il primo TabsTrigger trovato
      const first = React.Children.toArray(children).find(
        (c: any) => c?.props?.__type === "TabsList"
      ) as any;
      const firstTrigger = first?.props?.children?.[0]?.props?.value;
      if (firstTrigger) setInternal(firstTrigger);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TabsCtx.Provider value={{ value: val, setValue: set }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-white/5 p-1 text-white/80",
        className
      )}
      // @ts-expect-error
      __type="TabsList"
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsCtx)!;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition",
        active
          ? "bg-white/20 text-white shadow"
          : "text-white/70 hover:text-white hover:bg-white/10",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsCtx)!;
  if (ctx.value !== value) return null;
  return <div className={cn("mt-2", className)}>{children}</div>;
}

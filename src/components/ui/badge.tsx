import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "long" | "short" | "neutral" | "gold" | "cyan";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center border px-2 py-0.5 text-[10px] font-mono tracking-[0.2em] uppercase transition-colors rounded-none";
    const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
      default:     "bg-[var(--color-surface)] text-[var(--color-text-dim)] border-[var(--color-border-dim)]",
      secondary:   "bg-[var(--color-surface)] text-[var(--color-text-dim)] border-[var(--color-border-dim)]",
      destructive: "bg-[var(--color-short-faint)] text-[var(--color-short-bright)] border-[rgba(168,61,61,0.3)]",
      outline:     "bg-transparent text-[var(--color-text-dim)] border-[var(--color-text-faint)]",
      long:        "bias-long",
      short:       "bias-short",
      neutral:     "bias-neutral",
      gold:        "bg-[var(--color-gold-faint)] text-[var(--color-gold)] border-[var(--color-border)]",
      cyan:        "bg-[var(--color-cyan-faint)] text-[var(--color-cyan)] border-[var(--color-border-cyan)]",
    };
    return (
      <span ref={ref} className={cn(base, variants[variant], className)} {...props} />
    );
  }
);
Badge.displayName = "Badge";

import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors";
    const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
      default: "bg-zinc-900 text-white border-white/20",
      secondary: "bg-white/10 text-white border-white/15",
      destructive: "bg-red-600/20 text-red-200 border-red-500/30",
      outline: "border-white/30 text-white/90",
    };
    return (
      <span ref={ref} className={cn(base, variants[variant], className)} {...props} />
    );
  }
);
Badge.displayName = "Badge";

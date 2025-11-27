import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number; // 0..100
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const v = Math.max(0, Math.min(100, value));
    return (
      <div
        ref={ref}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-white/10",
          className
        )}
        {...props}
      >
        <div
          className="h-full w-full flex-1 origin-left rounded-full bg-white/60"
          style={{ transform: `scaleX(${v / 100})` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

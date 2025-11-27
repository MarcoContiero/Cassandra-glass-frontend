import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => {
    const isV = orientation === "vertical";
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        className={cn(
          "shrink-0 bg-white/10",
          isV ? "h-full w-px" : "w-full h-px",
          className
        )}
        {...props}
      />
    );
  }
);
Separator.displayName = "Separator";

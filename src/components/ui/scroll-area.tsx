import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden",
          className
        )}
        {...props}
      >
        <div className="h-full w-full overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {children}
        </div>
      </div>
    );
  }
);
ScrollArea.displayName = "ScrollArea";

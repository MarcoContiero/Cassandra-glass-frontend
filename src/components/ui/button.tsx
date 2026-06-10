import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none",
  {
    variants: {
      variant: {
        // Cassandra variants (primary)
        cassandra:
          "bg-[var(--color-gold)] text-[var(--color-void)] hover:bg-[var(--color-gold-bright)] font-mono text-[10px] tracking-[0.25em] uppercase rounded-none btn-cassandra",
        "cassandra-outline":
          "bg-transparent text-[var(--color-text-dim)] hover:text-[var(--color-gold)] border border-[var(--color-text-faint)] hover:border-[var(--color-gold-dim)] font-mono text-[10px] tracking-[0.25em] uppercase rounded-none",
        "cassandra-cyan":
          "bg-[var(--color-cyan)] text-[var(--color-void)] hover:bg-[var(--color-cyan-bright)] font-mono text-[10px] tracking-[0.25em] uppercase rounded-none btn-cassandra",
        // Shadcn legacy variants
        default:
          "bg-[var(--color-gold)] text-[var(--color-void)] hover:bg-[var(--color-gold-bright)] rounded-none",
        destructive:
          "bg-[var(--color-short)] text-[var(--color-text)] hover:bg-[var(--color-short-bright)] rounded-none border border-[rgba(168,61,61,0.3)]",
        outline:
          "border border-[var(--color-border)] bg-transparent text-[var(--color-text-dim)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold-dim)] rounded-none",
        secondary:
          "bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] border border-[var(--color-border-dim)] rounded-none",
        ghost:
          "bg-transparent text-[var(--color-text-dim)] hover:text-[var(--color-gold)] hover:bg-[rgba(201,168,76,0.04)] rounded-none",
        link: "text-[var(--color-gold)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 gap-1.5 px-3",
        lg: "h-10 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

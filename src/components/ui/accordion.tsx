import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";

export const Accordion = AccordionPrimitive.Root;
export const AccordionItem = AccordionPrimitive.Item;

export const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className = "", children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="w-full">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={
          "flex w-full items-center justify-between py-2 text-left outline-none " +
          "transition-[opacity,transform] hover:opacity-90 " +
          className
        }
        {...props}
      >
        <span>{children}</span>
        <span aria-hidden className="ml-2 inline-block rotate-0 data-[state=open]:rotate-180 transition-transform">
          ▾
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className = "", children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={
        "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down " +
        "overflow-hidden " +
        className
      }
      {...props}
    >
      <div className="pt-2">{children}</div>
    </AccordionPrimitive.Content>
  );
});

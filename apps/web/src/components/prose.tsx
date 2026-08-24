import type { ReactNode } from "react";

import { cn } from "@/components/ui";

/**
 * Typographic shell for documentation.
 *
 * Kept as explicit components rather than a `prose` plugin so the type scale, tracking and weight
 * ceiling stay the ones the design system defines, instead of whatever a plugin's defaults happen
 * to be.
 */
export function DocTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <header className="mb-10 space-y-3">
      <h1 className="text-heading md:text-heading-lg">{children}</h1>
      {lead ? <p className="text-lead text-iron">{lead}</p> : null}
    </header>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10 space-y-4">
      <h2 className="text-heading-sm">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-body text-iron", className)}>{children}</p>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-violet/35 bg-violet/[0.06] p-5">
      <p className="text-small text-midnight">{children}</p>
    </div>
  );
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-card bg-midnight p-5 text-caption leading-relaxed text-white/85">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="space-y-5">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-4">
          <span
            aria-hidden="true"
            className="tabular mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-bone text-caption font-medium text-midnight"
          >
            {index + 1}
          </span>
          <div className="space-y-1.5">
            <h3 className="text-body font-medium text-midnight">{item.title}</h3>
            <div className="text-small text-iron">{item.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

import type { ReactNode } from "react";

export function Panel({
  id,
  title,
  step,
  caption,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  step?: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={`flex min-w-0 flex-col rounded-lg border border-border bg-surface ${className}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2
            id={id ? `${id}-title` : undefined}
            className="font-serif text-xl leading-tight text-foreground"
          >
            {title}
          </h2>
          {caption ? (
            <p className="mt-1 text-xs leading-5 text-muted">{caption}</p>
          ) : null}
        </div>
        {step ? (
          <span className="shrink-0 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-accent">
            {step}
          </span>
        ) : null}
      </header>
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </section>
  );
}

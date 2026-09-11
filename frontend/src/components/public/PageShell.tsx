import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Dark banner heading every inner public page, matching the homepage hero. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-brand-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(50rem 30rem at 20% -20%, oklch(0.48 0.148 261 / 0.5), transparent 60%), radial-gradient(35rem 25rem at 85% 10%, oklch(0.75 0.162 68 / 0.14), transparent 55%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-200">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

/** Shown while a collection loads: a quiet skeleton, not a spinner. */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card overflow-hidden">
          <div className="h-44 animate-pulse bg-ink-100" />
          <div className="space-y-2.5 p-5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-ink-100" />
            <div className="h-3 w-full animate-pulse rounded bg-ink-100" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <div className="card px-6 py-16 text-center">
      {icon && (
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
          {icon}
        </span>
      )}
      <p className="mt-4 font-medium text-ink-800">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">{body}</p>}
    </div>
  );
}

/**
 * Render CMS long-form text.
 *
 * Content is authored as plain text in the editor, so newlines are the only
 * structure. Rendering it as paragraphs rather than injecting HTML keeps
 * editor input from becoming a script-injection vector.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className={cn("space-y-4 leading-relaxed text-ink-700", className)}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

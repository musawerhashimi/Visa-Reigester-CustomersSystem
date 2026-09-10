import { format } from "date-fns";

import type { TimelineEntry } from "@/types/domain";

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-ink-500">
        Nothing has happened yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-5 px-5 py-5">
      {/* Connecting rail, stopping at the last marker rather than running past it. */}
      <span
        className="absolute left-[26px] top-7 bottom-7 w-px bg-ink-200"
        aria-hidden
      />

      {entries.map((entry) => (
        <li key={entry.id} className="relative flex gap-4">
          <span
            className="mt-1 size-3 shrink-0 rounded-full border-2 border-white bg-brand-500 ring-1 ring-ink-200"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-900">{entry.action}</p>
            {entry.description && (
              <p className="mt-0.5 text-sm text-ink-600">{entry.description}</p>
            )}
            <p className="mt-1 text-xs text-ink-400">
              {format(new Date(entry.created_at), "d MMM yyyy, HH:mm")}
              {entry.actor_name && ` · ${entry.actor_name}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

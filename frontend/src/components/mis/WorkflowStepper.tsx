import { AlertTriangle, Check, X } from "lucide-react";

import { cn } from "@/lib/cn";
import type { ApplicationStatus, PipelineStage } from "@/types/domain";

/** Statuses that are a detour off the happy path rather than a stage on it. */
const OFF_PATH: Partial<Record<ApplicationStatus, { label: string; tone: "warning" | "danger" }>> = {
  documents_required: { label: "Documents required", tone: "warning" },
  documents_submitted: { label: "Documents submitted", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "danger" },
};

/**
 * Where an application has reached, and what is left.
 *
 * The stages come from the backend's own pipeline so this can never show an
 * order the workflow would not actually allow.
 */
export function WorkflowStepper({
  pipeline,
  status,
}: {
  pipeline: PipelineStage[];
  status: ApplicationStatus;
}) {
  const detour = OFF_PATH[status];

  if (pipeline.length === 0) return null;

  const currentIndex = pipeline.findIndex((stage) => stage.state === "current");
  const doneCount = pipeline.filter((stage) => stage.state === "done").length;
  // A detoured application has no current stage, so the track follows how
  // far it actually got rather than collapsing to zero.
  const reached = currentIndex < 0 ? doneCount : currentIndex;
  const percent = Math.round((reached / (pipeline.length - 1)) * 100);

  return (
    <div className="mt-5">
      {detour && (
        <p
          className={cn(
            "mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
            detour.tone === "danger"
              ? "bg-danger-soft text-danger"
              : "bg-warning-soft text-warning",
          )}
        >
          {detour.tone === "danger" ? (
            <X className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span>
            <span className="font-medium">{detour.label}.</span>{" "}
            {detour.tone === "danger"
              ? "This application is off the normal workflow."
              : "Waiting on the customer before the next stage."}
          </span>
        </p>
      )}

      {/* A single track behind the markers reads as progress at a glance;
          the per-stage labels below carry the detail. */}
      <div className="relative">
        <div className="absolute left-0 right-0 top-3.5 h-0.5 bg-ink-200" aria-hidden />
        <div
          className="absolute left-0 top-3.5 h-0.5 bg-brand-600 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
          aria-hidden
        />

        <ol className="scroll-slim relative flex gap-1 overflow-x-auto pb-1">
          {pipeline.map((stage) => {
            const isDone = stage.state === "done";
            const isCurrent = stage.state === "current";

            return (
              <li
                key={stage.value}
                className="flex min-w-24 flex-1 flex-col items-center gap-1.5 text-center"
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ring-4 ring-white",
                    isDone
                      ? "bg-brand-600 text-white"
                      : isCurrent
                        ? detour
                          ? "bg-warning text-white"
                          : "bg-brand-600 text-white ring-brand-100"
                        : "bg-ink-200 text-ink-500",
                  )}
                >
                  {isDone ? <Check className="size-3.5" aria-hidden /> : null}
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-tight",
                    isCurrent
                      ? "font-semibold text-ink-900"
                      : isDone
                        ? "font-medium text-ink-600"
                        : "text-ink-400",
                  )}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

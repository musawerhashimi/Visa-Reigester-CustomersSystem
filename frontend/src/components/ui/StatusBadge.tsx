import { cn } from "@/lib/cn";
import type { ApplicationStatus, DocumentStatus, Priority } from "@/types/domain";

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  info: "bg-info-soft text-info ring-info/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  success: "bg-success-soft text-success ring-success/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
};

/** Where each application status sits on the neutral→success→danger scale. */
const APPLICATION_TONES: Record<ApplicationStatus, Tone> = {
  draft: "neutral",
  submitted: "info",
  received: "info",
  under_review: "info",
  documents_required: "warning",
  documents_submitted: "info",
  verification: "brand",
  verified: "brand",
  processing: "brand",
  submitted_to_authority: "brand",
  decision_pending: "warning",
  approved: "success",
  completed: "success",
  rejected: "danger",
  cancelled: "neutral",
  withdrawn: "neutral",
};

const DOCUMENT_TONES: Record<DocumentStatus, Tone> = {
  pending: "warning",
  verified: "success",
  rejected: "danger",
  resubmit_required: "warning",
};

const PRIORITY_TONES: Record<Priority, Tone> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

function humanize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface BadgeProps {
  label?: string;
  tone?: Tone;
  className?: string;
  /** Show a leading dot — useful in dense tables where colour alone is subtle. */
  dot?: boolean;
}

export function Badge({ label, tone = "neutral", className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1",
        "text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}

export function ApplicationStatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <Badge
      dot
      label={humanize(status)}
      tone={APPLICATION_TONES[status] ?? "neutral"}
      className={className}
    />
  );
}

export function DocumentStatusBadge({
  status,
  className,
}: {
  status: DocumentStatus;
  className?: string;
}) {
  return (
    <Badge
      dot
      label={humanize(status)}
      tone={DOCUMENT_TONES[status] ?? "neutral"}
      className={className}
    />
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  return (
    <Badge
      dot
      label={humanize(priority)}
      tone={PRIORITY_TONES[priority] ?? "neutral"}
      className={className}
    />
  );
}

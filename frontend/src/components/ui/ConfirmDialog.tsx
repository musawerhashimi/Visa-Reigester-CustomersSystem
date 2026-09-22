import { AlertTriangle, X } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * A blocking confirmation for actions that cannot be undone.
 *
 * `window.confirm` froze the whole tab, could not carry the server's reason
 * for refusing, and is suppressed outright by some browsers when it fires
 * from a handler they consider untrusted — so a delete could silently do
 * nothing. This stays on screen through the request and reports the outcome
 * in place.
 */

type Tone = "danger" | "primary";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The consequence, spelled out — not a restatement of the title. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  /** Shown inside the dialog when the action was attempted and refused. */
  error?: string | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  error,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Focus goes back where it came from, so dismissing the dialog does not
  // drop the caret at the top of the page.
  const opener = useRef<Element | null>(null);

  // A request in flight must finish or fail on its own; Escape and the
  // backdrop stop closing the dialog underneath it.
  const dismiss = useCallback(() => {
    if (!loading) onCancel();
  }, [loading, onCancel]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    confirmRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;

      // Trap the tab ring inside the panel: everything behind it is inert.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, dismiss]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center">
      <div
        onClick={dismiss}
        aria-hidden
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px] animate-fade-in"
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-body" : undefined}
        className={cn(
          "relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl",
          "ring-1 ring-ink-900/5 animate-dialog-in",
        )}
      >
        <button
          type="button"
          onClick={dismiss}
          disabled={loading}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-40"
        >
          <X className="size-4" aria-hidden />
        </button>

        <div className="flex gap-4">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl",
              tone === "danger"
                ? "bg-danger-soft text-danger"
                : "bg-brand-50 text-brand-700",
            )}
          >
            <AlertTriangle className="size-5" aria-hidden />
          </span>

          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="confirm-dialog-title"
              className="pr-6 font-display text-base font-semibold text-ink-900"
            >
              {title}
            </h2>
            {description && (
              <div
                id="confirm-dialog-body"
                className="mt-1.5 text-sm leading-relaxed text-ink-500"
              >
                {description}
              </div>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={dismiss} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

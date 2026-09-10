import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white shadow-subtle hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300",
  accent:
    "bg-accent-500 text-brand-950 shadow-subtle hover:bg-accent-400 active:bg-accent-600 disabled:bg-accent-500/50",
  secondary:
    "bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200 disabled:text-brand-400",
  outline:
    "border border-ink-300 bg-white text-ink-800 shadow-subtle hover:border-ink-400 hover:bg-ink-50 active:bg-ink-100",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200",
  danger:
    "bg-danger text-white shadow-subtle hover:brightness-95 active:brightness-90 disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2.5 px-6 text-[15px]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    fullWidth,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button stays focusable but rejects input, so a slow submit
      // cannot be double-fired.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});

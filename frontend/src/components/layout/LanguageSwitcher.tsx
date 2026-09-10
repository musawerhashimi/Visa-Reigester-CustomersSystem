import { Check, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LANGUAGE_LABELS, activeContentLanguage } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { CONTENT_LANGUAGES, type ContentLanguage } from "@/types/domain";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = activeContentLanguage();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(language: ContentLanguage) {
    void i18n.changeLanguage(language);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
          "text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900",
        )}
      >
        <Globe className="size-4" aria-hidden />
        <span className="uppercase">{current}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className={cn(
            "absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-ink-200",
            "bg-white p-1 shadow-lifted",
          )}
        >
          {CONTENT_LANGUAGES.map((language) => (
            <li key={language}>
              <button
                type="button"
                role="option"
                aria-selected={language === current}
                onClick={() => choose(language)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
                  "transition-colors hover:bg-ink-100",
                  language === current
                    ? "font-medium text-brand-700"
                    : "text-ink-700",
                )}
              >
                {LANGUAGE_LABELS[language]}
                {language === current && <Check className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

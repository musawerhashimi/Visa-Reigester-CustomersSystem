import { useId, useState } from "react";

import { cn } from "@/lib/cn";
import { LANGUAGE_LABELS } from "@/lib/i18n";
import { CONTENT_LANGUAGES, type ContentLanguage, type Translated } from "@/types/domain";

interface TranslatedInputProps {
  label: string;
  value: Translated | undefined;
  onChange: (value: Translated) => void;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
  hint?: string;
  error?: string;
}

const EMPTY: Translated = { en: "", de: "", tr: "" };

/**
 * One field, three languages, edited through tabs.
 *
 * Tabs rather than three stacked boxes: a long form with every field tripled
 * is unreadable, and editors work in one language at a time. Each tab shows a
 * dot when its language is still empty, so nothing is silently forgotten.
 */
export function TranslatedInput({
  label,
  value,
  onChange,
  multiline = false,
  rows = 4,
  required = false,
  hint,
  error,
}: TranslatedInputProps) {
  const [active, setActive] = useState<ContentLanguage>("en");
  const id = useId();
  const current = { ...EMPTY, ...(value ?? {}) };

  function update(language: ContentLanguage, text: string) {
    onChange({ ...current, [language]: text });
  }

  const InputTag = multiline ? "textarea" : "input";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${id}-${active}`} className="text-sm font-medium text-ink-700">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>

        <div role="tablist" aria-label={`${label} language`} className="flex gap-0.5">
          {CONTENT_LANGUAGES.map((language) => {
            const filled = Boolean(current[language]?.trim());
            return (
              <button
                key={language}
                type="button"
                role="tab"
                aria-selected={active === language}
                onClick={() => setActive(language)}
                title={LANGUAGE_LABELS[language]}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium uppercase transition-colors",
                  active === language
                    ? "bg-brand-100 text-brand-700"
                    : "text-ink-500 hover:bg-ink-100 hover:text-ink-800",
                )}
              >
                {language}
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    filled ? "bg-success" : "bg-ink-300",
                  )}
                  aria-hidden
                />
                <span className="sr-only">
                  {filled ? "translated" : "not translated"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <InputTag
        id={`${id}-${active}`}
        // Remounting per language would lose the caret; keying on the active
        // language is what makes each tab feel like its own field.
        key={active}
        rows={multiline ? rows : undefined}
        value={current[active] ?? ""}
        onChange={(event) => update(active, event.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink-900",
          "placeholder:text-ink-400 focus:outline-none focus:ring-2",
          error
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-ink-300 focus:border-brand-500 focus:ring-brand-500/20",
        )}
        placeholder={
          active === "en"
            ? "Required — other languages fall back to this"
            : `${LANGUAGE_LABELS[active]} translation`
        }
      />

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

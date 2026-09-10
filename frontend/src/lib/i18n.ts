import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import de from "@/locales/de/common.json";
import en from "@/locales/en/common.json";
import tr from "@/locales/tr/common.json";

import { CONTENT_LANGUAGES, type ContentLanguage, type Translated } from "@/types/domain";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      de: { common: de },
      tr: { common: tr },
    },
    fallbackLng: "en",
    supportedLngs: CONTENT_LANGUAGES,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "visacrm.language",
      caches: ["localStorage"],
    },
  });

export default i18n;

export const LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  en: "English",
  de: "Deutsch",
  tr: "Türkçe",
};

/** Narrow i18next's arbitrary language string to one we ship content for. */
export function activeContentLanguage(): ContentLanguage {
  const base = i18n.resolvedLanguage?.split("-")[0];
  return CONTENT_LANGUAGES.includes(base as ContentLanguage)
    ? (base as ContentLanguage)
    : "en";
}

/**
 * Read a translated value from the API, falling back to English when the CMS
 * has not filled in the active language yet.
 */
export function translate(
  value: Translated | string | null | undefined,
  language?: ContentLanguage,
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[language ?? activeContentLanguage()] || value.en || "";
}

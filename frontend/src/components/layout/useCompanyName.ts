import { useCompanyInfo } from "@/lib/cms";
import { translate } from "@/lib/i18n";

/** Shown until the request lands, or if nothing is configured in the MIS. */
export const FALLBACK_COMPANY_NAME = "VisaCare";

/**
 * The company name as set in the MIS, for running text such as a copyright
 * line. Translated, so each language can carry its own.
 */
export function useCompanyName() {
  const { data } = useCompanyInfo();
  return translate(data?.name) || FALLBACK_COMPANY_NAME;
}

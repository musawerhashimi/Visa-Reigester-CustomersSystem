import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, Download, Receipt as ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import type { OfficialDocument, Paginated, Payment } from "@/types/domain";

/**
 * Receipts and official documents the customer may download.
 *
 * The endpoints already hide anything not released to them, so this renders
 * whatever comes back and hides itself entirely when there is nothing.
 */
export function CustomerDownloads({ applicationId }: { applicationId: number }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const payments = useQuery({
    queryKey: ["portal", "payments", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Payment>>("/payments/", {
        params: { application: applicationId },
      });
      return data.results;
    },
  });

  const documents = useQuery({
    queryKey: ["portal", "official-documents", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<OfficialDocument>>(
        "/official-documents/",
        { params: { application: applicationId } },
      );
      return data.results;
    },
  });

  const receipts = (payments.data ?? []).filter((payment) => payment.receipt);
  const officialDocuments = documents.data ?? [];

  if (receipts.length === 0 && officialDocuments.length === 0) return null;

  async function download(url: string, filename: string) {
    try {
      await downloadFile(url, filename);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not download the file."));
    }
  }

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-ink-200 px-5 py-4">
        <h2 className="text-sm font-semibold">{t("portal.downloads")}</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Receipts and documents issued for this application.
        </p>
      </header>

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="divide-y divide-ink-100">
        {officialDocuments.map((document) => (
          <li key={`doc-${document.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
              <Award className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">
                {document.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {format(new Date(document.created_at), "d MMMM yyyy")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => download(document.download_url, `${document.title}.pdf`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
            >
              <Download className="size-4" aria-hidden />
              PDF
            </button>
          </li>
        ))}

        {receipts.map((payment) => (
          <li key={`rcpt-${payment.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <ReceiptIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="tabular truncate text-sm font-medium text-ink-900">
                {payment.receipt!.receipt_number}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {payment.amount} {payment.currency} ·{" "}
                {format(new Date(payment.paid_at), "d MMMM yyyy")}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                download(
                  payment.receipt!.download_url,
                  `${payment.receipt!.receipt_number}.pdf`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
            >
              <Download className="size-4" aria-hidden />
              PDF
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

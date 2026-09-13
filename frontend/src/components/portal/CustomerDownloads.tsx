import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, Download, Receipt as ReceiptIcon } from "lucide-react";
import { useState } from "react";

import { api, apiErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import type { OfficialDocument, Paginated, Payment } from "@/types/domain";

/** Plain-language names for what each document actually is. */
const KIND_LABELS: Record<OfficialDocument["kind"], string> = {
  approval: "Your visa approval",
  verification: "Proof your documents were checked",
  other: "Document from our office",
};

/**
 * Files the office has issued to this customer.
 *
 * Written for someone who has never used the site: the heading says these
 * are files for them to keep, each row says what the file is in ordinary
 * words, and the button says what pressing it does.
 */
export function CustomerDownloads({ applicationId }: { applicationId: number }) {
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

  const isEmpty = receipts.length === 0 && officialDocuments.length === 0;

  async function download(url: string, filename: string) {
    try {
      await downloadFile(url, filename);
    } catch (err) {
      setError(apiErrorMessage(err, "The file could not be saved. Please try again."));
    }
  }

  return (
    <section>
      <header className="border-b border-ink-200 px-5 py-4">
        <h2 className="text-sm font-semibold">Your files</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Our office has sent you these. Press Save to keep a copy on your
          phone or computer. They stay here, so you can come back any time.
        </p>
      </header>

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isEmpty && (
        <p className="px-5 py-10 text-center text-sm text-ink-500">
          Nothing here yet. When our office sends you a document or a receipt,
          it will appear here.
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
                {KIND_LABELS[document.kind] ?? document.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                Sent {format(new Date(document.created_at), "d MMMM yyyy")}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                // The stored name carries the real extension; a scan must
                // not be saved as ".pdf".
                download(
                  document.download_url,
                  document.filename || `${document.title}.pdf`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
            >
              <Download className="size-4" aria-hidden />
              Save
            </button>
          </li>
        ))}

        {receipts.map((payment) => (
          <li key={`rcpt-${payment.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <ReceiptIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">
                Receipt for your payment
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {payment.amount} {payment.currency} paid on{" "}
                {format(new Date(payment.paid_at), "d MMMM yyyy")} · No.{" "}
                <span className="tabular">{payment.receipt!.receipt_number}</span>
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
              Save
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

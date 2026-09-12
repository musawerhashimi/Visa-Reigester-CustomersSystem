import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, FileText, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { DocumentStatusBadge } from "@/components/ui/StatusBadge";
import { api, apiErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { translate } from "@/lib/i18n";
import type { AppDocument, DocumentStatus, Paginated } from "@/types/domain";

/** A document as the flat queue returns it, with its application attached. */
interface QueueDocument extends AppDocument {
  application: number;
  application_number: string;
  customer_name: string;
}

const STATUSES: { value: DocumentStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "resubmit_required", label: "Resubmit required" },
];

export default function Documents() {
  const [status, setStatus] = useState<DocumentStatus | "">("pending");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mis", "documents", { status, page }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<QueueDocument>>("/documents/", {
        params: { status: status || undefined, page },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  async function download(doc: QueueDocument) {
    setError(null);
    try {
      await downloadFile(
        `/documents/${doc.id}/download/`,
        doc.original_filename || "document",
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Could not download the document."));
    }
  }

  const rows = data?.results ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Documents</h1>
        <p className="mt-1 text-sm text-ink-500">
          Everything uploaded across applications. Review happens on the
          application itself.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setStatus(item.value);
                setPage(1);
              }}
              aria-pressed={status === item.value}
              className={
                status === item.value
                  ? "rounded-full bg-brand-700 px-3.5 py-1.5 text-sm font-medium text-white"
                  : "rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-ink-600 ring-1 ring-inset ring-ink-200 transition-colors hover:bg-ink-50"
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading && (
          <p className="px-5 py-16 text-center text-sm text-ink-500">Loading…</p>
        )}

        {isError && (
          <p className="px-5 py-16 text-center text-sm text-danger">
            Could not load documents.
          </p>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
              <FolderOpen className="size-6" aria-hidden />
            </span>
            <p className="mt-4 text-sm text-ink-500">
              Nothing here — no documents with this status.
            </p>
          </div>
        )}

        <ul className="divide-y divide-ink-100">
          {rows.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500">
                <FileText className="size-5" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">
                  {translate(doc.document_type.name)}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {doc.original_filename} ·{" "}
                  {format(new Date(doc.created_at), "d MMM yyyy")}
                </p>
                {doc.rejection_reason && (
                  <p className="mt-1.5 text-xs text-danger">{doc.rejection_reason}</p>
                )}
              </div>

              <Link
                to={`/mis/applications/${doc.application}`}
                className="tabular text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                {doc.application_number}
              </Link>

              <DocumentStatusBadge status={doc.status} />

              <button
                type="button"
                onClick={() => void download(doc)}
                aria-label={`Download ${doc.original_filename}`}
                className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
              >
                <Download className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        {(data?.next || data?.previous) && (
          <div className="flex items-center justify-between border-t border-ink-200 px-4 py-3">
            <p className="text-xs text-ink-500">Page {page}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={!data?.previous}
                className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => value + 1)}
                disabled={!data?.next}
                className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

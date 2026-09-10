import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Download, FileText, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { DocumentStatusBadge } from "@/components/ui/StatusBadge";
import { api, apiErrorMessage } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type { AppDocument } from "@/types/domain";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentReviewList({
  documents,
  applicationId,
}: {
  documents: AppDocument[];
  applicationId: number;
}) {
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);
  const canVerify = hasPermission("documents.verify");
  const canReject = hasPermission("documents.reject");

  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["mis", "application", applicationId] });

  const verify = useMutation({
    mutationFn: (id: number) => api.post(`/documents/${id}/verify/`),
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not verify the document.")),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/documents/${id}/reject/`, { reason }),
    onSuccess: () => {
      setRejectingId(null);
      setReason("");
      setError(null);
      void refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not reject the document.")),
  });

  async function download(doc: AppDocument) {
    // The file is permission-checked server-side, so it needs the auth header;
    // a plain link would arrive unauthenticated.
    try {
      const response = await api.get(`/documents/${doc.id}/download/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.original_filename || "document";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not download the document."));
    }
  }

  if (documents.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-ink-500">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="divide-y divide-ink-100">
        {documents.map((doc) => (
          <li key={doc.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500">
                <FileText className="size-5" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">
                  {translate(doc.document_type.name)}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {doc.original_filename} · {formatSize(doc.size_bytes)} ·{" "}
                  {format(new Date(doc.created_at), "d MMM yyyy, HH:mm")}
                </p>

                {doc.status === "rejected" && doc.rejection_reason && (
                  <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                    <span className="font-medium">Rejected:</span> {doc.rejection_reason}
                  </p>
                )}

                {doc.status === "verified" && doc.verified_by_name && (
                  <p className="mt-1 text-xs text-ink-400">
                    Verified by {doc.verified_by_name}
                    {doc.verified_at &&
                      ` on ${format(new Date(doc.verified_at), "d MMM yyyy")}`}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <DocumentStatusBadge status={doc.status} />
                <button
                  type="button"
                  onClick={() => void download(doc)}
                  aria-label={`Download ${doc.original_filename}`}
                  className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
                >
                  <Download className="size-4" />
                </button>
              </div>
            </div>

            {/* Review actions. A verified document can still be rejected later
                if something is spotted, so both stay available. */}
            {(canVerify || canReject) && rejectingId !== doc.id && (
              <div className="mt-3 flex gap-2 pl-13">
                {canVerify && doc.status !== "verified" && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Check className="size-3.5" />}
                    loading={verify.isPending && verify.variables === doc.id}
                    onClick={() => verify.mutate(doc.id)}
                  >
                    Verify
                  </Button>
                )}
                {canReject && doc.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<X className="size-3.5" />}
                    onClick={() => {
                      setRejectingId(doc.id);
                      setReason("");
                    }}
                  >
                    Reject
                  </Button>
                )}
              </div>
            )}

            {rejectingId === doc.id && (
              <form
                className="mt-3 space-y-2 rounded-lg bg-ink-50 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  reject.mutate({ id: doc.id, reason });
                }}
              >
                <label
                  htmlFor={`reason-${doc.id}`}
                  className="block text-xs font-medium text-ink-700"
                >
                  Reason for rejection — the customer sees this
                </label>
                <textarea
                  id={`reason-${doc.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  required
                  placeholder="e.g. The passport image is unclear."
                  className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    variant="danger"
                    loading={reject.isPending}
                    disabled={!reason.trim()}
                  >
                    Confirm rejection
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setRejectingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

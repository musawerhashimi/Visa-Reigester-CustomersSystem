import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Mail, Paperclip } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/StatusBadge";
import { api, apiErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import type { EmailLog, Paginated } from "@/types/domain";

/** Everything sent about one application (section 47). */
export function EmailHistory({ applicationId }: { applicationId: number }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mis", "emails", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<EmailLog>>("/emails/", {
        params: { application: applicationId, page_size: 50 },
      });
      return data.results;
    },
  });

  const rows = data ?? [];

  async function download(url: string, filename: string) {
    try {
      await downloadFile(url, filename);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not download the attachment."));
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isLoading && (
        <p className="px-5 py-10 text-center text-sm text-ink-500">Loading…</p>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="px-5 py-12 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-ink-100 text-ink-400">
            <Mail className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm text-ink-500">Nothing sent yet.</p>
        </div>
      )}

      <ul className="divide-y divide-ink-100">
        {rows.map((email) => {
          const isOpen = expanded === email.id;
          return (
            <li key={email.id}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : email.id)}
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-ink-50"
              >
                <span
                  className={
                    email.status === "failed"
                      ? "grid size-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger"
                      : "grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"
                  }
                >
                  {email.status === "failed" ? (
                    <AlertTriangle className="size-4" aria-hidden />
                  ) : (
                    <Mail className="size-4" aria-hidden />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {email.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    To {email.to_email} ·{" "}
                    {format(new Date(email.created_at), "d MMM yyyy, HH:mm")}
                    {email.sent_by_name && ` · ${email.sent_by_name}`}
                  </p>
                </div>

                {email.attachments.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                    <Paperclip className="size-3.5" aria-hidden />
                    {email.attachments.length}
                  </span>
                )}

                <Badge
                  dot
                  tone={
                    email.status === "sent"
                      ? "success"
                      : email.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                  label={email.status}
                />

                <Badge
                  tone={email.is_automatic ? "neutral" : "brand"}
                  label={email.is_automatic ? "Automatic" : "Manual"}
                />
              </button>

              {isOpen && (
                <div className="border-t border-ink-100 bg-ink-50 px-5 py-4">
                  {email.error_message && (
                    <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                      {email.error_message}
                    </p>
                  )}

                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">
                    {email.body}
                  </pre>

                  {email.attachments.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {email.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <button
                            type="button"
                            onClick={() =>
                              download(
                                attachment.download_url,
                                attachment.original_filename,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100"
                          >
                            <Paperclip className="size-3.5" aria-hidden />
                            {attachment.original_filename}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

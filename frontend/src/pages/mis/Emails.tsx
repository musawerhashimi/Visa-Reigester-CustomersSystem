import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Mail, Paperclip, Pencil, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/stores/auth";
import type { EmailLog, EmailTemplate, Paginated } from "@/types/domain";

type Tab = "history" | "templates";

export default function Emails() {
  const [tab, setTab] = useState<Tab>("history");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Emails</h1>
        <p className="mt-1 text-sm text-ink-500">
          Everything the system has sent, and the templates behind it.
        </p>
      </header>

      <div className="card overflow-hidden">
        <div role="tablist" className="flex gap-1 border-b border-ink-200 px-3 pt-3">
          {(
            [
              { key: "history", label: "Sent history" },
              { key: "templates", label: "Templates" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={
                tab === item.key
                  ? "-mb-px border-b-2 border-brand-600 px-3.5 py-2.5 text-sm font-medium text-brand-700"
                  : "-mb-px border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "history" ? <SentHistory /> : <Templates />}
      </div>
    </div>
  );
}

function SentHistory() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mis", "email-history", { search, page }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<EmailLog>>("/emails/", {
        params: { search: search || undefined, page },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  async function download(url: string, filename: string) {
    setError(null);
    try {
      await downloadFile(url, filename);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not download the attachment."));
    }
  }

  const rows = data?.results ?? [];

  return (
    <div>
      <div className="border-b border-ink-100 p-4">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by recipient or subject…"
            aria-label="Search sent emails"
            className="w-full rounded-lg border border-ink-300 py-2.5 pl-10 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isLoading && (
        <p className="px-5 py-16 text-center text-sm text-ink-500">Loading…</p>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="px-5 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
            <Mail className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-sm text-ink-500">Nothing sent yet.</p>
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

                {email.application_number && (
                  <Link
                    to={`/mis/applications/${email.application}`}
                    onClick={(event) => event.stopPropagation()}
                    className="tabular text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    {email.application_number}
                  </Link>
                )}

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
  );
}

function Templates() {
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);
  const canManage = hasPermission("emails.templates.manage");
  const { toast } = useToast();

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mis", "email-templates"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<EmailTemplate>>("/email-templates/", {
        params: { page_size: 100 },
      });
      return data.results;
    },
  });

  const save = useMutation({
    mutationFn: (template: EmailTemplate) =>
      api.patch(`/email-templates/${template.id}/`, {
        name: template.name,
        subject: template.subject,
        body: template.body,
        is_active: template.is_active,
      }),
    onSuccess: () => {
      setError(null);
      // Closing the editor returns you to the template list; the toast is what
      // reports the save from there.
      setEditing(null);
      toast("Template saved.");
      void queryClient.invalidateQueries({ queryKey: ["mis", "email-templates"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not save the template.")),
  });

  if (isLoading) {
    return <p className="px-5 py-16 text-center text-sm text-ink-500">Loading…</p>;
  }

  if (editing) {
    return (
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(editing);
        }}
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <Field
          label="Name"
          required
          value={editing.name}
          onChange={(event) =>
            setEditing({ ...editing, name: event.target.value })
          }
        />
        <Field
          label="Subject"
          required
          value={editing.subject}
          onChange={(event) =>
            setEditing({ ...editing, subject: event.target.value })
          }
        />

        <div className="space-y-1.5">
          <label htmlFor="template-body" className="block text-sm font-medium text-ink-700">
            Body
          </label>
          <textarea
            id="template-body"
            rows={12}
            value={editing.body}
            onChange={(event) =>
              setEditing({ ...editing, body: event.target.value })
            }
            className="w-full rounded-lg border border-ink-300 px-3 py-2.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="rounded-lg bg-ink-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Available placeholders
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {editing.available_variables.map((variable) => (
              <code
                key={variable}
                className="rounded bg-white px-2 py-1 text-xs text-brand-700 ring-1 ring-inset ring-ink-200"
              >
                {`{{${variable}}}`}
              </code>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={editing.is_active}
            onChange={(event) =>
              setEditing({ ...editing, is_active: event.target.checked })
            }
            className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
          />
          Active — send this automatically on its trigger
        </label>

        <div className="flex gap-2 border-t border-ink-200 pt-4">
          <Button type="submit" loading={save.isPending}>
            Save template
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-ink-100">
        {data?.map((template) => (
          <li key={template.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">{template.name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-500">
                {template.subject}
              </p>
            </div>

            <Badge
              tone={template.trigger === "manual" ? "neutral" : "brand"}
              label={template.trigger === "manual" ? "Manual" : "Automatic"}
            />
            <Badge
              dot
              tone={template.is_active ? "success" : "neutral"}
              label={template.is_active ? "Active" : "Inactive"}
            />

            {canManage && (
              <Button
                size="sm"
                variant="outline"
                icon={<Pencil className="size-3.5" />}
                onClick={() => setEditing(template)}
              >
                Edit
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Inbox, Mail, Reply } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import type { Paginated } from "@/types/domain";

type ContactStatus = "new" | "read" | "replied" | "archived";

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: ContactStatus;
  reply_body: string;
  replied_at: string | null;
  created_at: string;
}

const STATUSES: { value: ContactStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "read", label: "Read" },
  { value: "replied", label: "Replied" },
  { value: "archived", label: "Archived" },
];

const TONES: Record<ContactStatus, "info" | "neutral" | "success"> = {
  new: "info",
  read: "neutral",
  replied: "success",
  archived: "neutral",
};

/**
 * Contact inbox: what customers sent through the public contact form.
 *
 * Replying sends a real email and marks the message replied, so the thread
 * lives here rather than in somebody's personal mailbox.
 */
export default function Contact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasPermission = useAuth((state) => state.hasPermission);
  const canManage = hasPermission("cms.contact.manage");

  const [status, setStatus] = useState<ContactStatus | "">("");
  const [page, setPage] = useState(1);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mis", "contact", { status, page }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ContactMessage>>("/cms/contact-messages/", {
        params: { status: status || undefined, page },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const reply = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      api.post(`/cms/contact-messages/${id}/reply/`, { body: text }),
    onSuccess: () => {
      setError(null);
      setReplyingTo(null);
      setBody("");
      toast("Reply sent.");
      void queryClient.invalidateQueries({ queryKey: ["mis", "contact"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not send the reply.")),
  });

  const rows = data?.results ?? [];

  if (!canManage) {
    return (
      <p className="py-16 text-center text-sm text-ink-500">
        You do not have permission to read contact messages.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Contact messages</h1>
        <p className="mt-1 text-sm text-ink-500">
          Enquiries sent through the website's contact form. Replying emails the
          sender and marks the message replied.
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
            Could not load contact messages.
          </p>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
              <Inbox className="size-6" aria-hidden />
            </span>
            <p className="mt-4 text-sm text-ink-500">
              Nothing here — no messages with this status.
            </p>
          </div>
        )}

        <ul className="divide-y divide-ink-100">
          {rows.map((item) => (
            <li key={item.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500">
                  <Mail className="size-5" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {item.subject || "No subject"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {item.name} · {item.email}
                    {item.phone && ` · ${item.phone}`} ·{" "}
                    {format(new Date(item.created_at), "d MMM yyyy")}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink-700">
                    {item.message}
                  </p>

                  {item.reply_body && (
                    <div className="mt-3 rounded-lg bg-ink-50 p-3">
                      <p className="text-xs font-medium text-ink-500">
                        Replied
                        {item.replied_at &&
                          ` ${format(new Date(item.replied_at), "d MMM yyyy")}`}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-ink-700">
                        {item.reply_body}
                      </p>
                    </div>
                  )}

                  {replyingTo === item.id && (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        reply.mutate({ id: item.id, text: body });
                      }}
                    >
                      <label htmlFor={`reply-${item.id}`} className="sr-only">
                        Reply to {item.name}
                      </label>
                      <textarea
                        id={`reply-${item.id}`}
                        rows={4}
                        autoFocus
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder={`Reply to ${item.name}…`}
                        className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          loading={reply.isPending}
                          disabled={!body.trim()}
                        >
                          Send reply
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReplyingTo(null);
                            setBody("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </div>

                <Badge dot tone={TONES[item.status]} label={item.status} />

                {replyingTo !== item.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Reply className="size-3.5" />}
                    onClick={() => {
                      setReplyingTo(item.id);
                      setBody("");
                      setError(null);
                    }}
                  >
                    {item.reply_body ? "Reply again" : "Reply"}
                  </Button>
                )}
              </div>
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

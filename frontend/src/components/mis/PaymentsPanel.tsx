import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, Download, FileText, Plus, Receipt as ReceiptIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/stores/auth";
import type {
  ApplicationDetail,
  OfficialDocument,
  Paginated,
  Payment,
} from "@/types/domain";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;

export function PaymentsPanel({
  application,
}: {
  application: ApplicationDetail;
}) {
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);
  const canManage = hasPermission("payments.manage");
  const canIssue = hasPermission("receipts.generate");

  const [error, setError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<"verification" | "approval" | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    currency: "EUR",
    method: "cash",
    reference: "",
    note: "",
  });

  const payments = useQuery({
    queryKey: ["mis", "payments", application.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Payment>>("/payments/", {
        params: { application: application.id },
      });
      return data.results;
    },
  });

  const documents = useQuery({
    queryKey: ["mis", "official-documents", application.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<OfficialDocument>>(
        "/official-documents/",
        { params: { application: application.id } },
      );
      return data.results;
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["mis", "payments", application.id] });
    void queryClient.invalidateQueries({
      queryKey: ["mis", "official-documents", application.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["mis", "application", application.id] });
  };

  const record = useMutation({
    mutationFn: () =>
      api.post("/payments/record/", {
        application: application.id,
        amount: form.amount,
        currency: form.currency,
        method: form.method,
        reference: form.reference,
        note: form.note,
      }),
    onSuccess: () => {
      setError(null);
      setShowForm(false);
      setForm({ amount: "", currency: "EUR", method: "cash", reference: "", note: "" });
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not record the payment.")),
  });

  const issue = useMutation({
    mutationFn: async ({
      kind,
      file,
      title,
    }: {
      kind: "verification" | "approval";
      file?: File | null;
      title?: string;
    }) => {
      // With a real visa or letter to attach the request has to be
      // multipart; without one the server generates its own PDF.
      if (!file) {
        await api.post("/official-documents/issue/", {
          application: application.id,
          kind,
          title,
        });
        return;
      }
      const body = new FormData();
      body.append("application", String(application.id));
      body.append("kind", kind);
      if (title) body.append("title", title);
      body.append("file", file);
      await api.post("/official-documents/issue/", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      setError(null);
      setAttaching(null);
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not issue the document.")),
  });

  async function download(url: string, filename: string) {
    try {
      await downloadFile(url, filename);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not download the file."));
    }
  }

  const isApproved =
    application.status === "approved" || application.status === "completed";
  const isVerified = application.verified_at !== null;

  return (
    <div className="space-y-6 p-5">
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <section>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Payments</h3>
          {canManage && !showForm && (
            <Button
              size="sm"
              variant="outline"
              icon={<Plus className="size-3.5" />}
              onClick={() => setShowForm(true)}
            >
              Record payment
            </Button>
          )}
        </header>

        <p className="mt-1 text-xs text-ink-500">
          Payments are taken at the office and recorded here; nothing is charged
          online.
        </p>

        {showForm && (
          <form
            className="mt-4 space-y-3 rounded-lg bg-ink-50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              record.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(event) =>
                  setForm((f) => ({ ...f, amount: event.target.value }))
                }
              />
              <Field
                label="Currency"
                value={form.currency}
                maxLength={3}
                onChange={(event) =>
                  setForm((f) => ({ ...f, currency: event.target.value.toUpperCase() }))
                }
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="payment-method"
                  className="block text-sm font-medium text-ink-700"
                >
                  Method
                </label>
                <select
                  id="payment-method"
                  value={form.method}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, method: event.target.value }))
                  }
                  className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Reference"
                hint="e.g. the counter receipt number"
                value={form.reference}
                onChange={(event) =>
                  setForm((f) => ({ ...f, reference: event.target.value }))
                }
              />
              <Field
                label="Note"
                value={form.note}
                onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                loading={record.isPending}
                disabled={!form.amount}
              >
                Record and issue receipt
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
          {payments.data?.length === 0 && (
            <li className="py-6 text-center text-sm text-ink-500">
              No payments recorded.
            </li>
          )}

          {payments.data?.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <ReceiptIcon className="size-4" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="tabular text-sm font-medium text-ink-900">
                  {payment.amount} {payment.currency}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {format(new Date(payment.paid_at), "d MMM yyyy")} ·{" "}
                  {payment.method.replace("_", " ")}
                  {payment.reference && ` · ${payment.reference}`}
                  {payment.recorded_by_name && ` · ${payment.recorded_by_name}`}
                </p>
              </div>

              <Badge
                dot
                tone={payment.status === "paid" ? "success" : "warning"}
                label={payment.status}
              />

              {payment.receipt && (
                <button
                  type="button"
                  onClick={() =>
                    download(
                      payment.receipt!.download_url,
                      `${payment.receipt!.receipt_number}.pdf`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
                >
                  <Download className="size-3.5" aria-hidden />
                  {payment.receipt.receipt_number}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-ink-200 pt-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Official documents</h3>
          {canIssue && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                icon={<FileText className="size-3.5" />}
                disabled={!isVerified}
                title={
                  isVerified
                    ? undefined
                    : "Available once the application has been verified"
                }
                onClick={() => setAttaching("verification")}
              >
                Verification
              </Button>
              <Button
                size="sm"
                variant="accent"
                icon={<Award className="size-3.5" />}
                disabled={!isApproved}
                title={
                  isApproved ? undefined : "Available once the application is approved"
                }
                onClick={() => setAttaching("approval")}
              >
                Approval
              </Button>
            </div>
          )}
        </header>

        <p className="mt-1 text-xs text-ink-500">
          Issuing a document emails it to the customer and publishes it to their
          portal.
        </p>

        {attaching && (
          <IssueForm
            kind={attaching}
            pending={issue.isPending}
            onCancel={() => setAttaching(null)}
            onSubmit={(file, title) => issue.mutate({ kind: attaching, file, title })}
          />
        )}

        <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
          {documents.data?.length === 0 && (
            <li className="py-6 text-center text-sm text-ink-500">
              No documents issued.
            </li>
          )}

          {documents.data?.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
                <Award className="size-4" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {document.title}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {format(new Date(document.created_at), "d MMM yyyy")}
                  {document.generated_by_name && ` · ${document.generated_by_name}`}
                </p>
              </div>

              {!document.is_available_to_customer && (
                <Badge tone="neutral" label="Not released" />
              )}

              <button
                type="button"
                onClick={() =>
                  download(document.download_url, `${document.title}.pdf`)
                }
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
              >
                <Download className="size-3.5" aria-hidden />
                Download
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Issuing an official document, with or without a file.
 *
 * The document the customer actually needs is usually a real one — the visa
 * sticker, an OIC, an authority letter — so attaching it is the default
 * path. Without a file the system falls back to generating its own letter.
 */
function IssueForm({
  kind,
  pending,
  onCancel,
  onSubmit,
}: {
  kind: "verification" | "approval";
  pending: boolean;
  onCancel: () => void;
  onSubmit: (file: File | null, title: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  const label = kind === "approval" ? "Approval" : "Verification";

  return (
    <form
      className="mt-4 space-y-4 rounded-xl border border-ink-200 bg-ink-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(file, title.trim());
      }}
    >
      <h4 className="text-sm font-semibold text-ink-900">Issue {label.toLowerCase()} document</h4>

      <div className="space-y-1.5">
        <label
          htmlFor="official-document-title"
          className="block text-sm font-medium text-ink-700"
        >
          Title
        </label>
        <input
          id="official-document-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`Application ${label.toLowerCase()}`}
          className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="official-document-file"
          className="block text-sm font-medium text-ink-700"
        >
          Attach the document
        </label>
        <input
          id="official-document-file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        <p className="text-xs text-ink-500">
          {file
            ? "This file is emailed to the customer and published to their portal."
            : "Optional — without a file the system generates a letter from the application."}
        </p>
      </div>

      <div className="flex gap-3">
        <Button type="submit" size="sm" loading={pending}>
          Issue and send
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

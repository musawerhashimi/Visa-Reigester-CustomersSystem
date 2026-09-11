import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Paperclip, Send, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import type {
  ApplicationDetail,
  EmailTemplate,
  OfficialDocument,
  Paginated,
  Payment,
} from "@/types/domain";

interface ComposerProps {
  application: ApplicationDetail;
  onSent?: () => void;
}

/**
 * Write a custom email against one application (section 30).
 *
 * A template can be loaded and then edited before sending, which is the
 * combination the specification asks for: automation with human control.
 */
export function EmailComposer({ application, onSent }: ComposerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    // The application's own contact address wins: a customer may apply on
    // behalf of someone else, and that is the address staff corresponded with.
    to_email: application.email || application.customer?.email || "",
    cc: "",
    subject: "",
    body: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [attachReceipts, setAttachReceipts] = useState<number[]>([]);
  const [attachDocuments, setAttachDocuments] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const templates = useQuery({
    queryKey: ["mis", "email-templates"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<EmailTemplate>>("/email-templates/", {
        params: { page_size: 100 },
      });
      return data.results;
    },
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

  const officialDocuments = useQuery({
    queryKey: ["mis", "official-documents", application.id],
    queryFn: async () => {
      const { data } = await api.get<Paginated<OfficialDocument>>(
        "/official-documents/",
        { params: { application: application.id } },
      );
      return data.results;
    },
  });

  const loadTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{
        subject: string;
        body: string;
        to_email: string;
      }>("/email-templates/preview/", {
        template: Number(id),
        application: application.id,
      });
      return data;
    },
    onSuccess: (data) => {
      // Fill the fields but leave them editable — the template is a starting
      // point, not a locked message.
      setForm((previous) => ({
        ...previous,
        subject: data.subject,
        body: data.body,
        to_email: data.to_email || previous.to_email,
      }));
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not load the template.")),
  });

  const send = useMutation({
    mutationFn: () => {
      const payload = new FormData();
      payload.append("application", String(application.id));
      payload.append("to_email", form.to_email);
      payload.append("cc", form.cc);
      payload.append("subject", form.subject);
      payload.append("body", form.body);
      if (templateId) payload.append("template", templateId);
      files.forEach((file) => payload.append("attachments", file));
      attachReceipts.forEach((id) => payload.append("attach_receipts", String(id)));
      attachDocuments.forEach((id) =>
        payload.append("attach_official_documents", String(id)),
      );
      return api.post("/emails/compose/", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      setError(null);
      setSent(true);
      setForm((previous) => ({ ...previous, subject: "", body: "", cc: "" }));
      setFiles([]);
      setAttachReceipts([]);
      setAttachDocuments([]);
      setTemplateId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["mis", "emails", application.id] });
      void queryClient.invalidateQueries({
        queryKey: ["mis", "application", application.id],
      });
      onSent?.();
      setTimeout(() => setSent(false), 3000);
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not send the message.")),
  });

  const receipts = (payments.data ?? []).filter((payment) => payment.receipt);
  const canSend = form.to_email && form.subject.trim() && form.body.trim();

  function toggle(list: number[], setList: (value: number[]) => void, id: number) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  return (
    <form
      className="space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate();
      }}
    >
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email-template" className="block text-sm font-medium text-ink-700">
          Start from a template
        </label>
        <div className="flex gap-2">
          <select
            id="email-template"
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value);
              if (event.target.value) loadTemplate.mutate(event.target.value);
            }}
            className="flex-1 rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">Write from scratch</option>
            {templates.data?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-ink-500">
          Loaded text can be edited before sending.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="To"
          type="email"
          required
          value={form.to_email}
          onChange={(event) =>
            setForm((f) => ({ ...f, to_email: event.target.value }))
          }
        />
        <Field
          label="Cc"
          hint="Separate several addresses with commas."
          value={form.cc}
          onChange={(event) => setForm((f) => ({ ...f, cc: event.target.value }))}
        />
      </div>

      <Field
        label="Subject"
        required
        value={form.subject}
        onChange={(event) => setForm((f) => ({ ...f, subject: event.target.value }))}
      />

      <div className="space-y-1.5">
        <label htmlFor="email-body" className="block text-sm font-medium text-ink-700">
          Message
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        </label>
        <textarea
          id="email-body"
          rows={10}
          required
          value={form.body}
          onChange={(event) => setForm((f) => ({ ...f, body: event.target.value }))}
          className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {(receipts.length > 0 || (officialDocuments.data?.length ?? 0) > 0) && (
        <fieldset className="rounded-lg bg-ink-50 p-4">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Attach from this application
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {officialDocuments.data?.map((document) => (
              <Chip
                key={`doc-${document.id}`}
                active={attachDocuments.includes(document.id)}
                onClick={() =>
                  toggle(attachDocuments, setAttachDocuments, document.id)
                }
              >
                <FileText className="size-3.5" aria-hidden />
                {document.title}
              </Chip>
            ))}
            {receipts.map((payment) => (
              <Chip
                key={`rcpt-${payment.id}`}
                active={attachReceipts.includes(payment.receipt!.id)}
                onClick={() =>
                  toggle(attachReceipts, setAttachReceipts, payment.receipt!.id)
                }
              >
                <FileText className="size-3.5" aria-hidden />
                {payment.receipt!.receipt_number}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-2">
        <label
          htmlFor="email-files"
          className="flex items-center gap-1.5 text-sm font-medium text-ink-700"
        >
          <Paperclip className="size-4" aria-hidden />
          Attach files
        </label>
        <input
          ref={fileInputRef}
          id="email-files"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          className="block w-full text-xs text-ink-500 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((file) => (
              <li
                key={file.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700"
              >
                {file.name}
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => {
                    setFiles((previous) =>
                      previous.filter((item) => item.name !== file.name),
                    );
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-brand-500 hover:text-brand-800"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-ink-200 pt-4">
        <Button
          type="submit"
          icon={<Send className="size-4" />}
          loading={send.isPending}
          disabled={!canSend}
        >
          Send email
        </Button>
        {sent && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" aria-hidden />
            Sent and recorded
          </span>
        )}
        <p className="ml-auto text-xs text-ink-500">
          Recorded in this application's history.
        </p>
      </div>
    </form>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-brand-700 text-white"
          : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-100",
      )}
    >
      {children}
    </button>
  );
}

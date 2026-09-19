import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, Download, Receipt as ReceiptIcon, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/StatusBadge";
import { api, apiErrorMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import type {
  AppDocument,
  DocumentType,
  OfficialDocument,
  Paginated,
  Payment,
} from "@/types/domain";

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
  const outstanding = receipts.filter((payment) => payment.receipt!.is_bill);
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
    <div className="space-y-5">
      <PaymentProofUpload
        applicationId={applicationId}
        outstanding={outstanding.length > 0}
        onError={setError}
      />

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
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                <span className="truncate">
                  {payment.receipt!.is_bill
                    ? `${payment.kind_label} — payment due`
                    : `Receipt for your ${payment.kind_label.toLowerCase()}`}
                </span>
                {/* Said plainly as well as implied by the wording: this is the
                    thing the customer is looking for. */}
                <Badge
                  dot
                  tone={payment.receipt!.is_bill ? "warning" : "success"}
                  label={payment.receipt!.is_bill ? "Unpaid" : "Paid"}
                />
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {payment.amount} {payment.currency}
                {payment.receipt!.is_bill
                  ? ""
                  : ` paid on ${format(new Date(payment.paid_at), "d MMMM yyyy")}`}
                {" · No. "}
                <span className="tabular">{payment.receipt!.receipt_number}</span>
              </p>
              {payment.receipt!.is_bill && payment.card_number && (
                <p className="mt-1 text-xs text-ink-600">
                  Pay into:{" "}
                  <span className="tabular font-medium">{payment.card_number}</span>
                </p>
              )}
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
    </div>
  );
}

/**
 * Sending proof that a bill was paid.
 *
 * Shown whenever money is owed, and afterwards too: a customer may need to
 * send a clearer photo than the one they first uploaded.
 */
function PaymentProofUpload({
  applicationId,
  outstanding,
  onError,
}: {
  applicationId: number;
  outstanding: boolean;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  // Held until the customer presses Send, so they can check what they picked
  // — and swap a blurry photo — before it reaches the office.
  const [chosen, setChosen] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const documentTypes = useQuery({
    queryKey: ["document-types"],
    queryFn: async () => {
      const { data } = await api.get<DocumentType[]>("/document-types/");
      return data;
    },
  });

  const sent = useQuery({
    queryKey: ["portal", "payment-proof", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AppDocument>>("/documents/", {
        params: { application: applicationId },
      });
      return data.results;
    },
  });

  const proofType = documentTypes.data?.find((type) => type.code === "payment-proof");
  const alreadySent = (sent.data ?? []).filter(
    (document) => document.document_type.code === "payment-proof",
  );

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("document_type_id", String(proofType!.id));
      form.append("file", file);
      return api.post(`/applications/${applicationId}/documents/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      clearChoice();
      void queryClient.invalidateQueries({
        queryKey: ["portal", "payment-proof", applicationId],
      });
    },
    onError: (error) =>
      onError(apiErrorMessage(error, "Could not send your payment proof.")),
  });

  function choose(file: File | null) {
    // Each object URL holds the file in memory until it is revoked, so the
    // previous one goes as soon as it is replaced.
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file && file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;
    });
    setChosen(file);
    if (file === null && inputRef.current) inputRef.current.value = "";
  }

  function clearChoice() {
    choose(null);
  }

  // Without the type the upload cannot be addressed, so the section stays
  // hidden rather than offering a button that would fail.
  if (!proofType) return null;
  if (!outstanding && alreadySent.length === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900">
        Send us your payment slip
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        After you pay, send us a photo or PDF of the bank slip so we can confirm
        it. You can send another one at any time.
      </p>

      {alreadySent.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {alreadySent.map((document) => (
            <li key={document.id} className="text-xs text-ink-500">
              Sent {format(new Date(document.created_at), "d MMMM yyyy")} —{" "}
              {document.status === "verified"
                ? "confirmed by our office"
                : document.status === "rejected"
                  ? "not accepted, please send another"
                  : "waiting for our office to check it"}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
      />

      {chosen === null ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-ink-300 px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
        >
          <Upload className="size-4" aria-hidden />
          Choose a photo or PDF
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-ink-200 bg-ink-50 p-3">
          {/* Showing the picture back is the whole point of the pause: a
              customer can see they photographed the wrong slip. */}
          {preview && (
            <img
              src={preview}
              alt=""
              className="mb-3 max-h-48 w-auto rounded-lg border border-ink-200"
            />
          )}

          <p className="truncate text-sm font-medium text-ink-900">
            {chosen.name}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {(chosen.size / 1024).toFixed(0)} KB — not sent yet
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => upload.mutate(chosen)}
              disabled={upload.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              <Upload className="size-4" aria-hidden />
              {upload.isPending ? "Sending…" : "Send to our office"}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className="rounded-lg border border-ink-300 px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-white disabled:opacity-60"
            >
              Choose a different one
            </button>
            <button
              type="button"
              onClick={clearChoice}
              disabled={upload.isPending}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

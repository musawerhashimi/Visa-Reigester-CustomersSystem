import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileText,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { Timeline } from "@/components/mis/Timeline";
import { CustomerDownloads } from "@/components/portal/CustomerDownloads";
import { Button } from "@/components/ui/Button";
import {
  ApplicationStatusBadge,
  DocumentStatusBadge,
} from "@/components/ui/StatusBadge";
import { api, apiErrorMessage } from "@/lib/api";
import { translate } from "@/lib/i18n";
import type {
  ApplicationDetail as Application,
  AppDocument,
  VisaType,
} from "@/types/domain";

export default function PortalApplicationDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const applicationId = Number(id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: application, isLoading, isError } = useQuery({
    queryKey: ["portal", "application", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Application>(`/applications/${applicationId}/`);
      return data;
    },
    enabled: Number.isFinite(applicationId),
  });

  // The checklist lives on the visa type, so an applicant can see every
  // required document — including the ones not yet uploaded.
  const { data: visaType } = useQuery({
    queryKey: ["visa-type", application?.visa_type.slug],
    queryFn: async () => {
      const { data } = await api.get<VisaType>(
        `/visa-types/${application!.visa_type.slug}/`,
      );
      return data;
    },
    enabled: Boolean(application?.visa_type.slug),
  });

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["portal", "application", applicationId],
    });

  const submit = useMutation({
    mutationFn: () => api.post(`/applications/${applicationId}/submit/`),
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not submit the application.")),
  });

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-ink-500">{t("common.loading")}</p>;
  }

  if (isError || !application) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-danger">{t("common.errorTitle")}</p>
        <Link
          to="/portal/applications"
          className="mt-3 inline-block text-sm font-medium text-brand-600"
        >
          {t("common.back")}
        </Link>
      </div>
    );
  }

  const documents = application.documents ?? [];
  const missing = application.missing_documents ?? [];
  const isDraft = application.status === "draft";
  // The server decides when a customer may still change their application
  // (section 16); duplicating the status list here would let the two drift.
  const isClosed = !application.is_editable_by_customer;

  // One row per required document, showing what has been uploaded against it.
  const checklist = (visaType?.required_documents ?? []).map((requirement) => ({
    requirement,
    document: documents.find(
      (doc) => doc.document_type.id === requirement.document_type.id,
    ),
  }));
  const extraDocuments = documents.filter(
    (doc) =>
      !(visaType?.required_documents ?? []).some(
        (requirement) => requirement.document_type.id === doc.document_type.id,
      ),
  );

  return (
    <div className="space-y-6">
      <Link
        to="/portal/applications"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("portal.applications")}
      </Link>

      <header className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="tabular font-display text-2xl font-bold">
                {application.application_number}
              </h1>
              <ApplicationStatusBadge status={application.status} />
            </div>
            <p className="mt-1.5 text-sm text-ink-600">
              {translate(application.visa_type.name)}{" "}
              {application.visa_type.country.flag_emoji}{" "}
              {translate(application.visa_type.country.name)}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {application.submitted_at
                ? `Submitted ${format(new Date(application.submitted_at), "d MMMM yyyy")}`
                : "Not yet submitted"}
            </p>
          </div>

          {isDraft && (
            <Button
              icon={<Send className="size-4" />}
              loading={submit.isPending}
              disabled={missing.length > 0}
              onClick={() => submit.mutate()}
            >
              {t("common.submit")}
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {application.rejection_reason && (
          <p className="mt-4 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
            <span className="font-medium">Reason:</span> {application.rejection_reason}
          </p>
        )}

        {isDraft && missing.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Upload these before you can submit:{" "}
              <span className="font-medium">{missing.join(", ")}</span>
            </span>
          </p>
        )}
      </header>

      <section className="card overflow-hidden">
        <header className="border-b border-ink-200 px-5 py-4">
          <h2 className="text-sm font-semibold">{t("portal.documents")}</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            PDF, JPG, PNG or WebP, up to 10 MB each.
          </p>
        </header>

        <ul className="divide-y divide-ink-100">
          {checklist.map(({ requirement, document }) => (
            <DocumentRow
              key={requirement.id}
              applicationId={applicationId}
              documentTypeId={requirement.document_type.id}
              label={translate(requirement.document_type.name)}
              mandatory={requirement.is_mandatory}
              document={document}
              locked={isClosed}
              onUploaded={refresh}
              onError={setError}
            />
          ))}

          {extraDocuments.map((document) => (
            <DocumentRow
              key={document.id}
              applicationId={applicationId}
              documentTypeId={document.document_type.id}
              label={translate(document.document_type.name)}
              mandatory={false}
              document={document}
              locked={isClosed}
              onUploaded={refresh}
              onError={setError}
            />
          ))}

          {checklist.length === 0 && extraDocuments.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-ink-500">
              {t("common.loading")}
            </li>
          )}
        </ul>
      </section>

      <CustomerDownloads applicationId={applicationId} />

      <section className="card overflow-hidden">
        <header className="border-b border-ink-200 px-5 py-4">
          <h2 className="text-sm font-semibold">{t("portal.tracking")}</h2>
        </header>
        <Timeline entries={application.timeline ?? []} />
      </section>
    </div>
  );
}

function DocumentRow({
  applicationId,
  documentTypeId,
  label,
  mandatory,
  document: existing,
  locked,
  onUploaded,
  onError,
}: {
  applicationId: number;
  documentTypeId: number;
  label: string;
  mandatory: boolean;
  document?: AppDocument;
  locked: boolean;
  onUploaded: () => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("document_type_id", String(documentTypeId));
      form.append("file", file);
      return api.post(`/applications/${applicationId}/documents/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      if (inputRef.current) inputRef.current.value = "";
      onUploaded();
    },
    onError: (error) => onError(apiErrorMessage(error, "Could not upload the file.")),
  });

  async function download() {
    if (!existing) return;
    try {
      const response = await api.get(`/documents/${existing.id}/download/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data as Blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = existing.original_filename || "document";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(apiErrorMessage(error, "Could not download the file."));
    }
  }

  // A rejected document must be replaced; a verified one should not be.
  const needsReplacement =
    existing?.status === "rejected" || existing?.status === "resubmit_required";
  const canUpload = !locked && (!existing || needsReplacement || existing.status === "pending");

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={
            existing?.status === "verified"
              ? "grid size-10 shrink-0 place-items-center rounded-lg bg-success-soft text-success"
              : needsReplacement
                ? "grid size-10 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger"
                : "grid size-10 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-400"
          }
        >
          {existing?.status === "verified" ? (
            <Check className="size-5" aria-hidden />
          ) : needsReplacement ? (
            <XCircle className="size-5" aria-hidden />
          ) : (
            <FileText className="size-5" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-900">
            {label}
            {mandatory && (
              <span className="ml-1.5 text-xs font-normal text-ink-400">Required</span>
            )}
          </p>

          {existing ? (
            <p className="mt-0.5 truncate text-xs text-ink-500">
              {existing.original_filename} ·{" "}
              {format(new Date(existing.created_at), "d MMM yyyy")}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-400">Not uploaded yet</p>
          )}

          {existing?.rejection_reason && (
            <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              <span className="font-medium">Please re-upload:</span>{" "}
              {existing.rejection_reason}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {existing && <DocumentStatusBadge status={existing.status} />}
          {existing && (
            <button
              type="button"
              onClick={() => void download()}
              aria-label={`Download ${label}`}
              className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
            >
              <Download className="size-4" />
            </button>
          )}
        </div>
      </div>

      {canUpload && (
        <div className="mt-3 pl-13">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            aria-label={`Upload ${label}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
            className="block w-full text-xs text-ink-500 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          {upload.isPending && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
              <Upload className="size-3 animate-pulse" aria-hidden />
              Uploading…
            </p>
          )}
        </div>
      )}
    </li>
  );
}

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
  Notification,
  Paginated,
  VisaType,
} from "@/types/domain";

type PortalTab = "documents" | "files" | "tracking";

/**
 * Which tab a notification belongs to.
 *
 * Anything not listed is a general update, which belongs with the progress
 * history rather than with a file the customer has to act on.
 */
const TAB_FOR_CATEGORY: Record<string, PortalTab> = {
  document_required: "documents",
  document_rejected: "documents",
  document_verified: "documents",
  receipt_available: "files",
  payment: "files",
};

export default function PortalApplicationDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const applicationId = Number(id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PortalTab>("documents");

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
  const {
    data: visaType,
    isPending: checklistPending,
    isError: checklistFailed,
  } = useQuery({
    queryKey: ["visa-type", application?.visa_type.slug],
    queryFn: async () => {
      const { data } = await api.get<VisaType>(
        `/visa-types/${application!.visa_type.slug}/`,
      );
      return data;
    },
    enabled: Boolean(application?.visa_type.slug),
  });

  // Unread notifications for this application decide which tabs carry a red
  // mark. Notifications are the only record of what the customer has not yet
  // seen, so the badge follows them rather than inventing its own tracking.
  const { data: unread } = useQuery({
    queryKey: ["portal", "unread", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification>>("/notifications/", {
        params: { application: applicationId, unread: "true", page_size: 100 },
      });
      return data.results;
    },
    enabled: Number.isFinite(applicationId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["portal", "application", applicationId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["portal", "unread", applicationId],
    });
  };

  // Opening a tab is the customer seeing it, so its red mark clears.
  const markTabRead = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => api.post(`/notifications/${id}/read/`)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["portal", "unread", applicationId],
      });
      // The header bell counts the same notifications.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  function openTab(next: PortalTab) {
    setTab(next);
    const ids = (unread ?? [])
      .filter((item) => (TAB_FOR_CATEGORY[item.category] ?? "tracking") === next)
      .map((item) => item.id);
    if (ids.length > 0) markTabRead.mutate(ids);
  }

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

  // One row per document the applicant owes, from two sources: the visa
  // type's standing checklist, plus anything staff asked for on top of it.
  // Keyed by document type so a request for a listed document reuses its row
  // rather than appearing twice.
  const requests = (application.document_requests ?? []).filter(
    (entry) => entry.status === "pending",
  );

  const checklist = [
    ...(visaType?.required_documents ?? []).map((requirement) => ({
      id: `required-${requirement.id}`,
      documentType: requirement.document_type,
      mandatory: requirement.is_mandatory,
      requestedMessage: requests.find(
        (entry) => entry.document_type.id === requirement.document_type.id,
      )?.message,
    })),
    ...requests
      .filter(
        (entry) =>
          !(visaType?.required_documents ?? []).some(
            (requirement) =>
              requirement.document_type.id === entry.document_type.id,
          ),
      )
      .map((entry) => ({
        id: `requested-${entry.id}`,
        documentType: entry.document_type,
        mandatory: true,
        requestedMessage: entry.message,
      })),
  ].map((row) => ({
    ...row,
    document: documents.find((doc) => doc.document_type.id === row.documentType.id),
  }));

  const extraDocuments = documents.filter(
    (doc) => !checklist.some((row) => row.documentType.id === doc.document_type.id),
  );

  // One red mark per tab, counting only what the customer has not yet seen.
  const unreadByTab = (unread ?? []).reduce<Record<PortalTab, number>>(
    (totals, item) => {
      const target = TAB_FOR_CATEGORY[item.category] ?? "tracking";
      totals[target] += 1;
      return totals;
    },
    { documents: 0, files: 0, tracking: 0 },
  );

  // A document still owed is news whether or not a notification survives.
  const outstanding = checklist.filter((row) => !row.document).length;

  const TABS: { key: PortalTab; label: string; badge: number }[] = [
    {
      key: "documents",
      label: "Documents to upload",
      badge: unreadByTab.documents || outstanding,
    },
    { key: "files", label: "Your files", badge: unreadByTab.files },
    { key: "tracking", label: "Progress", badge: unreadByTab.tracking },
  ];

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

      <div className="card overflow-hidden">
        {/* Tabs rather than one long page: the customer comes here to do one
            thing — upload something, fetch a file, or check progress. */}
        <div
          role="tablist"
          className="scroll-slim flex gap-1 overflow-x-auto border-b border-ink-200 px-3 pt-3"
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => openTab(item.key)}
              className={
                tab === item.key
                  ? "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 border-brand-600 px-3.5 py-2.5 text-sm font-medium text-brand-700"
                  : "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
              }
            >
              {item.label}
              {item.badge > 0 && (
                <span
                  className="tabular grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
                  aria-label={`${item.badge} new`}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

      {tab === "documents" && (
      <section>
        <header className="border-b border-ink-200 px-5 py-4">
          <h2 className="text-sm font-semibold">Documents to upload</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Send us a photo or a PDF of each one. Up to 10 MB per file.
          </p>
        </header>

        <ul className="divide-y divide-ink-100">
          {checklist.map((row) => (
            <DocumentRow
              key={row.id}
              applicationId={applicationId}
              documentTypeId={row.documentType.id}
              label={translate(row.documentType.name)}
              mandatory={row.mandatory}
              requestedMessage={row.requestedMessage}
              document={row.document}
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
              {/* An empty list is not the same as a pending one: a visa type
                  with no checklist would otherwise say "Loading…" forever. */}
              {checklistPending ? (
                t("common.loading")
              ) : checklistFailed ? (
                t("common.errorTitle")
              ) : (
                <>
                  This visa does not require any documents up front.
                  <span className="mt-1 block text-xs text-ink-400">
                    We will contact you if something is needed.
                  </span>
                </>
              )}
            </li>
          )}
        </ul>
      </section>
      )}

      {tab === "files" && (
        <CustomerDownloads applicationId={applicationId} />
      )}

      {tab === "tracking" && (
        <section>
          <header className="border-b border-ink-200 px-5 py-4">
            <h2 className="text-sm font-semibold">Progress</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Every step we have taken on your application, newest first.
            </p>
          </header>
          <Timeline entries={application.timeline ?? []} />
        </section>
      )}
      </div>
    </div>
  );
}

function DocumentRow({
  applicationId,
  documentTypeId,
  label,
  mandatory,
  requestedMessage,
  document: existing,
  locked,
  onUploaded,
  onError,
}: {
  applicationId: number;
  documentTypeId: number;
  label: string;
  mandatory: boolean;
  /** Set when staff asked for this specific document, with their note. */
  requestedMessage?: string;
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

          {requestedMessage !== undefined && !existing && (
            <p className="mt-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
              <span className="font-medium">Requested by our team</span>
              {requestedMessage && ` — ${requestedMessage}`}
            </p>
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

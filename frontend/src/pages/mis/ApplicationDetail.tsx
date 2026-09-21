import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookUser,
  Briefcase,
  Mail,
  Phone,
  Plane,
  Send,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { DocumentReviewList } from "@/components/mis/DocumentReviewList";
import { EmailComposer } from "@/components/mis/EmailComposer";
import { EmailHistory } from "@/components/mis/EmailHistory";
import { PaymentsPanel } from "@/components/mis/PaymentsPanel";
import { Timeline } from "@/components/mis/Timeline";
import { WorkflowStepper } from "@/components/mis/WorkflowStepper";
import { Button } from "@/components/ui/Button";
import {
  ApplicationStatusBadge,
  PriorityBadge,
} from "@/components/ui/StatusBadge";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type {
  ApplicationDetail as Application,
  DocumentType,
  InternalNote,
  Paginated,
  StatusOption,
} from "@/types/domain";

type Tab =
  | "documents"
  | "details"
  | "payments"
  | "emails"
  | "timeline"
  | "notes";

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const applicationId = Number(id);
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);

  const [tab, setTab] = useState<Tab>("documents");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: application, isLoading, isError } = useQuery({
    queryKey: ["mis", "application", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Application>(`/applications/${applicationId}/`);
      return data;
    },
    enabled: Number.isFinite(applicationId),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["mis", "application", applicationId] });

  const changeStatus = useMutation({
    mutationFn: ({ status, note }: { status: string; note?: string }) =>
      api.post(`/applications/${applicationId}/change-status/`, { status, note }),
    onSuccess: () => {
      setActionError(null);
      void refresh();
    },
    onError: (error) =>
      setActionError(apiErrorMessage(error, "Could not change the status.")),
  });

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-ink-500">Loading…</p>;
  }

  if (isError || !application) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-danger">This application could not be loaded.</p>
        <Link
          to="/mis/applications"
          className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Back to applications
        </Link>
      </div>
    );
  }

  // Default the collections rather than indexing them directly: a response
  // missing one of these should degrade that section, not blank the page.
  const documents = application.documents ?? [];
  const timeline = application.timeline ?? [];
  const missingDocuments = application.missing_documents ?? [];
  const transitions = application.allowed_transitions ?? [];

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "documents", label: "Documents", count: documents.length },
    { key: "details", label: "Application details" },
    { key: "payments", label: "Payments & documents" },
    { key: "emails", label: "Correspondence" },
    { key: "timeline", label: "Timeline", count: timeline.length },
    { key: "notes", label: "Internal notes" },
  ];

  return (
    <div className="space-y-6">
      <Link
        to="/mis/applications"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Applications
      </Link>

      <header className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="tabular font-display text-2xl font-bold">
                {application.application_number}
              </h1>
              <ApplicationStatusBadge status={application.status} />
              <PriorityBadge priority={application.priority} />
            </div>
            <p className="mt-1.5 text-sm text-ink-600">
              {application.full_name} ·{" "}
              {translate(application.visa_type.name)}{" "}
              {application.visa_type.country.flag_emoji}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {application.submitted_at
                ? `Submitted ${format(new Date(application.submitted_at), "d MMM yyyy")}`
                : "Not yet submitted"}
              {application.assigned_to
                ? ` · Assigned to ${application.assigned_to.full_name}`
                : " · Unassigned"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <NextActions
              transitions={transitions}
              pending={changeStatus.isPending}
              onChange={(status, note) => changeStatus.mutate({ status, note })}
            />
          </div>
        </div>

        <WorkflowStepper pipeline={application.pipeline ?? []} status={application.status} />

        {actionError && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {actionError}
          </p>
        )}

        {missingDocuments.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Missing required documents:{" "}
              <span className="font-medium">
                {missingDocuments.join(", ")}
              </span>
            </span>
          </p>
        )}
      </header>

      {application.customer && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Customer</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-medium text-ink-900">
              {application.customer.full_name}
            </span>
            <span className="tabular text-ink-500">
              {application.customer.customer_code}
            </span>
            <a
              href={`mailto:${application.customer.email}`}
              className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
            >
              <Mail className="size-3.5" aria-hidden />
              {application.customer.email}
            </a>
            {application.customer.phone && (
              <a
                href={`tel:${application.customer.phone}`}
                className="inline-flex items-center gap-1.5 text-ink-600 hover:text-ink-900"
              >
                <Phone className="size-3.5" aria-hidden />
                {application.customer.phone}
              </a>
            )}
          </div>
        </section>
      )}

      <div className="card overflow-hidden">
        <div
          role="tablist"
          className="scroll-slim flex gap-1 overflow-x-auto border-b border-ink-200 px-3 pt-3"
        >
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={
                tab === item.key
                  ? "-mb-px whitespace-nowrap border-b-2 border-brand-600 px-3.5 py-2.5 text-sm font-medium text-brand-700"
                  : "-mb-px whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
              }
            >
              {item.label}
              {item.count !== undefined && (
                <span className="tabular ml-1.5 text-xs text-ink-400">{item.count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "documents" && (
          <>
            <DocumentReviewList
              documents={documents}
              applicationId={applicationId}
            />
            {hasPermission("documents.request") && (
              <RequestDocumentForm
                applicationId={applicationId}
                onDone={refresh}
                onError={setActionError}
              />
            )}
          </>
        )}

        {tab === "details" && <DetailFields application={application} />}
        {tab === "payments" && <PaymentsPanel application={application} />}
        {tab === "emails" && <CorrespondenceTab application={application} />}
        {tab === "timeline" && <Timeline entries={timeline} />}
        {tab === "notes" && <InternalNotes applicationId={applicationId} />}
      </div>
    </div>
  );
}

function CorrespondenceTab({ application }: { application: Application }) {
  const hasPermission = useAuth((state) => state.hasPermission);

  return (
    <div>
      {hasPermission("emails.send") && (
        <div className="border-b border-ink-200">
          <EmailComposer application={application} />
        </div>
      )}
      <EmailHistory applicationId={application.id} />
    </div>
  );
}

/** Statuses that end or interrupt the workflow, shown as secondary actions. */
const NEGATIVE_STATUSES = new Set([
  "rejected",
  "cancelled",
  "withdrawn",
  "documents_required",
]);

/** Statuses a person should have to justify before committing to them. */
const NEEDS_REASON = new Set(["rejected", "cancelled"]);

/**
 * The moves available from here, as buttons rather than a dropdown.
 *
 * Advancing is the common case and gets a primary button; ending or pausing
 * the application sits alongside in a quieter style, and the destructive
 * ones ask for a reason first so the customer is told why.
 */
function NextActions({
  transitions,
  pending,
  onChange,
}: {
  transitions: StatusOption[];
  pending: boolean;
  onChange: (status: string, note?: string) => void;
}) {
  const [reasonFor, setReasonFor] = useState<StatusOption | null>(null);
  const [reason, setReason] = useState("");

  if (transitions.length === 0) {
    return (
      <p className="self-center text-sm text-ink-500">
        No further steps — this application is closed.
      </p>
    );
  }

  const forward = transitions.filter((item) => !NEGATIVE_STATUSES.has(item.value));
  const other = transitions.filter((item) => NEGATIVE_STATUSES.has(item.value));

  function choose(option: StatusOption) {
    if (NEEDS_REASON.has(option.value)) {
      setReason("");
      setReasonFor(option);
      return;
    }
    onChange(option.value);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {forward.map((option, index) => (
          <Button
            key={option.value}
            size="sm"
            variant={index === 0 ? "primary" : "outline"}
            disabled={pending}
            onClick={() => choose(option)}
            icon={<ArrowRight className="size-3.5" />}
          >
            {option.label}
          </Button>
        ))}

        {other.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => choose(option)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {reasonFor && (
        <div
          role="dialog"
          aria-label={`Reason for ${reasonFor.label}`}
          className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
        >
          <form
            className="card w-full max-w-md space-y-4 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              onChange(reasonFor.value, reason.trim());
              setReasonFor(null);
            }}
          >
            <div>
              <h2 className="text-sm font-semibold text-ink-900">
                {reasonFor.label}
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                The customer is told why, so write it for them to read.
              </p>
            </div>

            <textarea
              autoFocus
              required
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason…"
              className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />

            <div className="flex gap-3">
              <Button type="submit" size="sm" loading={pending} disabled={!reason.trim()}>
                Confirm {reasonFor.label.toLowerCase()}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setReasonFor(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function RequestDocumentForm({
  applicationId,
  onDone,
  onError,
}: {
  applicationId: number;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [typeId, setTypeId] = useState("");
  const [message, setMessage] = useState("");

  const { data: types } = useQuery({
    queryKey: ["document-types"],
    queryFn: async () => {
      const { data } = await api.get<DocumentType[]>("/document-types/");
      return data;
    },
  });

  const request = useMutation({
    mutationFn: () =>
      api.post(`/applications/${applicationId}/documents/request/`, {
        document_type_id: Number(typeId),
        message,
      }),
    onSuccess: () => {
      setTypeId("");
      setMessage("");
      onDone();
    },
    onError: (error) =>
      onError(apiErrorMessage(error, "Could not send the request.")),
  });

  return (
    <form
      className="border-t border-ink-200 bg-ink-50 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        request.mutate();
      }}
    >
      <h3 className="text-sm font-semibold">Request a document</h3>
      <p className="mt-1 text-xs text-ink-500">
        The customer is notified by email and in their portal.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={typeId}
          onChange={(event) => setTypeId(event.target.value)}
          required
          aria-label="Document type"
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="">Select document…</option>
          {types?.map((type) => (
            <option key={type.id} value={type.id}>
              {translate(type.name)}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="e.g. Please upload your latest six-month statement."
          aria-label="Message to the customer"
          className="min-w-56 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />

        <Button
          type="submit"
          size="md"
          icon={<Send className="size-3.5" />}
          loading={request.isPending}
          disabled={!typeId}
        >
          Request
        </Button>
      </div>
    </form>
  );
}

function InternalNotes({ applicationId }: { applicationId: number }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const { data: notes } = useQuery({
    queryKey: ["mis", "notes", applicationId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<InternalNote>>("/internal-notes/", {
        params: { application: applicationId },
      });
      return data.results;
    },
  });

  const addNote = useMutation({
    mutationFn: () =>
      api.post("/internal-notes/", { application: applicationId, body }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({
        queryKey: ["mis", "notes", applicationId],
      });
    },
  });

  return (
    <div className="p-5">
      <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
        These notes are internal. The customer never sees them.
      </p>

      <form
        className="mt-4 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) addNote.mutate();
        }}
      >
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="Add a note for your colleagues…"
          aria-label="Internal note"
          className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <Button
          type="submit"
          size="sm"
          loading={addNote.isPending}
          disabled={!body.trim()}
        >
          Add note
        </Button>
      </form>

      <ul className="mt-5 space-y-3">
        {notes?.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-500">No notes yet.</li>
        )}
        {notes?.map((note) => (
          <li key={note.id} className="rounded-lg border border-ink-200 p-3">
            <p className="whitespace-pre-wrap text-sm text-ink-800">{note.body}</p>
            <p className="mt-1.5 text-xs text-ink-400">
              {note.author_name ?? "Unknown"} ·{" "}
              {format(new Date(note.created_at), "d MMM yyyy, HH:mm")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

type DetailRow = {
  label: string;
  value: ReactNode;
  /** Free text that needs the full width rather than a narrow value column. */
  wide?: boolean;
  /** Drawn in the danger tone, for a passport that has already expired. */
  alert?: boolean;
};

/** A date as staff read it, not as the API stores it. */
function readableDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "d MMM yyyy");
}

/** Values arrive as snake_case choices; "not_specified" should not be shown raw. */
function readableChoice(value: string) {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

function isExpired(value: string | null) {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed < new Date();
}

/**
 * The application as the customer filled it in.
 *
 * Grouped into cards rather than one long list: a reviewer checking a
 * passport should not have to read past somebody's mother's name to find it.
 * The groups are uneven, so they flow in balanced columns instead of a rigid
 * grid, which previously left ragged gaps between the short ones.
 */
function DetailFields({ application }: { application: Application }) {
  const groups: {
    title: string;
    icon: ReactNode;
    rows: DetailRow[];
  }[] = [
    {
      title: "Personal",
      icon: <UserRound className="size-4" aria-hidden />,
      rows: [
        { label: "Full name", value: application.full_name },
        { label: "Father's name", value: application.father_name },
        { label: "Mother's name", value: application.mother_name },
        { label: "Date of birth", value: readableDate(application.date_of_birth) },
        { label: "Place of birth", value: application.place_of_birth },
        { label: "Gender", value: readableChoice(application.gender) },
        { label: "Nationality", value: application.nationality },
        { label: "Marital status", value: readableChoice(application.marital_status) },
      ],
    },
    {
      title: "Contact",
      icon: <Phone className="size-4" aria-hidden />,
      rows: [
        { label: "Email", value: application.email },
        { label: "Phone", value: application.phone },
        { label: "Alternative phone", value: application.alternative_phone },
        { label: "Address", value: application.current_address, wide: true },
        { label: "City", value: application.city },
        { label: "Country", value: application.country },
      ],
    },
    {
      title: "Passport",
      icon: <BookUser className="size-4" aria-hidden />,
      rows: [
        { label: "Number", value: application.passport_number },
        { label: "Type", value: readableChoice(application.passport_type) },
        { label: "Issued", value: readableDate(application.passport_issue_date) },
        {
          label: "Expires",
          value: readableDate(application.passport_expiry_date),
          // A passport that expired before the trip is the single most
          // common reason to reject, so it is flagged rather than read.
          alert: isExpired(application.passport_expiry_date),
        },
        { label: "Issuing country", value: application.passport_issue_country },
      ],
    },
    {
      title: "Travel",
      icon: <Plane className="size-4" aria-hidden />,
      rows: [
        { label: "Purpose", value: application.purpose_of_travel, wide: true },
        { label: "Expected travel", value: readableDate(application.expected_travel_date) },
        { label: "Expected return", value: readableDate(application.expected_return_date) },
        { label: "Previous visa", value: application.previous_visa },
        { label: "Travel history", value: application.previous_travel_history, wide: true },
      ],
    },
    {
      title: "Background",
      icon: <Briefcase className="size-4" aria-hidden />,
      rows: [
        { label: "Education", value: application.education },
        { label: "Occupation", value: application.occupation },
        { label: "Employer", value: application.employer },
        { label: "Emergency contact", value: application.emergency_contact },
        { label: "Notes", value: application.additional_notes, wide: true },
      ],
    },
  ];

  return (
    <div className="p-5">
      {/* Balanced columns: the five groups have very different heights, and a
          grid would leave a short one stranded beside a tall one. */}
      <div className="gap-5 lg:columns-2">
        {groups.map((group) => {
          const filled = group.rows.filter((row) => row.value).length;

          return (
            <section
              key={group.title}
              className="mb-5 break-inside-avoid overflow-hidden rounded-xl border border-ink-200 bg-white"
            >
              <header className="flex items-center gap-2.5 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  {group.icon}
                </span>
                <h3 className="text-sm font-semibold text-ink-900">{group.title}</h3>
                {/* Tells a reviewer at a glance whether a section is worth
                    opening, without counting dashes. */}
                <span className="ml-auto tabular text-xs text-ink-400">
                  {filled}/{group.rows.length}
                </span>
              </header>

              <dl className="divide-y divide-ink-100">
                {group.rows.map((row) => (
                  <div
                    key={row.label}
                    className={cn(
                      "px-4 py-2.5",
                      row.wide
                        ? "space-y-1"
                        : "flex items-baseline gap-4",
                    )}
                  >
                    <dt
                      className={cn(
                        "shrink-0 text-xs font-medium text-ink-500",
                        !row.wide && "w-32",
                      )}
                    >
                      {row.label}
                    </dt>
                    <dd
                      className={cn(
                        "min-w-0 flex-1 break-words text-sm",
                        row.alert ? "font-medium text-danger" : "text-ink-800",
                        row.wide && "whitespace-pre-line leading-relaxed",
                      )}
                    >
                      {row.value || <span className="text-ink-300">Not provided</span>}
                      {row.alert && (
                        <span className="ml-2 align-middle text-xs font-normal">
                          expired
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}

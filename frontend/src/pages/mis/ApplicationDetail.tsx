import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowLeft, Mail, Phone, Send, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { DocumentReviewList } from "@/components/mis/DocumentReviewList";
import { Timeline } from "@/components/mis/Timeline";
import { Button } from "@/components/ui/Button";
import {
  ApplicationStatusBadge,
  PriorityBadge,
} from "@/components/ui/StatusBadge";
import { api, apiErrorMessage } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type {
  ApplicationDetail as Application,
  DocumentType,
  InternalNote,
  Paginated,
  User,
} from "@/types/domain";

type Tab = "documents" | "details" | "timeline" | "notes";

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
    mutationFn: (status: string) =>
      api.post(`/applications/${applicationId}/change-status/`, { status }),
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
            {hasPermission("applications.assign") && (
              <AssignControl
                applicationId={applicationId}
                currentId={application.assigned_to?.id ?? null}
                onDone={refresh}
                onError={setActionError}
              />
            )}

            {transitions.length > 0 && (
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) changeStatus.mutate(event.target.value);
                }}
                disabled={changeStatus.isPending}
                aria-label="Change status"
                className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-medium text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
              >
                <option value="">Change status…</option>
                {transitions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

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
        {tab === "timeline" && <Timeline entries={timeline} />}
        {tab === "notes" && <InternalNotes applicationId={applicationId} />}
      </div>
    </div>
  );
}

function AssignControl({
  applicationId,
  currentId,
  onDone,
  onError,
}: {
  applicationId: number;
  currentId: number | null;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const { data: staff } = useQuery({
    queryKey: ["mis", "staff"],
    queryFn: async () => {
      const { data } = await api.get<User[]>("/staff/");
      return data;
    },
  });

  const assign = useMutation({
    mutationFn: (staffId: number) =>
      api.post(`/applications/${applicationId}/assign/`, { staff_id: staffId }),
    onSuccess: onDone,
    onError: (error) => onError(apiErrorMessage(error, "Could not assign.")),
  });

  return (
    <div className="relative">
      <UserPlus
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden
      />
      <select
        value={currentId ?? ""}
        onChange={(event) => {
          if (event.target.value) assign.mutate(Number(event.target.value));
        }}
        disabled={assign.isPending}
        aria-label="Assign to officer"
        className="rounded-lg border border-ink-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
      >
        <option value="">Assign to…</option>
        {staff?.map((person) => (
          <option key={person.id} value={person.id}>
            {person.full_name || person.email}
          </option>
        ))}
      </select>
    </div>
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

function DetailFields({ application }: { application: Application }) {
  const groups: { title: string; rows: [string, ReactNode][] }[] = [
    {
      title: "Personal",
      rows: [
        ["Full name", application.full_name],
        ["Father's name", application.father_name],
        ["Mother's name", application.mother_name],
        ["Date of birth", application.date_of_birth],
        ["Place of birth", application.place_of_birth],
        ["Gender", application.gender],
        ["Nationality", application.nationality],
        ["Marital status", application.marital_status],
      ],
    },
    {
      title: "Contact",
      rows: [
        ["Email", application.email],
        ["Phone", application.phone],
        ["Alternative phone", application.alternative_phone],
        ["Address", application.current_address],
        ["City", application.city],
        ["Country", application.country],
      ],
    },
    {
      title: "Passport",
      rows: [
        ["Number", application.passport_number],
        ["Type", application.passport_type],
        ["Issued", application.passport_issue_date],
        ["Expires", application.passport_expiry_date],
        ["Issuing country", application.passport_issue_country],
      ],
    },
    {
      title: "Travel",
      rows: [
        ["Purpose", application.purpose_of_travel],
        ["Expected travel", application.expected_travel_date],
        ["Expected return", application.expected_return_date],
        ["Previous visa", application.previous_visa],
        ["Travel history", application.previous_travel_history],
      ],
    },
    {
      title: "Background",
      rows: [
        ["Education", application.education],
        ["Occupation", application.occupation],
        ["Employer", application.employer],
        ["Emergency contact", application.emergency_contact],
        ["Notes", application.additional_notes],
      ],
    },
  ];

  return (
    <div className="grid gap-6 p-5 sm:grid-cols-2">
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {group.title}
          </h3>
          <dl className="mt-2.5 space-y-1.5">
            {group.rows.map(([label, value]) => (
              <div key={label} className="flex gap-3 text-sm">
                <dt className="w-36 shrink-0 text-ink-500">{label}</dt>
                <dd className="min-w-0 flex-1 break-words text-ink-800">
                  {value || <span className="text-ink-300">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

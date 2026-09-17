import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Building2, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  ApplicationStatusBadge,
  PriorityBadge,
} from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type {
  ApplicationSummary,
  ApplicationStatus,
  Branch,
  Paginated,
} from "@/types/domain";

const STATUS_FILTERS: { value: ApplicationStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "documents_required", label: "Documents required" },
  { value: "verification", label: "Verification" },
  { value: "processing", label: "Processing" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

export default function Applications() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "">("");
  const [branch, setBranch] = useState<number | "">("");
  const [page, setPage] = useState(1);

  // Only the general branch can look across offices; everyone else is already
  // narrowed by the API, so the filter would have one option.
  const seesAllBranches = useAuth((state) => state.user?.sees_all_branches ?? false);

  const { data: branches } = useQuery({
    queryKey: ["mis", "branches"],
    queryFn: async () => {
      const { data } = await api.get<Branch[]>("/branches/");
      return data;
    },
    enabled: seesAllBranches,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mis", "applications", { search, status, branch, page }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ApplicationSummary>>("/applications/", {
        params: {
          search: search || undefined,
          status: status || undefined,
          branch: branch || undefined,
          page,
        },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const rows = data?.results ?? [];
  const total = data?.count ?? 0;
  const columnCount = seesAllBranches ? 8 : 7;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Applications</h1>
          <p className="mt-1 text-sm text-ink-500">
            {total} {total === 1 ? "application" : "applications"}
          </p>
        </div>
      </header>

      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-56 flex-1">
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
              placeholder="Search by number, name, passport…"
              aria-label="Search applications"
              className="w-full rounded-lg border border-ink-300 py-2.5 pl-10 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="relative">
            <SlidersHorizontal
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ApplicationStatus | "");
                setPage(1);
              }}
              aria-label="Filter by status"
              className="rounded-lg border border-ink-300 py-2.5 pl-10 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {seesAllBranches && (
            <div className="relative">
              <Building2
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden
              />
              <select
                value={branch}
                onChange={(event) => {
                  setBranch(
                    event.target.value ? Number(event.target.value) : "",
                  );
                  setPage(1);
                }}
                aria-label="Filter by branch"
                className="rounded-lg border border-ink-300 py-2.5 pl-10 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">All branches</option>
                {branches?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Application</th>
                <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">Visa</th>
                {seesAllBranches && (
                  <th scope="col" className="px-4 py-3 font-medium">Branch</th>
                )}
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                <th scope="col" className="px-4 py-3 font-medium">Submitted</th>
                <th scope="col" className="px-4 py-3 font-medium">Officer</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ink-100">
              {isLoading && (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-12 text-center text-ink-500">
                    Loading…
                  </td>
                </tr>
              )}

              {isError && (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-12 text-center text-danger">
                    Could not load applications.
                  </td>
                </tr>
              )}

              {!isLoading && !isError && rows.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-12 text-center text-ink-500">
                    No applications match these filters.
                  </td>
                </tr>
              )}

              {rows.map((application) => (
                <tr key={application.id} className="transition-colors hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/mis/applications/${application.id}`}
                      className="tabular font-medium text-brand-700 hover:text-brand-800"
                    >
                      {application.application_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{application.customer_name}</td>
                  <td className="px-4 py-3 text-ink-700">
                    {translate(application.visa_type.name)}
                    <span className="ml-1.5 text-ink-400">
                      {application.visa_type.country.flag_emoji}
                    </span>
                  </td>
                  {seesAllBranches && (
                    <td className="px-4 py-3 text-ink-500">
                      {application.branch.name}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <ApplicationStatusBadge status={application.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={application.priority} />
                  </td>
                  <td className="tabular px-4 py-3 text-ink-600">
                    {application.submitted_at
                      ? format(new Date(application.submitted_at), "d MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {application.assigned_to?.full_name ?? (
                      <span className="text-ink-400">Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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

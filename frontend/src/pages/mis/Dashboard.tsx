import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileText } from "lucide-react";
import { Link } from "react-router-dom";

import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { translate } from "@/lib/i18n";
import type { ApplicationSummary, Paginated } from "@/types/domain";

/**
 * Counts come from the list endpoint's `count` with a page size of 1: the
 * reporting module will replace this with a single aggregate call, but this
 * keeps the dashboard honest without inventing an endpoint that does not
 * exist yet.
 */
function useStatusCount(status?: string) {
  return useQuery({
    queryKey: ["mis", "count", status ?? "all"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ApplicationSummary>>("/applications/", {
        params: { status, page_size: 1 },
      });
      return data.count;
    },
  });
}

export default function Dashboard() {
  const total = useStatusCount();
  const submitted = useStatusCount("submitted");
  const processing = useStatusCount("processing");
  const approved = useStatusCount("approved");

  const recent = useQuery({
    queryKey: ["mis", "recent-applications"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ApplicationSummary>>("/applications/", {
        params: { page_size: 8, ordering: "-created_at" },
      });
      return data.results;
    },
  });

  const tiles = [
    { label: "Total applications", value: total.data, icon: FileText, tone: "text-brand-600 bg-brand-50" },
    { label: "New / submitted", value: submitted.data, icon: Clock, tone: "text-info bg-info-soft" },
    { label: "Processing", value: processing.data, icon: Clock, tone: "text-warning bg-warning-soft" },
    { label: "Approved", value: approved.data, icon: CheckCircle2, tone: "text-success bg-success-soft" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-500">
          Overview of current application activity.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-ink-500">{label}</dt>
              <span className={`grid size-9 place-items-center rounded-lg ${tone}`}>
                <Icon className="size-4" aria-hidden />
              </span>
            </div>
            <dd className="tabular mt-3 font-display text-3xl font-bold text-ink-900">
              {value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h2 className="text-sm font-semibold">Recent applications</h2>
          <Link
            to="/mis/applications"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all
          </Link>
        </header>

        <ul className="divide-y divide-ink-100">
          {recent.isLoading && (
            <li className="px-5 py-10 text-center text-sm text-ink-500">Loading…</li>
          )}

          {recent.data?.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-ink-500">
              No applications yet.
            </li>
          )}

          {recent.data?.map((application) => (
            <li key={application.id}>
              <Link
                to={`/mis/applications/${application.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50"
              >
                <span className="tabular text-sm font-medium text-brand-700">
                  {application.application_number}
                </span>
                <span className="text-sm text-ink-700">{application.customer_name}</span>
                <span className="text-sm text-ink-500">
                  {translate(application.visa_type.name)}
                </span>
                <span className="ml-auto">
                  <ApplicationStatusBadge status={application.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowRight, Bell, FileText, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type { ApplicationSummary, Paginated } from "@/types/domain";

/** Statuses that count as still in progress from the customer's point of view. */
const PENDING_STATUSES = new Set([
  "draft",
  "submitted",
  "received",
  "documents_required",
  "documents_submitted",
]);
const PROCESSING_STATUSES = new Set([
  "under_review",
  "verification",
  "verified",
  "processing",
  "submitted_to_authority",
  "decision_pending",
]);
const DONE_STATUSES = new Set(["approved", "completed"]);

export default function PortalDashboard() {
  const { t } = useTranslation();
  const user = useAuth((state) => state.user);

  const { data: applications, isLoading } = useQuery({
    queryKey: ["portal", "applications"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ApplicationSummary>>("/applications/", {
        params: { page_size: 50 },
      });
      return data.results;
    },
  });

  const { data: unread } = useQuery({
    queryKey: ["portal", "unread-count"],
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>(
        "/notifications/unread-count/",
      );
      return data.count;
    },
  });

  const rows = applications ?? [];
  const counts = {
    total: rows.length,
    pending: rows.filter((row) => PENDING_STATUSES.has(row.status)).length,
    processing: rows.filter((row) => PROCESSING_STATUSES.has(row.status)).length,
    completed: rows.filter((row) => DONE_STATUSES.has(row.status)).length,
  };

  const tiles = [
    { label: t("portal.totalApplications"), value: counts.total },
    { label: t("portal.pending"), value: counts.pending },
    { label: t("portal.processing"), value: counts.processing },
    { label: t("portal.completed"), value: counts.completed },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {t("portal.welcome", { name: user?.first_name || user?.email })}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Track your applications and respond to anything we need.
          </p>
        </div>
        <Link to="/portal/applications/new">
          <Button icon={<Plus className="size-4" />}>
            {t("portal.newApplication")}
          </Button>
        </Link>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-5">
            <dt className="text-sm text-ink-500">{tile.label}</dt>
            <dd className="tabular mt-2 font-display text-3xl font-bold text-ink-900">
              {isLoading ? "—" : tile.value}
            </dd>
          </div>
        ))}
      </dl>

      {unread !== undefined && unread > 0 && (
        <Link
          to="/portal/notifications"
          className="card flex items-center gap-3 p-4 transition-colors hover:bg-ink-50"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Bell className="size-4" aria-hidden />
          </span>
          <span className="text-sm text-ink-700">
            You have{" "}
            <span className="font-semibold text-ink-900">{unread}</span> unread{" "}
            {unread === 1 ? "notification" : "notifications"}.
          </span>
          <ArrowRight className="ml-auto size-4 text-ink-400" aria-hidden />
        </Link>
      )}

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h2 className="text-sm font-semibold">{t("portal.recentApplications")}</h2>
          <Link
            to="/portal/applications"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {t("common.viewAll")}
          </Link>
        </header>

        {isLoading && (
          <p className="px-5 py-10 text-center text-sm text-ink-500">
            {t("common.loading")}
          </p>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-ink-100 text-ink-400">
              <FileText className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm text-ink-500">{t("portal.noApplications")}</p>
            <Link to="/portal/applications/new" className="mt-4 inline-block">
              <Button size="sm">{t("portal.newApplication")}</Button>
            </Link>
          </div>
        )}

        <ul className="divide-y divide-ink-100">
          {rows.slice(0, 5).map((application) => (
            <li key={application.id}>
              <Link
                to={`/portal/applications/${application.id}`}
                className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="tabular text-sm font-medium text-brand-700">
                    {application.application_number}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {translate(application.visa_type.name)}{" "}
                    {application.visa_type.country.flag_emoji}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular hidden text-xs text-ink-400 sm:block">
                    {application.submitted_at
                      ? format(new Date(application.submitted_at), "d MMM yyyy")
                      : "Draft"}
                  </span>
                  <ApplicationStatusBadge status={application.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

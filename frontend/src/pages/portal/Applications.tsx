import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { translate } from "@/lib/i18n";
import type { ApplicationSummary, Paginated } from "@/types/domain";

export default function PortalApplications() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "applications"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ApplicationSummary>>("/applications/", {
        params: { page_size: 50 },
      });
      return data.results;
    },
  });

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">{t("portal.applications")}</h1>
        <Link to="/portal/applications/new">
          <Button icon={<Plus className="size-4" />}>
            {t("portal.newApplication")}
          </Button>
        </Link>
      </header>

      {isLoading && (
        <p className="py-16 text-center text-sm text-ink-500">{t("common.loading")}</p>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="card px-5 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
            <FileText className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-sm text-ink-500">{t("portal.noApplications")}</p>
          <Link to="/portal/applications/new" className="mt-5 inline-block">
            <Button>{t("portal.newApplication")}</Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((application) => (
          <Link
            key={application.id}
            to={`/portal/applications/${application.id}`}
            className="card p-5 transition-shadow hover:shadow-lifted"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="tabular text-sm font-semibold text-brand-700">
                {application.application_number}
              </span>
              <ApplicationStatusBadge status={application.status} />
            </div>

            <p className="mt-3 text-base font-medium text-ink-900">
              {translate(application.visa_type.name)}
            </p>
            <p className="mt-0.5 text-sm text-ink-500">
              {application.visa_type.country.flag_emoji}{" "}
              {translate(application.visa_type.country.name)}
            </p>

            <p className="tabular mt-3 text-xs text-ink-400">
              {application.submitted_at
                ? `Submitted ${format(new Date(application.submitted_at), "d MMM yyyy")}`
                : `Created ${format(new Date(application.created_at), "d MMM yyyy")}`}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

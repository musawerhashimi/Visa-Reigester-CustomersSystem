import { ArrowRight, Briefcase, Clock, FileCheck2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import {
  CardSkeleton,
  EmptyState,
  PageBody,
  PageHeader,
} from "@/components/public/PageShell";
import { mediaUrl, usePublicContent, type ServiceItem } from "@/lib/cms";
import { translate } from "@/lib/i18n";

export default function Services() {
  const { t } = useTranslation();
  const services = usePublicContent<ServiceItem>("services", { limit: 30 });

  return (
    <>
      <PageHeader
        title={t("nav.services")}
        subtitle={t("pages.servicesSubtitle")}
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/visas">
            <Button variant="accent" icon={<ArrowRight className="size-4" />}>
              {t("home.exploreVisas")}
            </Button>
          </Link>
        </div>
      </PageHeader>

      <PageBody>
        {services.isLoading && <CardSkeleton />}

        {!services.isLoading && (services.data ?? []).length === 0 && (
          <EmptyState
            icon={<Briefcase className="size-6" />}
            title={t("pages.noServices")}
            body={t("pages.publishedSoon")}
          />
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.data?.map((service) => {
            const image = mediaUrl(service.image);
            return (
              <article key={service.id} className="card overflow-hidden">
                {image && (
                  <img
                    src={image}
                    alt=""
                    className="h-40 w-full object-cover"
                    loading="lazy"
                  />
                )}

                <div className="p-6">
                  <h2 className="text-base font-semibold text-ink-900">
                    {translate(service.name)}
                  </h2>

                  {translate(service.description) && (
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">
                      {translate(service.description)}
                    </p>
                  )}

                  {translate(service.requirements) && (
                    <div className="mt-4">
                      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                        <FileCheck2 className="size-3.5" aria-hidden />
                        {t("pages.requirements")}
                      </h3>
                      <p className="mt-1.5 whitespace-pre-line text-sm text-ink-600">
                        {translate(service.requirements)}
                      </p>
                    </div>
                  )}

                  <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink-100 pt-4 text-xs">
                    {translate(service.estimated_time) && (
                      <div>
                        <dt className="inline-flex items-center gap-1 text-ink-400">
                          <Clock className="size-3" aria-hidden />
                          {t("pages.processing")}
                        </dt>
                        <dd className="mt-0.5 font-medium text-ink-700">
                          {translate(service.estimated_time)}
                        </dd>
                      </div>
                    )}
                    {translate(service.fee_info) && (
                      <div>
                        <dt className="text-ink-400">{t("pages.fee")}</dt>
                        <dd className="mt-0.5 font-medium text-ink-700">
                          {translate(service.fee_info)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}

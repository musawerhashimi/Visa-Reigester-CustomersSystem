import { format } from "date-fns";
import { Layers, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  CardSkeleton,
  EmptyState,
  PageBody,
  PageHeader,
} from "@/components/public/PageShell";
import { mediaUrl, usePublicContent, type ActivityItem } from "@/lib/cms";
import { translate } from "@/lib/i18n";

export default function Activities() {
  const { t } = useTranslation();
  const activities = usePublicContent<ActivityItem>("activities", { limit: 30 });

  return (
    <>
      <PageHeader
        title={t("nav.activities")}
        subtitle={t("pages.activitiesSubtitle")}
      />

      <PageBody>
        {activities.isLoading && <CardSkeleton />}

        {!activities.isLoading && (activities.data ?? []).length === 0 && (
          <EmptyState
            icon={<Layers className="size-6" />}
            title={t("pages.noActivities")}
            body={t("pages.publishedSoon")}
          />
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {activities.data?.map((activity) => {
            const image = mediaUrl(activity.cover_image);
            return (
              <article key={activity.id} className="card overflow-hidden">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="h-44 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-44 place-items-center bg-brand-50 text-brand-300">
                    <Layers className="size-8" aria-hidden />
                  </div>
                )}

                <div className="p-5">
                  {activity.category && (
                    <span className="text-xs font-medium uppercase tracking-wide text-brand-600">
                      {activity.category}
                    </span>
                  )}

                  <h2 className="mt-1.5 text-base font-semibold text-ink-900">
                    {translate(activity.title)}
                  </h2>

                  {translate(activity.short_description) && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-500">
                      {translate(activity.short_description)}
                    </p>
                  )}

                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
                    {activity.date && (
                      <span className="tabular">
                        {format(new Date(activity.date), "d MMMM yyyy")}
                      </span>
                    )}
                    {translate(activity.location) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden />
                        {translate(activity.location)}
                      </span>
                    )}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}

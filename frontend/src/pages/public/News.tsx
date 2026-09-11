import { format } from "date-fns";
import { CalendarDays, MapPin, Newspaper } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  CardSkeleton,
  EmptyState,
  PageBody,
  PageHeader,
} from "@/components/public/PageShell";
import {
  mediaUrl,
  usePublicContent,
  type EventItem,
  type NewsArticle,
} from "@/lib/cms";
import { translate } from "@/lib/i18n";

export default function News() {
  const { t } = useTranslation();
  const news = usePublicContent<NewsArticle>("news", { limit: 24 });
  const events = usePublicContent<EventItem>("events", { limit: 12 });

  const upcoming = (events.data ?? []).filter(
    (event) => new Date(event.start_date) >= new Date(),
  );

  return (
    <>
      <PageHeader
        title={t("nav.news")}
        subtitle={t("pages.newsSubtitle")}
      />

      <PageBody className="space-y-16">
        <section>
          <h2 className="font-display text-2xl font-bold">{t("home.latestNews")}</h2>

          <div className="mt-8">
            {news.isLoading && <CardSkeleton />}

            {!news.isLoading && (news.data ?? []).length === 0 && (
              <EmptyState
                icon={<Newspaper className="size-6" />}
                title={t("pages.noNews")}
                body={t("pages.publishedSoon")}
              />
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {news.data?.map((article) => {
                const image = mediaUrl(article.featured_image);
                return (
                  <article key={article.id} className="card overflow-hidden">
                    <Link to={`/news/${article.slug}`} className="block">
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          className="h-44 w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid h-44 place-items-center bg-brand-50 text-brand-300">
                          <Newspaper className="size-8" aria-hidden />
                        </div>
                      )}

                      <div className="p-5">
                        {article.category && (
                          <span className="text-xs font-medium uppercase tracking-wide text-brand-600">
                            {article.category}
                          </span>
                        )}
                        <h3 className="mt-1.5 text-base font-semibold text-ink-900">
                          {translate(article.title)}
                        </h3>
                        {translate(article.short_description) && (
                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-500">
                            {translate(article.short_description)}
                          </p>
                        )}
                        <p className="mt-3 text-xs text-ink-400">
                          {article.published_at &&
                            format(new Date(article.published_at), "d MMMM yyyy")}
                          {article.author && ` · ${article.author}`}
                        </p>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">
            {t("home.upcomingEvents")}
          </h2>

          <div className="mt-8">
            {events.isLoading && <CardSkeleton count={2} />}

            {!events.isLoading && upcoming.length === 0 && (
              <EmptyState
                icon={<CalendarDays className="size-6" />}
                title={t("pages.noEvents")}
                body={t("pages.publishedSoon")}
              />
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              {upcoming.map((event) => {
                const start = new Date(event.start_date);
                return (
                  <article key={event.id} className="card flex gap-5 p-5">
                    {/* A date block reads faster than a line of text when
                        scanning several events. */}
                    <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <span className="tabular text-xl font-bold leading-none">
                        {format(start, "d")}
                      </span>
                      <span className="text-xs font-medium uppercase">
                        {format(start, "MMM")}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-ink-900">
                        {translate(event.title)}
                      </h3>
                      {translate(event.description) && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink-500">
                          {translate(event.description)}
                        </p>
                      )}
                      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
                        <span className="tabular">{format(start, "HH:mm")}</span>
                        {translate(event.location) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden />
                            {translate(event.location)}
                          </span>
                        )}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </PageBody>
    </>
  );
}

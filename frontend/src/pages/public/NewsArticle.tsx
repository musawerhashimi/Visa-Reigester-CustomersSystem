import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { PageBody, RichText } from "@/components/public/PageShell";
import { mediaUrl, usePublicItem, type NewsArticle as Article } from "@/lib/cms";
import { translate } from "@/lib/i18n";

export default function NewsArticle() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = usePublicItem<Article>("news", slug);

  if (isLoading) {
    return (
      <PageBody>
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="h-8 w-2/3 animate-pulse rounded bg-ink-100" />
          <div className="h-64 animate-pulse rounded-xl bg-ink-100" />
          <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-ink-100" />
        </div>
      </PageBody>
    );
  }

  if (isError || !article) {
    return (
      <PageBody>
        <div className="py-16 text-center">
          <p className="font-medium text-ink-800">This article is not available.</p>
          <Link
            to="/news"
            className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {t("nav.news")}
          </Link>
        </div>
      </PageBody>
    );
  }

  const image = mediaUrl(article.featured_image);

  return (
    <PageBody>
      <article className="mx-auto max-w-3xl">
        <Link
          to="/news"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("nav.news")}
        </Link>

        <header className="mt-6">
          {article.category && (
            <span className="text-xs font-medium uppercase tracking-wide text-brand-600">
              {article.category}
            </span>
          )}
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {translate(article.title)}
          </h1>
          <p className="mt-3 text-sm text-ink-400">
            {article.published_at &&
              format(new Date(article.published_at), "d MMMM yyyy")}
            {article.author && ` · ${article.author}`}
          </p>
        </header>

        {image && (
          <img
            src={image}
            alt=""
            className="mt-8 w-full rounded-xl object-cover"
            loading="lazy"
          />
        )}

        {translate(article.short_description) && (
          <p className="mt-8 text-lg leading-relaxed text-ink-600">
            {translate(article.short_description)}
          </p>
        )}

        <RichText text={translate(article.content)} className="mt-6" />
      </article>
    </PageBody>
  );
}

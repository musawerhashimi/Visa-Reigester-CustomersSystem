import {
  ArrowRight,
  BadgeCheck,
  Clock,
  FileCheck2,
  Globe2,
  Headphones,
  Plane,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  mediaUrl,
  usePublicContent,
  type BannerItem,
  type NewsArticle,
  type TestimonialItem,
} from "@/lib/cms";
import { translate } from "@/lib/i18n";
import type { Paginated, VisaType } from "@/types/domain";

const STATS = [
  { icon: Users, value: "1,250+", key: "home.statsCustomers" },
  { icon: BadgeCheck, value: "720", key: "home.statsApproved" },
  { icon: Globe2, value: "24", key: "home.statsCountries" },
  { icon: Clock, value: "12", key: "home.statsYears" },
] as const;

/** What applying actually involves, for someone who has never done it.
    Only the icons and key names live here; the wording is translated. */
const HOW_IT_WORKS = [
  "home.step1",
  "home.step2",
  "home.step3",
  "home.step4",
] as const;

/** Up to two initials, for a customer who has not sent a photograph. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const REASONS = [
  { icon: FileCheck2, key: "home.reason1" },
  { icon: ShieldCheck, key: "home.reason2" },
  { icon: Clock, key: "home.reason3" },
  { icon: Headphones, key: "home.reason4" },
] as const;

export default function Home() {
  const { t } = useTranslation();

  // Homepage content comes from the CMS, so the office can change what is
  // promoted without a deploy. Each section hides itself when empty.
  const featuredVisas = useQuery({
    queryKey: ["public", "featured-visas"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<VisaType>>("/visa-types/", {
        params: { is_featured: true, page_size: 3 },
      });
      return data.results;
    },
  });
  // The office can put a photograph behind the hero from Website → Banners.
  const banners = usePublicContent<BannerItem>("banners", { limit: 1 });
  const heroImage = mediaUrl(banners.data?.[0]?.image ?? null);

  const latestNews = usePublicContent<NewsArticle>("news", { limit: 3 });
  const testimonials = usePublicContent<TestimonialItem>("testimonials", {
    limit: 3,
  });

  return (
    <>
      {/* Hero. A deep navy field with a soft radial wash keeps the headline
          readable while still feeling designed rather than flat. */}
      <section className="relative isolate overflow-hidden bg-brand-950">
        {/* Optional photograph from the MIS, set under Website → Banners.
            It sits under the wash and is dimmed, because the headline has to
            stay legible whatever picture the office chooses. */}
        {heroImage && (
          <>
            <img
              src={heroImage}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full object-cover opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/85 to-brand-950/55"
            />
          </>
        )}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60rem 40rem at 15% -10%, oklch(0.48 0.148 261 / 0.55), transparent 60%), radial-gradient(45rem 35rem at 90% 10%, oklch(0.75 0.162 68 / 0.16), transparent 55%)",
          }}
        />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-4 pb-28 pt-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-32 lg:pt-28 lg:px-8">
          <div>
            <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              {t("home.heroTitle")}
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-brand-200 sm:text-lg">
              {t("home.heroSubtitle")}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/signup">
                <Button
                  size="lg"
                  variant="accent"
                  className="cta-pulse"
                  icon={<ArrowRight className="size-4" />}
                >
                  {t("home.applyNow")}
                </Button>
              </Link>
              <Link to="/visas">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
                >
                  {t("home.exploreVisas")}
                </Button>
              </Link>
            </div>
          </div>

          {/* What a first-time visitor actually needs: what the process is,
              what it costs them, and what they must have ready. The old card
              showed a fictional application number, which told them nothing
              and read as filler. */}
          <div className="relative">
            <div className="rounded-2xl border border-white/12 bg-white/8 p-6 shadow-lifted backdrop-blur-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-300">
                {t("home.howItWorks")}
              </p>

              <ol className="mt-5 space-y-4">
                {HOW_IT_WORKS.map((step, index) => (
                  <li key={step} className="flex gap-3.5">
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-inset ring-white/20"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">
                        {t(`${step}Title`)}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-brand-300">
                        {t(`${step}Body`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip, lifted over the hero edge so the two sections read as one.
          Two across on a phone rather than four stacked: as a single column
          this was four tall blocks to scroll past, when the numbers are meant
          to be taken in at a glance. */}
      <section className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="card grid grid-cols-2 gap-px overflow-hidden bg-ink-200 lg:grid-cols-4">
          {STATS.map(({ icon: Icon, value, key }) => (
            <div
              key={key}
              className="flex flex-col items-center bg-white px-3 py-6 text-center sm:items-start sm:px-6 sm:py-7 sm:text-left"
            >
              <Icon className="size-5 text-brand-500" aria-hidden />
              <dd className="tabular mt-2.5 font-display text-2xl font-bold text-ink-900 sm:mt-3 sm:text-3xl">
                {value}
              </dd>
              {/* balance keeps a two-word label from breaking one word onto
                  its own line in the narrow phone column. */}
              <dt className="mt-1 text-balance text-xs leading-snug text-ink-500 sm:text-sm">
                {t(key)}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      {/* One card rather than four, so the reasons read as a single argument
          instead of four disconnected tiles. The heading panel is tinted and
          the reasons are divided rules inside the same surface. */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="card overflow-hidden shadow-lifted">
          <div className="lg:grid lg:grid-cols-[0.8fr_1.2fr]">
            {/* Heading panel. Tinted so the card has a clear front and back
                rather than reading as one undifferentiated block. */}
            <div className="relative isolate overflow-hidden bg-brand-950 p-8 sm:p-10">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-80"
                style={{
                  background:
                    "radial-gradient(28rem 20rem at 20% 0%, oklch(0.48 0.148 261 / 0.6), transparent 65%)",
                }}
              />
              <div className="relative">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-400">
                  {t("home.whyEyebrow")}
                </span>
                <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-white sm:text-[2.1rem]">
                  {t("home.whyTitle")}
                </h2>
                <p className="mt-4 max-w-sm text-base leading-relaxed text-brand-200">
                  {t("home.whySubtitle")}
                </p>
                <Link to="/signup" className="mt-8 inline-block">
                  <Button variant="accent" icon={<ArrowRight className="size-4" />}>
                    {t("home.applyNow")}
                  </Button>
                </Link>
              </div>
            </div>

            {/* The reasons. Divided by rules inside the card, numbered so the
                eye has somewhere to start. */}
            <dl className="divide-y divide-ink-100">
              {REASONS.map(({ icon: Icon, key }, index) => (
                <div
                  key={key}
                  className="group flex items-start gap-5 p-7 transition-colors hover:bg-brand-50/40 sm:px-9"
                >
                  <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="size-5" aria-hidden />
                    <span
                      className="tabular absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-white text-[0.65rem] font-semibold text-ink-400 ring-1 ring-ink-200"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <dt className="font-display text-base font-semibold text-ink-900">
                      {t(`${key}Title`)}
                    </dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-ink-500">
                      {t(`${key}Body`)}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {(featuredVisas.data?.length ?? 0) > 0 && (
        <Section
          title={t("home.featuredVisas")}
          subtitle={t("home.featuredVisasSubtitle")}
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredVisas.data?.map((visa) => {
              const image = mediaUrl(visa.image);
              return (
                <article key={visa.id} className="card flex flex-col overflow-hidden">
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      className="h-40 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-40 place-items-center bg-brand-50 text-brand-300">
                      <Plane className="size-8" aria-hidden />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="text-base font-semibold">{translate(visa.name)}</h3>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {visa.country.flag_emoji} {translate(visa.country.name)}
                    </p>
                    {translate(visa.description) && (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-500">
                        {translate(visa.description)}
                      </p>
                    )}
                    <div className="mt-auto pt-5">
                      {translate(visa.processing_time) && (
                        <p className="flex items-center gap-1.5 text-xs text-ink-500">
                          <Clock className="size-3.5" aria-hidden />
                          {translate(visa.processing_time)}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-8">
            <Link to="/visas">
              <Button variant="outline" icon={<ArrowRight className="size-4" />}>
                {t("home.exploreVisas")}
              </Button>
            </Link>
          </div>
        </Section>
      )}

      {(latestNews.data?.length ?? 0) > 0 && (
        <Section title={t("home.latestNews")}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {latestNews.data?.map((article) => {
              const image = mediaUrl(article.featured_image);
              return (
                <article key={article.id} className="card overflow-hidden">
                  <Link to={`/news/${article.slug}`} className="block">
                    {image && (
                      <img
                        src={image}
                        alt=""
                        className="h-40 w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="p-5">
                      <h3 className="text-base font-semibold text-ink-900">
                        {translate(article.title)}
                      </h3>
                      {translate(article.short_description) && (
                        <p className="mt-2 line-clamp-2 text-sm text-ink-500">
                          {translate(article.short_description)}
                        </p>
                      )}
                      {article.published_at && (
                        <p className="mt-3 text-xs text-ink-400">
                          {format(new Date(article.published_at), "d MMMM yyyy")}
                        </p>
                      )}
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        </Section>
      )}

      {(testimonials.data?.length ?? 0) > 0 && (
        <Section title={t("home.testimonials")}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.data?.map((item) => {
              const photo = mediaUrl(item.photo);
              return (
                <figure key={item.id} className="card flex flex-col p-6">
                  {item.rating > 0 && (
                    <div
                      className="flex gap-0.5 text-accent-500"
                      aria-label={`${item.rating} out of 5`}
                    >
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          key={index}
                          className={cn(
                            "size-4",
                            index < item.rating
                              ? "fill-current"
                              : "text-ink-200",
                          )}
                          aria-hidden
                        />
                      ))}
                    </div>
                  )}

                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-700">
                    “{translate(item.content)}”
                  </blockquote>

                  <figcaption className="mt-5 flex items-center gap-3">
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        loading="lazy"
                        className="size-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      // Initials rather than a stock silhouette: a real
                      // customer without a photograph still reads as a person.
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                        aria-hidden
                      >
                        {initials(item.customer_name)}
                      </span>
                    )}
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium text-ink-900">
                        {item.customer_name}
                      </span>
                      {translate(item.role) && (
                        <span className="block truncate text-ink-500">
                          {translate(item.role)}
                        </span>
                      )}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </Section>
      )}

      {/* Closing call to action. */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative isolate overflow-hidden rounded-2xl bg-brand-800 px-6 py-14 text-center sm:px-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(40rem 20rem at 50% 0%, oklch(0.75 0.162 68 / 0.18), transparent 65%)",
            }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              {t("home.ctaTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-brand-200">
              {t("home.ctaBody")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/signup">
                <Button
                  size="lg"
                  variant="accent"
                  className="cta-pulse"
                  icon={<ArrowRight className="size-4" />}
                >
                  {t("home.applyNow")}
                </Button>
              </Link>
              <Link to="/contact">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
                >
                  {t("nav.contact")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-3 text-ink-500">{subtitle}</p>}
      </div>
      <div className="mt-10">{children}</div>
    </section>
  );
}

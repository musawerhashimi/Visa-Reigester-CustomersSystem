import {
  ArrowRight,
  BadgeCheck,
  Clock,
  FileCheck2,
  Globe2,
  Headphones,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";

const STATS = [
  { icon: Users, value: "1,250+", key: "home.statsCustomers" },
  { icon: BadgeCheck, value: "720", key: "home.statsApproved" },
  { icon: Globe2, value: "24", key: "home.statsCountries" },
  { icon: Clock, value: "12", key: "home.statsYears" },
] as const;

const REASONS = [
  {
    icon: FileCheck2,
    title: "Documents checked before submission",
    body: "Every file is reviewed by a visa officer, so a missing bank statement is caught here and not at the embassy.",
  },
  {
    icon: ShieldCheck,
    title: "Your data stays private",
    body: "Documents are stored behind per-application access rules and are never exposed through public links.",
  },
  {
    icon: Clock,
    title: "Track every stage",
    body: "From submission to decision, your portal shows exactly where the application stands and what is needed next.",
  },
  {
    icon: Headphones,
    title: "A named officer to talk to",
    body: "Each application is assigned to one officer, so you are never repeating your story to a new person.",
  },
] as const;

export default function Home() {
  const { t } = useTranslation();

  return (
    <>
      {/* Hero. A deep navy field with a soft radial wash keeps the headline
          readable while still feeling designed rather than flat. */}
      <section className="relative isolate overflow-hidden bg-brand-950">
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
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-brand-100 ring-1 ring-inset ring-white/15">
              <BadgeCheck className="size-3.5" aria-hidden />
              Licensed visa consultancy
            </span>

            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              {t("home.heroTitle")}
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-brand-200 sm:text-lg">
              {t("home.heroSubtitle")}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/signup">
                <Button size="lg" variant="accent" icon={<ArrowRight className="size-4" />}>
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

          {/* A stylised status card: shows the product's real value — visible
              progress — instead of a decorative stock photograph. */}
          <div className="relative">
            <div className="rounded-2xl border border-white/12 bg-white/8 p-6 shadow-lifted backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-300">
                    Application
                  </p>
                  <p className="tabular mt-1 font-display text-lg font-semibold text-white">
                    VISA-2026-000125
                  </p>
                </div>
                <span className="rounded-full bg-accent-500/15 px-2.5 py-1 text-xs font-medium text-accent-400 ring-1 ring-inset ring-accent-500/30">
                  Processing
                </span>
              </div>

              <ol className="mt-7 space-y-4">
                {[
                  { label: "Application submitted", meta: "10 Sep", done: true },
                  { label: "Documents received", meta: "10 Sep", done: true },
                  { label: "Documents verified", meta: "11 Sep", done: true },
                  { label: "Application processing", meta: "Current", active: true },
                  { label: "Final decision", meta: "Pending" },
                ].map((step) => (
                  <li key={step.label} className="flex items-center gap-3">
                    <span
                      className={
                        step.done
                          ? "grid size-6 shrink-0 place-items-center rounded-full bg-success text-white"
                          : step.active
                            ? "size-6 shrink-0 rounded-full bg-accent-500/20 ring-2 ring-accent-500"
                            : "size-6 shrink-0 rounded-full border border-white/20"
                      }
                      aria-hidden
                    >
                      {step.done && <BadgeCheck className="size-3.5" />}
                    </span>
                    <span
                      className={
                        step.done || step.active
                          ? "text-sm font-medium text-white"
                          : "text-sm text-brand-300"
                      }
                    >
                      {step.label}
                    </span>
                    <span className="tabular ml-auto text-xs text-brand-300">
                      {step.meta}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip, lifted over the hero edge so the two sections read as one. */}
      <section className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="card grid gap-px overflow-hidden bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(({ icon: Icon, value, key }) => (
            <div key={key} className="bg-white px-6 py-7">
              <Icon className="size-5 text-brand-500" aria-hidden />
              <dd className="tabular mt-3 font-display text-3xl font-bold text-ink-900">
                {value}
              </dd>
              <dt className="mt-1 text-sm text-ink-500">{t(key)}</dt>
            </div>
          ))}
        </dl>
      </section>

      <Section
        title={t("home.whyTitle")}
        subtitle="A visa application fails on detail. Our process is built to catch it."
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="card p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
            </article>
          ))}
        </div>
      </Section>

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
              Ready to start your application?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-brand-200">
              Create an account, complete the form once, and upload your documents.
              We will take it from there.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/signup">
                <Button size="lg" variant="accent" icon={<ArrowRight className="size-4" />}>
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

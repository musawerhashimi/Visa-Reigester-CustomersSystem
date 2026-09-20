import { Compass, Flag, Mail, MapPin, Phone, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  EmptyState,
  PageBody,
  PageHeader,
  RichText,
} from "@/components/public/PageShell";
import {
  mediaUrl,
  useCompanyInfo,
  usePublicContent,
  type TeamMemberItem,
} from "@/lib/cms";
import { cn } from "@/lib/cn";
import { translate } from "@/lib/i18n";

export default function About() {
  const { t } = useTranslation();
  const { data: company, isLoading } = useCompanyInfo();
  const team = usePublicContent<TeamMemberItem>("team", { limit: 24 });

  const sections: { key: string; title: string; icon: ReactNode }[] = [
    { key: "mission", title: t("pages.missionTitle"), icon: <Target className="size-5" /> },
    { key: "vision", title: t("pages.visionTitle"), icon: <Compass className="size-5" /> },
    { key: "values", title: t("pages.valuesTitle"), icon: <Users className="size-5" /> },
    { key: "goals", title: t("pages.goalsTitle"), icon: <Flag className="size-5" /> },
  ];

  const aboutImage = mediaUrl(company?.about_image ?? null);

  return (
    <>
      <PageHeader
        title={t("nav.about")}
        subtitle={company ? translate(company.description) : t("pages.aboutSubtitle")}
      />

      <PageBody className="space-y-16">
        {isLoading && (
          <div className="space-y-4">
            <div className="h-6 w-1/3 animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-ink-100" />
          </div>
        )}

        {company && (
          <>
            {/* Story and photograph side by side. Stacked, the picture pushed
                the text below the fold and the two read as unrelated blocks.
                Either one alone still fills the row. */}
            {(translate(company.history) || aboutImage) && (
              <section
                className={cn(
                  "grid items-start gap-10 lg:gap-14",
                  // Two columns only when both halves exist; with one, a
                  // grid-cols-2 would leave it stranded in the left column.
                  translate(company.history) && aboutImage && "lg:grid-cols-2",
                )}
              >
                {translate(company.history) && (
                  <div>
                    <h2 className="font-display text-2xl font-bold">
                      {t("pages.storyTitle")}
                    </h2>
                    <div className="mt-5">
                      <RichText text={translate(company.history)} />
                    </div>
                  </div>
                )}

                {aboutImage && (
                  <figure className="overflow-hidden rounded-2xl border border-ink-200 shadow-lifted lg:sticky lg:top-24">
                    <img
                      src={aboutImage}
                      alt=""
                      className="h-64 w-full object-cover sm:h-80 lg:h-[26rem]"
                    />
                  </figure>
                )}
              </section>
            )}

            <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((section) => {
                const body = translate(
                  company[section.key as keyof typeof company] as never,
                );
                if (!body) return null;
                return (
                  <div key={section.key} className="card p-6">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      {section.icon}
                    </span>
                    <h3 className="mt-5 text-base font-semibold">{section.title}</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-500">
                      {body}
                    </p>
                  </div>
                );
              })}
            </section>

            <section className="card p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold">{t("pages.findUs")}</h2>
              <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {company.address && (
                  <Detail icon={<MapPin className="size-4" />} label={t("contact.address")}>
                    {company.address}
                  </Detail>
                )}
                {company.phone && (
                  <Detail icon={<Phone className="size-4" />} label={t("contact.phone")}>
                    <a href={`tel:${company.phone}`} className="hover:text-brand-700">
                      {company.phone}
                    </a>
                  </Detail>
                )}
                {company.email && (
                  <Detail icon={<Mail className="size-4" />} label={t("contact.email")}>
                    <a href={`mailto:${company.email}`} className="hover:text-brand-700">
                      {company.email}
                    </a>
                  </Detail>
                )}
                {translate(company.working_hours) && (
                  <Detail label={t("contact.hours")}>
                    <span className="whitespace-pre-line">
                      {translate(company.working_hours)}
                    </span>
                  </Detail>
                )}
              </dl>
            </section>
          </>
        )}

        <section>
          <h2 className="font-display text-2xl font-bold">{t("pages.teamTitle")}</h2>

          <div className="mt-8">
            {!team.isLoading && (team.data ?? []).length === 0 && (
              <EmptyState
                icon={<Users className="size-6" />}
                title={t("pages.teamEmpty")}
              />
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {team.data?.map((member) => {
                const photo = mediaUrl(member.photo);
                return (
                  <article key={member.id} className="card p-5 text-center">
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        className="mx-auto size-20 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="mx-auto grid size-20 place-items-center rounded-full bg-brand-50 font-display text-xl font-bold text-brand-600">
                        {initials(member.name)}
                      </span>
                    )}
                    <h3 className="mt-4 text-base font-semibold text-ink-900">
                      {member.name}
                    </h3>
                    {translate(member.position) && (
                      <p className="mt-0.5 text-sm text-brand-600">
                        {translate(member.position)}
                      </p>
                    )}
                    {translate(member.bio) && (
                      <p className="mt-2.5 text-sm leading-relaxed text-ink-500">
                        {translate(member.bio)}
                      </p>
                    )}
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

function Detail({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 text-sm text-ink-700">{children}</dd>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

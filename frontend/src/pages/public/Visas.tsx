import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, FileCheck2, Plane } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import {
  CardSkeleton,
  EmptyState,
  PageBody,
  PageHeader,
} from "@/components/public/PageShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { translate } from "@/lib/i18n";
import type { Country, Paginated, VisaType } from "@/types/domain";

export default function Visas() {
  const { t } = useTranslation();
  const [country, setCountry] = useState<number | "">("");

  const countries = useQuery({
    queryKey: ["public", "countries"],
    queryFn: async () => {
      const { data } = await api.get<Country[]>("/countries/");
      return data;
    },
  });

  const visas = useQuery({
    queryKey: ["public", "visa-types", country],
    queryFn: async () => {
      const { data } = await api.get<Paginated<VisaType>>("/visa-types/", {
        params: { page_size: 50, country: country || undefined },
      });
      return data.results;
    },
  });

  // Only offer filters that actually have visas behind them.
  const available = new Set((visas.data ?? []).map((visa) => visa.country.id));
  const filterable = (countries.data ?? []).filter(
    (item) => country !== "" || available.has(item.id),
  );

  return (
    <>
      <PageHeader
        title={t("nav.visaServices")}
        subtitle={t("pages.visasSubtitle")}
      />

      <PageBody>
        {filterable.length > 1 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <FilterChip active={country === ""} onClick={() => setCountry("")}>
              {t("pages.allCountries")}
            </FilterChip>
            {filterable.map((item) => (
              <FilterChip
                key={item.id}
                active={country === item.id}
                onClick={() => setCountry(item.id)}
              >
                {item.flag_emoji} {translate(item.name)}
              </FilterChip>
            ))}
          </div>
        )}

        {visas.isLoading && <CardSkeleton />}

        {!visas.isLoading && (visas.data ?? []).length === 0 && (
          <EmptyState
            icon={<Plane className="size-6" />}
            title={t("pages.noVisas")}
            body={t("pages.publishedSoon")}
          />
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visas.data?.map((visa) => (
            <article key={visa.id} className="card flex flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">
                    {translate(visa.name)}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {visa.country.flag_emoji} {translate(visa.country.name)}
                  </p>
                </div>
                {visa.fee_amount && (
                  <span className="tabular shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {visa.fee_amount} {visa.fee_currency}
                  </span>
                )}
              </div>

              {translate(visa.description) && (
                <p className="mt-3 text-sm leading-relaxed text-ink-500">
                  {translate(visa.description)}
                </p>
              )}

              {visa.required_documents.length > 0 && (
                <div className="mt-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                    <FileCheck2 className="size-3.5" aria-hidden />
                    {t("pages.documentsNeeded")}
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {visa.required_documents.slice(0, 5).map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-1.5 text-sm text-ink-600"
                      >
                        <span
                          className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-300"
                          aria-hidden
                        />
                        {translate(item.document_type.name)}
                        {!item.is_mandatory && (
                          <span className="text-xs text-ink-400">({t("pages.optional")})</span>
                        )}
                      </li>
                    ))}
                    {visa.required_documents.length > 5 && (
                      <li className="text-xs text-ink-400">
                        {t("pages.andMore", { count: visa.required_documents.length - 5 })}
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-auto pt-5">
                {translate(visa.processing_time) && (
                  <p className="flex items-center gap-1.5 text-xs text-ink-500">
                    <Clock className="size-3.5" aria-hidden />
                    {t("pages.processing")}: {translate(visa.processing_time)}
                  </p>
                )}
                <Link to="/signup" className="mt-3 block">
                  <Button fullWidth icon={<ArrowRight className="size-4" />}>
                    {t("home.applyNow")}
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </PageBody>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-brand-700 text-white"
          : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
      )}
    >
      {children}
    </button>
  );
}

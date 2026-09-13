import { useQuery } from "@tanstack/react-query";
import { Globe2, Layers, Plane } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import type { Country, Paginated, VisaCategory, VisaType } from "@/types/domain";

/**
 * The catalogue behind the applicant's first question.
 *
 * What staff add here is exactly what "Which visa are you applying for?"
 * offers, so the counts lead with how many types are actually live.
 */
export default function VisasHome() {
  const { data: visaTypes } = useQuery({
    queryKey: ["visa-catalogue", "visa-types"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<VisaType>>("/visa-types/", {
        params: { page_size: 100 },
      });
      return data.results;
    },
  });

  const { data: countries } = useQuery({
    queryKey: ["visa-catalogue", "countries"],
    queryFn: async () => {
      const { data } = await api.get<Country[]>("/countries/");
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["visa-catalogue", "categories"],
    queryFn: async () => {
      const { data } = await api.get<VisaCategory[]>("/visa-categories/");
      return data;
    },
  });

  const published = visaTypes?.filter((visa) => visa.status === "published").length;

  const cards = [
    {
      to: "/mis/visas/types",
      icon: Plane,
      label: "Visa types",
      total: visaTypes?.length,
      detail:
        published === undefined
          ? "—"
          : `${published} offered on the application form`,
    },
    {
      to: "/mis/visas/countries",
      icon: Globe2,
      label: "Countries",
      total: countries?.length,
      detail: "Destinations a visa type can belong to",
    },
    {
      to: "/mis/visas/categories",
      icon: Layers,
      label: "Categories",
      total: categories?.length,
      detail: "Optional grouping, shown on the public site",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Visa catalogue</h1>
        <p className="mt-1 text-sm text-ink-500">
          The visas customers can choose from when they start an application.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="card p-5 transition-shadow hover:shadow-lifted"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <card.icon className="size-5" aria-hidden />
              </span>
              <span className="tabular font-display text-2xl font-bold text-ink-900">
                {card.total ?? "—"}
              </span>
            </div>
            <h2 className="mt-4 text-sm font-semibold text-ink-900">{card.label}</h2>
            <p className="mt-0.5 text-xs text-ink-500">{card.detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

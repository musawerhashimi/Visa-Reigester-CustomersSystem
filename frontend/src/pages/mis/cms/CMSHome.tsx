import { useQueries } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  FileText,
  HelpCircle,
  Images,
  Layers,
  MessageSquareQuote,
  Newspaper,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import type { Paginated } from "@/types/domain";

import { CONTENT_TYPES, type ContentRecord } from "./contentTypes";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  news: Newspaper,
  events: CalendarDays,
  activities: Layers,
  services: Building2,
  faqs: HelpCircle,
  testimonials: MessageSquareQuote,
  team: Users,
  gallery: Images,
};

export default function CMSHome() {
  const hasPermission = useAuth((state) => state.hasPermission);
  const visible = CONTENT_TYPES.filter((type) => hasPermission(type.permission));

  // One count per content type. Each is a page of one, so the list endpoints
  // stay the single source rather than inventing a stats endpoint.
  const counts = useQueries({
    queries: visible.map((type) => ({
      queryKey: ["cms", "count", type.key],
      queryFn: async () => {
        const { data } = await api.get<Paginated<ContentRecord>>(
          `/cms/${type.endpoint}/`,
          { params: { page_size: 100 } },
        );
        return {
          total: data.count,
          drafts: data.results.filter((row) => row.status !== "published").length,
          untranslated: data.results.filter(
            (row) => row.missing_translations.length > 0,
          ).length,
        };
      },
    })),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Website content</h1>
        <p className="mt-1 text-sm text-ink-500">
          Everything on the public site, in English, German and Turkish.
        </p>
      </header>

      {visible.length === 0 && (
        <p className="card px-5 py-16 text-center text-sm text-ink-500">
          You do not have permission to manage website content.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((type, index) => {
          const Icon = ICONS[type.key] ?? FileText;
          const stats = counts[index]?.data;

          return (
            <Link
              key={type.key}
              to={`/mis/cms/${type.key}`}
              className="card p-5 transition-shadow hover:shadow-lifted"
            >
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <span className="tabular font-display text-2xl font-bold text-ink-900">
                  {stats?.total ?? "—"}
                </span>
              </div>

              <h2 className="mt-4 text-base font-semibold text-ink-900">
                {type.label}
              </h2>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {stats?.drafts ? (
                  <span className="text-ink-500">{stats.drafts} draft</span>
                ) : null}
                {stats?.untranslated ? (
                  <span className="text-warning">
                    {stats.untranslated} need translation
                  </span>
                ) : null}
                {stats && !stats.drafts && !stats.untranslated && stats.total > 0 && (
                  <span className="text-success">All published and translated</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

    </div>
  );
}

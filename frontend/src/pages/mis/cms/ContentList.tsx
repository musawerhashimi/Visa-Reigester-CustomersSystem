import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, EyeOff, FileText, Languages, Plus, Trash2 } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import type { Paginated } from "@/types/domain";

import {
  CONTENT_TYPE_BY_KEY,
  recordTitle,
  type ContentRecord,
} from "./contentTypes";

export default function ContentList() {
  const { type } = useParams<{ type: string }>();
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);
  const config = type ? CONTENT_TYPE_BY_KEY.get(type) : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["cms", type],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ContentRecord>>(
        `/cms/${config!.endpoint}/`,
        { params: { page_size: 100 } },
      );
      return data.results;
    },
    enabled: Boolean(config),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["cms", type] });

  const togglePublish = useMutation({
    mutationFn: ({ record, publish }: { record: ContentRecord; publish: boolean }) =>
      api.post(
        `/cms/${config!.endpoint}/${lookupValue(record, config!.lookup)}/${
          publish ? "publish" : "unpublish"
        }/`,
      ),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (record: ContentRecord) =>
      api.delete(`/cms/${config!.endpoint}/${lookupValue(record, config!.lookup)}/`),
    onSuccess: refresh,
  });

  if (!config) return <Navigate to="/mis" replace />;

  const canManage = hasPermission(config.permission);
  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{config.label}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {rows.length} {rows.length === 1 ? "item" : "items"} · published in
            English, German and Turkish
          </p>
        </div>
        {canManage && (
          <Link to={`/mis/cms/${config.key}/new`}>
            <Button icon={<Plus className="size-4" />}>New {config.singular.toLowerCase()}</Button>
          </Link>
        )}
      </header>

      {togglePublish.isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {apiErrorMessage(
            togglePublish.error,
            "Could not change the publication status.",
          )}
        </p>
      )}

      <div className="card overflow-hidden">
        {isLoading && (
          <p className="px-5 py-16 text-center text-sm text-ink-500">Loading…</p>
        )}

        {error && (
          <p className="px-5 py-16 text-center text-sm text-danger">
            {apiErrorMessage(error, "Could not load this content.")}
          </p>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
              <FileText className="size-6" aria-hidden />
            </span>
            <p className="mt-4 text-sm text-ink-500">
              Nothing here yet.
            </p>
            {canManage && (
              <Link to={`/mis/cms/${config.key}/new`} className="mt-5 inline-block">
                <Button size="sm">New {config.singular.toLowerCase()}</Button>
              </Link>
            )}
          </div>
        )}

        <ul className="divide-y divide-ink-100">
          {rows.map((record) => {
            const isPublished = record.status === "published";
            return (
              <li
                key={record.id}
                className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/mis/cms/${config.key}/${lookupValue(record, config.lookup)}`}
                    className="text-sm font-medium text-ink-900 hover:text-brand-700"
                  >
                    {recordTitle(record, config)}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {record.slug && <span className="tabular">/{record.slug} · </span>}
                    Updated {format(new Date(record.updated_at), "d MMM yyyy")}
                  </p>
                </div>

                {record.missing_translations.length > 0 && (
                  <Badge
                    tone="warning"
                    label={`Missing ${record.missing_translations
                      .join(", ")
                      .toUpperCase()}`}
                    className="gap-1"
                  />
                )}

                <Badge
                  dot
                  tone={isPublished ? "success" : "neutral"}
                  label={isPublished ? "Published" : "Draft"}
                />

                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        togglePublish.mutate({ record, publish: !isPublished })
                      }
                      aria-label={isPublished ? "Unpublish" : "Publish"}
                      title={isPublished ? "Unpublish" : "Publish"}
                      className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
                    >
                      {isPublished ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${recordTitle(record, config)}"? This cannot be undone.`,
                          )
                        ) {
                          remove.mutate(record);
                        }
                      }}
                      aria-label="Delete"
                      title="Delete"
                      className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="flex items-center gap-2 text-xs text-ink-500">
        <Languages className="size-3.5" aria-hidden />
        A missing German or Turkish translation falls back to English on the
        public site.
      </p>
    </div>
  );
}

function lookupValue(record: ContentRecord, lookup: "slug" | "id") {
  return lookup === "slug" ? (record.slug ?? String(record.id)) : String(record.id);
}

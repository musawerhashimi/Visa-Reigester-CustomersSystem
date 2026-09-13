import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Plane, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { api, apiErrorMessage } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type { Paginated, VisaType } from "@/types/domain";

export default function VisaTypeList() {
  const queryClient = useQueryClient();
  const canManage = useAuth((state) => state.hasPermission)("visas.manage");

  const { data, isLoading, error } = useQuery({
    queryKey: ["visa-catalogue", "visa-types"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<VisaType>>("/visa-types/", {
        params: { page_size: 100 },
      });
      return data.results;
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["visa-catalogue"] });

  // No publish/unpublish action on this endpoint — the status field is the
  // whole switch, so a PATCH says it directly.
  const togglePublish = useMutation({
    mutationFn: ({ visa, publish }: { visa: VisaType; publish: boolean }) =>
      api.patch(`/visa-types/${visa.slug}/`, {
        status: publish ? "published" : "draft",
      }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (visa: VisaType) => api.delete(`/visa-types/${visa.slug}/`),
    onSuccess: refresh,
  });

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/mis/visas"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Visa catalogue
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Visa types</h1>
          <p className="mt-1 text-sm text-ink-500">
            Published types appear on the application form; drafts stay hidden.
          </p>
        </div>
        {canManage && (
          <Link to="/mis/visas/types/new">
            <Button icon={<Plus className="size-4" />}>New visa type</Button>
          </Link>
        )}
      </header>

      {(togglePublish.isError || remove.isError) && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {apiErrorMessage(
            togglePublish.error ?? remove.error,
            "Could not update this visa type.",
          )}
        </p>
      )}

      <div className="card overflow-hidden">
        {isLoading && (
          <p className="px-5 py-16 text-center text-sm text-ink-500">Loading…</p>
        )}

        {error && (
          <p className="px-5 py-16 text-center text-sm text-danger">
            {apiErrorMessage(error, "Could not load the visa types.")}
          </p>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
              <Plane className="size-6" aria-hidden />
            </span>
            <p className="mt-4 text-sm text-ink-500">
              No visa types yet. Customers cannot start an application until
              there is at least one published.
            </p>
            {canManage && (
              <Link to="/mis/visas/types/new" className="mt-5 inline-block">
                <Button size="sm">New visa type</Button>
              </Link>
            )}
          </div>
        )}

        <ul className="divide-y divide-ink-100">
          {rows.map((visa) => {
            const isPublished = visa.status === "published";
            return (
              <li
                key={visa.id}
                className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/mis/visas/types/${visa.slug}`}
                    className="text-sm font-medium text-ink-900 hover:text-brand-700"
                  >
                    {visa.country.flag_emoji} {translate(visa.name)}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">
                    <span className="tabular">/{visa.slug}</span> ·{" "}
                    {translate(visa.country.name)}
                    {visa.fee_amount &&
                      ` · ${visa.fee_amount} ${visa.fee_currency}`}
                  </p>
                </div>

                {visa.required_documents.length > 0 && (
                  <Badge
                    tone="neutral"
                    label={`${visa.required_documents.length} documents`}
                  />
                )}

                {visa.missing_translations?.length > 0 && (
                  <Badge
                    tone="warning"
                    label={`Missing ${visa.missing_translations
                      .join(", ")
                      .toUpperCase()}`}
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
                        togglePublish.mutate({ visa, publish: !isPublished })
                      }
                      aria-label={isPublished ? "Unpublish" : "Publish"}
                      title={
                        isPublished
                          ? "Hide from the application form"
                          : "Offer on the application form"
                      }
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
                            `Delete "${translate(visa.name)}"? This cannot be undone.`,
                          )
                        ) {
                          remove.mutate(visa);
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
    </div>
  );
}

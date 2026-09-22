import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Plane, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type { Paginated, VisaType } from "@/types/domain";

export default function VisaTypeList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canManage = useAuth((state) => state.hasPermission)("visas.manage");
  // The row awaiting confirmation. Held here rather than on the row so the
  // dialog survives the list re-rendering underneath it.
  const [pendingDelete, setPendingDelete] = useState<VisaType | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["visa-catalogue", "visa-types"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<VisaType>>("/visa-types/", {
        params: { page_size: 100 },
      });
      return data.results;
    },
  });

  // The applicant's form reads the same endpoint under its own key, so
  // drafting a type has to drop that cache too — otherwise it stays on offer
  // there until the entry goes stale.
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["visa-catalogue"] }),
      queryClient.invalidateQueries({ queryKey: ["visa-types"] }),
      queryClient.invalidateQueries({ queryKey: ["public", "visa-types"] }),
    ]);
  };

  // No publish/unpublish action on this endpoint — the status field is the
  // whole switch, so a PATCH says it directly.
  const togglePublish = useMutation({
    mutationFn: ({ visa, publish }: { visa: VisaType; publish: boolean }) =>
      api.patch(`/visa-types/${visa.slug}/`, {
        status: publish ? "published" : "draft",
      }),
    onSuccess: async (_data, { visa, publish }) => {
      await refresh();
      toast(
        publish
          ? `"${translate(visa.name)}" is now on the application form.`
          : `"${translate(visa.name)}" is a draft and no longer offered.`,
      );
    },
    onError: (err) =>
      toast(apiErrorMessage(err, "Could not change this visa type."), "error"),
  });

  const remove = useMutation({
    mutationFn: (visa: VisaType) => api.delete(`/visa-types/${visa.slug}/`),
    onSuccess: async (_data, visa) => {
      await refresh();
      setPendingDelete(null);
      toast(`"${translate(visa.name)}" was deleted.`);
    },
    // The dialog stays open and shows why — a type with applications behind
    // it is refused, and that reason is the useful part.
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
                        remove.reset();
                        setPendingDelete(visa);
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this visa type?"
        description={
          pendingDelete && (
            <>
              <strong className="font-medium text-ink-700">
                {translate(pendingDelete.name)}
              </strong>{" "}
              will be removed from the catalogue for good, along with its
              document checklist.
              {/* Drafting is only worth suggesting to someone who has not
                  already done it; otherwise it reads as though they had
                  missed a step. */}
              {pendingDelete.status === "published" &&
                " To stop offering it while keeping its history, set it to draft instead."}
              {pendingDelete.status !== "published" &&
                " It is already a draft, so it is not being offered to new applicants."}
            </>
          )
        }
        confirmLabel="Delete visa type"
        error={
          remove.isError
            ? apiErrorMessage(remove.error, "Could not delete this visa type.")
            : null
        }
        loading={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
        onCancel={() => {
          remove.reset();
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

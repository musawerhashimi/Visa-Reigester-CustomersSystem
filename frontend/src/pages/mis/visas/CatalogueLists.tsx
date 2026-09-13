import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { TranslatedInput } from "@/components/cms/TranslatedInput";
import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type { Country, Translated, VisaCategory } from "@/types/domain";

type Row = Country | VisaCategory;
type Draft = Record<string, unknown>;

/**
 * Countries and categories, the two lists a visa type is built from.
 *
 * Both are a handful of short records, so they are edited inline here rather
 * than through a separate detail page like visa types get.
 */

export function CountryList() {
  return (
    <CatalogueList
      endpoint="countries"
      title="Countries"
      subtitle="Destinations a visa type can belong to."
      singular="country"
      emptyDraft={{ code: "", name: { en: "", de: "", tr: "" }, flag_emoji: "", is_active: true }}
      renderSubtitle={(row) => (row as Country).code}
      renderBadge={(row) =>
        (row as Country).is_active === false ? (
          <Badge tone="neutral" label="Inactive" dot />
        ) : null
      }
      renderFields={(draft, set, errors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Country code"
              required
              hint="Two letters, e.g. DE"
              maxLength={2}
              error={errors.code}
              value={(draft.code as string) ?? ""}
              onChange={(event) => set("code", event.target.value.toUpperCase())}
            />
            <Field
              label="Flag emoji"
              hint="Shown next to the name"
              error={errors.flag_emoji}
              value={(draft.flag_emoji as string) ?? ""}
              onChange={(event) => set("flag_emoji", event.target.value)}
            />
          </div>
          <TranslatedInput
            label="Name"
            required
            value={draft.name as Translated | undefined}
            onChange={(value) => set("name", value)}
            error={errors.name}
          />
          <label className="flex items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={draft.is_active !== false}
              onChange={(event) => set("is_active", event.target.checked)}
              className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
            />
            Available for new visa types
          </label>
        </>
      )}
    />
  );
}

export function CategoryList() {
  return (
    <CatalogueList
      endpoint="visa-categories"
      title="Visa categories"
      subtitle="An optional grouping, shown on the public site."
      singular="category"
      emptyDraft={{
        slug: "",
        name: { en: "", de: "", tr: "" },
        description: { en: "", de: "", tr: "" },
        status: "published",
      }}
      renderSubtitle={(row) => `/${(row as VisaCategory).slug}`}
      renderBadge={(row) =>
        (row as VisaCategory).status !== "published" ? (
          <Badge tone="neutral" label="Draft" dot />
        ) : null
      }
      renderFields={(draft, set, errors) => (
        <>
          <Field
            label="URL slug"
            required
            hint="e.g. study"
            error={errors.slug}
            value={(draft.slug as string) ?? ""}
            onChange={(event) => set("slug", event.target.value)}
          />
          <TranslatedInput
            label="Name"
            required
            value={draft.name as Translated | undefined}
            onChange={(value) => set("name", value)}
            error={errors.name}
          />
          <TranslatedInput
            label="Description"
            multiline
            rows={3}
            value={draft.description as Translated | undefined}
            onChange={(value) => set("description", value)}
            error={errors.description}
          />
          <label className="flex items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={draft.status === "published"}
              onChange={(event) =>
                set("status", event.target.checked ? "published" : "draft")
              }
              className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
            />
            Visible on the public site
          </label>
        </>
      )}
    />
  );
}

function CatalogueList({
  endpoint,
  title,
  subtitle,
  singular,
  emptyDraft,
  renderFields,
  renderSubtitle,
  renderBadge,
}: {
  endpoint: string;
  title: string;
  subtitle: string;
  singular: string;
  emptyDraft: Draft;
  renderFields: (
    draft: Draft,
    set: (name: string, value: unknown) => void,
    errors: Record<string, string>,
  ) => React.ReactNode;
  renderSubtitle: (row: Row) => string;
  renderBadge: (row: Row) => React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const canManage = useAuth((state) => state.hasPermission)("visas.manage");

  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["visa-catalogue", endpoint],
    queryFn: async () => {
      const { data } = await api.get<Row[]>(`/${endpoint}/`);
      return data;
    },
  });

  function close() {
    setEditing(null);
    setErrors({});
    setFormError(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...draft };
      delete payload.id;
      if (editing === "new") {
        const { data } = await api.post<Row>(`/${endpoint}/`, payload);
        return data;
      }
      const { data } = await api.patch<Row>(
        `/${endpoint}/${(editing as Row).id}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["visa-catalogue"] });
      close();
    },
    onError: (err) => {
      const body = (err as { response?: { data?: unknown } }).response?.data;
      const fields: Record<string, string> = {};
      if (body && typeof body === "object" && !Array.isArray(body)) {
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
          if (key === "detail") continue;
          fields[key] = Array.isArray(value) ? String(value[0]) : String(value);
        }
      }
      setErrors(fields);
      setFormError(
        Object.keys(fields).length > 0
          ? "Please correct the highlighted fields."
          : apiErrorMessage(err, `Could not save this ${singular}.`),
      );
    },
  });

  const remove = useMutation({
    mutationFn: (row: Row) => api.delete(`/${endpoint}/${row.id}/`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["visa-catalogue"] }),
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
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
        </div>
        {canManage && (
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setDraft(emptyDraft);
              setEditing("new");
            }}
          >
            New {singular}
          </Button>
        )}
      </header>

      {remove.isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {apiErrorMessage(remove.error, `Could not delete this ${singular}.`)}
        </p>
      )}

      {editing && (
        <form
          className="card space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">
              {editing === "new" ? `New ${singular}` : `Edit ${singular}`}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Cancel"
              className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink-100"
            >
              <X className="size-4" />
            </button>
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
              {formError}
            </p>
          )}

          {renderFields(
            draft,
            (name, value) => setDraft((previous) => ({ ...previous, [name]: value })),
            errors,
          )}

          <div className="flex gap-3 border-t border-ink-200 pt-5">
            <Button type="submit" loading={save.isPending}>
              {editing === "new" ? "Create" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {isLoading && (
          <p className="px-5 py-16 text-center text-sm text-ink-500">Loading…</p>
        )}

        {error && (
          <p className="px-5 py-16 text-center text-sm text-danger">
            {apiErrorMessage(error, `Could not load the ${title.toLowerCase()}.`)}
          </p>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <p className="px-5 py-16 text-center text-sm text-ink-500">
            Nothing here yet.
          </p>
        )}

        <ul className="divide-y divide-ink-100">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-ink-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">
                  {"flag_emoji" in row && `${row.flag_emoji} `}
                  {translate(row.name)}
                </p>
                <p className="tabular mt-0.5 text-xs text-ink-400">
                  {renderSubtitle(row)}
                </p>
              </div>

              {renderBadge(row)}

              {canManage && (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft({ ...row } as Draft);
                      setEditing(row);
                      setErrors({});
                      setFormError(null);
                    }}
                  >
                    Edit
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${translate(row.name)}"? This cannot be undone.`,
                        )
                      ) {
                        remove.mutate(row);
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
          ))}
        </ul>
      </div>
    </div>
  );
}

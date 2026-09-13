import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { TranslatedInput } from "@/components/cms/TranslatedInput";
import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import type {
  Country,
  DocumentType,
  Translated,
  VisaCategory,
  VisaType,
} from "@/types/domain";

type Values = Record<string, unknown>;

const ENTRY_TYPES = [
  { value: "", label: "Not specified" },
  { value: "single", label: "Single Entry" },
  { value: "double", label: "Double Entry" },
  { value: "multiple", label: "Multiple Entry" },
];

/** The translatable fields, in the order the form shows them. */
const TRANSLATED_FIELDS = [
  { name: "name", label: "Name", required: true, hint: "What the applicant picks, e.g. Student Visa" },
  { name: "description", label: "Description", rows: 3 },
  { name: "requirements", label: "Requirements", rows: 4 },
  { name: "application_instructions", label: "Application instructions", rows: 4 },
  { name: "processing_time", label: "Processing time", hint: "e.g. 3–4 weeks" },
  { name: "validity", label: "Validity", hint: "e.g. 1 year" },
] as const;

export default function VisaTypeEditor() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useAuth((state) => state.hasPermission)("visas.manage");
  const isNew = slug === "new";

  const [values, setValues] = useState<Values>({ fee_currency: "EUR" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: record, isLoading } = useQuery({
    queryKey: ["visa-catalogue", "visa-types", slug],
    queryFn: async () => {
      const { data } = await api.get<VisaType>(`/visa-types/${slug}/`);
      return data;
    },
    enabled: !isNew,
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

  useEffect(() => {
    if (!record) return;
    // Flatten the nested country/category the API returns into the *_id
    // fields it expects back.
    setValues({
      ...record,
      country_id: record.country?.id,
      category_id: record.category?.id ?? "",
    });
  }, [record]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Values = { ...values };
      for (const key of [
        "id",
        "created_at",
        "updated_at",
        "country",
        "category",
        "required_documents",
        "missing_translations",
        "published_at",
        "image",
      ]) {
        delete payload[key];
      }
      // Empty strings mean "not set" for these; the API wants null.
      if (!payload.category_id) payload.category_id = null;
      if (payload.fee_amount === "") payload.fee_amount = null;
      payload.status ??= "draft";

      if (isNew) {
        const { data } = await api.post<VisaType>("/visa-types/", payload);
        return data;
      }
      const { data } = await api.patch<VisaType>(`/visa-types/${slug}/`, payload);
      return data;
    },
    onSuccess: (data) => {
      setFieldErrors({});
      setFormError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void queryClient.invalidateQueries({ queryKey: ["visa-catalogue"] });
      // The applicant's form reads this list too, so drop its cache.
      void queryClient.invalidateQueries({ queryKey: ["visa-types"] });
      if (isNew || data.slug !== slug) {
        navigate(`/mis/visas/types/${data.slug}`, { replace: true });
      }
    },
    onError: (error) => handleApiError(error, setFieldErrors, setFormError),
  });

  if (!canManage) {
    return (
      <p className="py-16 text-center text-sm text-ink-500">
        You do not have permission to manage the visa catalogue.
      </p>
    );
  }
  if (!isNew && isLoading) {
    return <p className="py-16 text-center text-sm text-ink-500">Loading…</p>;
  }

  const isPublished = values.status === "published";

  function setField(name: string, value: unknown) {
    setValues((previous) => ({ ...previous, [name]: value }));
    setFieldErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/mis/visas/types"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Visa types
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">
          {isNew ? "New visa type" : translate(values.name as Translated)}
        </h1>
        {!isNew && (
          <Badge
            dot
            tone={isPublished ? "success" : "neutral"}
            label={isPublished ? "Published" : "Draft"}
          />
        )}
      </header>

      {formError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {formError}
        </p>
      )}

      <form
        className="card space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field
          label="URL slug"
          required
          hint="e.g. germany-student-visa"
          error={fieldErrors.slug}
          value={(values.slug as string) ?? ""}
          onChange={(event) => setField("slug", event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Country"
            required
            error={fieldErrors.country_id}
            value={String(values.country_id ?? "")}
            onChange={(value) => setField("country_id", value ? Number(value) : "")}
            options={[
              { value: "", label: "Select a country" },
              ...(countries ?? []).map((country) => ({
                value: String(country.id),
                label: `${country.flag_emoji} ${translate(country.name)}`,
              })),
            ]}
          />

          <Select
            label="Category"
            error={fieldErrors.category_id}
            value={String(values.category_id ?? "")}
            onChange={(value) => setField("category_id", value ? Number(value) : "")}
            options={[
              { value: "", label: "No category" },
              ...(categories ?? []).map((category) => ({
                value: String(category.id),
                label: translate(category.name),
              })),
            ]}
          />
        </div>

        {TRANSLATED_FIELDS.map((field) => (
          <TranslatedInput
            key={field.name}
            label={field.label}
            value={values[field.name] as Translated | undefined}
            onChange={(value) => setField(field.name, value)}
            multiline={"rows" in field}
            rows={"rows" in field ? field.rows : undefined}
            required={"required" in field ? field.required : undefined}
            hint={"hint" in field ? field.hint : undefined}
            error={fieldErrors[field.name]}
          />
        ))}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Fee"
            type="number"
            step="0.01"
            min="0"
            error={fieldErrors.fee_amount}
            value={(values.fee_amount as string) ?? ""}
            onChange={(event) => setField("fee_amount", event.target.value)}
          />
          <Field
            label="Currency"
            error={fieldErrors.fee_currency}
            value={(values.fee_currency as string) ?? "EUR"}
            onChange={(event) =>
              setField("fee_currency", event.target.value.toUpperCase())
            }
          />
          <Select
            label="Entry type"
            error={fieldErrors.entry_type}
            value={(values.entry_type as string) ?? ""}
            onChange={(value) => setField("entry_type", value)}
            options={ENTRY_TYPES}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Status"
            hint="Only published types appear on the application form."
            error={fieldErrors.status}
            value={(values.status as string) ?? "draft"}
            onChange={(value) => setField("status", value)}
            options={[
              { value: "draft", label: "Draft" },
              { value: "published", label: "Published" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <Field
            label="Display order"
            type="number"
            min="0"
            hint="Lower numbers are listed first."
            error={fieldErrors.display_order}
            value={String(values.display_order ?? 0)}
            onChange={(event) => setField("display_order", Number(event.target.value))}
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(values.is_featured)}
            onChange={(event) => setField("is_featured", event.target.checked)}
            className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
          />
          Feature this visa on the public website
        </label>

        <div className="flex items-center gap-3 border-t border-ink-200 pt-5">
          <Button type="submit" icon={<Save className="size-4" />} loading={save.isPending}>
            {isNew ? "Create" : "Save changes"}
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" aria-hidden />
              Saved
            </span>
          )}
          <p className="ml-auto text-xs text-ink-500">
            {isPublished
              ? "Offered on the application form."
              : "Hidden from applicants."}
          </p>
        </div>
      </form>

      {!isNew && record && <RequiredDocuments visa={record} />}
    </div>
  );
}

/**
 * The upload checklist an applicant sees after choosing this visa.
 *
 * Always shown, including when empty: a visa type with no documents leaves
 * the applicant's upload panel blank, which is worth seeing here.
 */
function RequiredDocuments({ visa }: { visa: VisaType }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState("");

  const { data: documentTypes } = useQuery({
    queryKey: ["document-types"],
    queryFn: async () => {
      const { data } = await api.get<DocumentType[]>("/document-types/");
      return data;
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["visa-catalogue"] });

  const add = useMutation({
    mutationFn: (documentTypeId: number) =>
      api.post("/visa-required-documents/", {
        visa_type: visa.id,
        document_type: documentTypeId,
        is_mandatory: true,
      }),
    onSuccess: () => {
      setAdding("");
      void refresh();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, mandatory }: { id: number; mandatory: boolean }) =>
      api.patch(`/visa-required-documents/${id}/`, { is_mandatory: mandatory }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/visa-required-documents/${id}/`),
    onSuccess: refresh,
  });

  const used = new Set(visa.required_documents.map((item) => item.document_type.id));
  const available = (documentTypes ?? []).filter((type) => !used.has(type.id));
  const error = add.error ?? update.error ?? remove.error;

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-ink-900">Required documents</h2>
      <p className="mt-1 text-xs text-ink-500">
        The checklist an applicant must satisfy before they can submit.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {apiErrorMessage(error, "Could not update the checklist.")}
        </p>
      )}

      {visa.required_documents.length === 0 ? (
        <p className="mt-4 rounded-lg bg-warning-soft px-3.5 py-3 text-xs text-warning">
          No documents required. Applicants will see an empty upload list and
          can submit straight away.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visa.required_documents.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 text-ink-900">
                {translate(item.document_type.name)}
              </span>

              <label className="flex items-center gap-2 text-xs text-ink-600">
                <input
                  type="checkbox"
                  checked={item.is_mandatory}
                  onChange={(event) =>
                    update.mutate({ id: item.id, mandatory: event.target.checked })
                  }
                  className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
                />
                Mandatory
              </label>

              <button
                type="button"
                onClick={() => remove.mutate(item.id)}
                aria-label={`Remove ${translate(item.document_type.name)}`}
                title="Remove"
                className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Select
              label="Add a document"
              value={adding}
              onChange={setAdding}
              options={[
                { value: "", label: "Select a document type" },
                ...available.map((type) => ({
                  value: String(type.id),
                  label: translate(type.name),
                })),
              ]}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            icon={<Plus className="size-4" />}
            disabled={!adding}
            loading={add.isPending}
            onClick={() => add.mutate(Number(adding))}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink-700">
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      <select
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Split DRF's field errors out of the response so each lands on its input. */
function handleApiError(
  error: unknown,
  setFieldErrors: (value: Record<string, string>) => void,
  setFormError: (value: string | null) => void,
) {
  const data = (error as { response?: { data?: unknown } }).response?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === "detail") continue;
      fields[key] = Array.isArray(value) ? String(value[0]) : String(value);
    }
    if (Object.keys(fields).length > 0) {
      setFieldErrors(fields);
      setFormError("Please correct the highlighted fields.");
      return;
    }
  }
  setFormError(apiErrorMessage(error, "Could not save this visa type."));
}

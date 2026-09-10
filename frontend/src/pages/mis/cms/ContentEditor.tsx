import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Eye, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { TranslatedInput } from "@/components/cms/TranslatedInput";
import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import type { Translated } from "@/types/domain";

import {
  CONTENT_TYPE_BY_KEY,
  type ContentField,
  type ContentRecord,
} from "./contentTypes";

type Values = Record<string, unknown>;

export default function ContentEditor() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);

  const config = type ? CONTENT_TYPE_BY_KEY.get(type) : undefined;
  const isNew = id === "new";

  const [values, setValues] = useState<Values>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: record, isLoading } = useQuery({
    queryKey: ["cms", type, id],
    queryFn: async () => {
      const { data } = await api.get<ContentRecord>(
        `/cms/${config!.endpoint}/${id}/`,
      );
      return data;
    },
    enabled: Boolean(config) && !isNew,
  });

  useEffect(() => {
    if (record) setValues(record as Values);
  }, [record]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...values };
      // Never send server-managed fields back.
      for (const key of [
        "id",
        "created_at",
        "updated_at",
        "missing_translations",
        "published_at",
        "views",
      ]) {
        delete payload[key];
      }
      if (isNew) {
        payload.status ??= "draft";
        const { data } = await api.post<ContentRecord>(
          `/cms/${config!.endpoint}/`,
          payload,
        );
        return data;
      }
      const { data } = await api.patch<ContentRecord>(
        `/cms/${config!.endpoint}/${id}/`,
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      setFieldErrors({});
      setFormError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void queryClient.invalidateQueries({ queryKey: ["cms", type] });
      if (isNew) {
        const lookup =
          config!.lookup === "slug" ? (data.slug ?? data.id) : data.id;
        navigate(`/mis/cms/${type}/${lookup}`, { replace: true });
      }
    },
    onError: (error) => handleApiError(error, setFieldErrors, setFormError),
  });

  const publish = useMutation({
    mutationFn: () =>
      api.post(`/cms/${config!.endpoint}/${id}/publish/`),
    onSuccess: () => {
      setFieldErrors({});
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["cms", type, id] });
      void queryClient.invalidateQueries({ queryKey: ["cms", type] });
    },
    onError: (error) => handleApiError(error, setFieldErrors, setFormError),
  });

  const unpublish = useMutation({
    mutationFn: () => api.post(`/cms/${config!.endpoint}/${id}/unpublish/`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cms", type, id] });
      void queryClient.invalidateQueries({ queryKey: ["cms", type] });
    },
  });

  if (!config) return <Navigate to="/mis" replace />;
  if (!hasPermission(config.permission)) {
    return (
      <p className="py-16 text-center text-sm text-ink-500">
        You do not have permission to edit this content.
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
        to={`/mis/cms/${config.key}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {config.label}
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold">
            {isNew ? `New ${config.singular.toLowerCase()}` : config.singular}
          </h1>
          {!isNew && (
            <Badge
              dot
              tone={isPublished ? "success" : "neutral"}
              label={isPublished ? "Published" : "Draft"}
            />
          )}
        </div>

        {!isNew && (
          <div className="flex gap-2">
            {isPublished ? (
              <Button
                variant="outline"
                size="sm"
                loading={unpublish.isPending}
                onClick={() => unpublish.mutate()}
              >
                Unpublish
              </Button>
            ) : (
              <Button
                variant="accent"
                size="sm"
                icon={<Eye className="size-3.5" />}
                loading={publish.isPending}
                onClick={() => publish.mutate()}
              >
                Publish
              </Button>
            )}
          </div>
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
        {config.fields.map((field) => (
          <FieldControl
            key={field.name}
            field={field}
            value={values[field.name]}
            error={fieldErrors[field.name]}
            onChange={(value) => setField(field.name, value)}
          />
        ))}

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
            {isPublished ? "Changes are live immediately." : "Saved as a draft."}
          </p>
        </div>
      </form>
    </div>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
}: {
  field: ContentField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  if (field.translated) {
    return (
      <TranslatedInput
        label={field.label}
        value={value as Translated | undefined}
        onChange={onChange}
        multiline={field.kind === "textarea"}
        rows={field.rows}
        required={field.required}
        hint={field.hint}
        error={error}
      />
    );
  }

  if (field.kind === "textarea") {
    return (
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink-700">
          {field.label}
        </label>
        <textarea
          rows={field.rows ?? 4}
          value={(value as string) ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const inputType =
    field.kind === "date"
      ? "date"
      : field.kind === "datetime"
        ? "datetime-local"
        : field.kind === "number"
          ? "number"
          : "text";

  return (
    <Field
      label={field.label}
      type={inputType}
      required={field.required}
      hint={field.hint}
      error={error}
      value={formatForInput(value, field.kind)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Trim an ISO timestamp to what datetime-local accepts. */
function formatForInput(value: unknown, kind: ContentField["kind"]) {
  if (typeof value !== "string") return (value as string | number | undefined) ?? "";
  if (kind === "datetime" && value.length > 16) return value.slice(0, 16);
  if (kind === "date" && value.length > 10) return value.slice(0, 10);
  return value;
}

/** Split DRF's field errors out of the response so each lands on its input. */
function handleApiError(
  error: unknown,
  setFieldErrors: (value: Record<string, string>) => void,
  setFormError: (value: string | null) => void,
) {
  const data = (error as { response?: { data?: unknown } }).response?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    const fields: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (key === "detail") continue;
      const message = Array.isArray(value) ? String(value[0]) : String(value);
      fields[key] = message;
    }
    if (Object.keys(fields).length > 0) {
      setFieldErrors(fields);
      setFormError("Please correct the highlighted fields.");
      return;
    }
  }
  setFieldErrors({});
  setFormError(apiErrorMessage(error, "Could not save."));
}

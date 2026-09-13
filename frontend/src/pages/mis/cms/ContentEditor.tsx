import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { TranslatedInput } from "@/components/cms/TranslatedInput";
import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import { mediaUrl } from "@/lib/cms";
import { useAuth } from "@/stores/auth";
import type { Translated } from "@/types/domain";

import {
  CONTENT_TYPE_BY_KEY,
  type ContentField,
  type ContentRecord,
} from "./contentTypes";

type Values = Record<string, unknown>;

/** Apply a field's conditional label and hint against the current values. */
function resolveField(field: ContentField, values: Values): ContentField {
  if (!field.labelWhen && !field.hintWhen) return field;
  const resolved = { ...field };
  if (field.labelWhen) {
    const key = String(values[field.labelWhen.field] ?? "");
    resolved.label = field.labelWhen.is[key] ?? field.label;
  }
  if (field.hintWhen) {
    const key = String(values[field.hintWhen.field] ?? "");
    resolved.hint = field.hintWhen.is[key] ?? field.hint;
  }
  return resolved;
}

export default function ContentEditor() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);
  const { toast } = useToast();

  const config = type ? CONTENT_TYPE_BY_KEY.get(type) : undefined;
  const isNew = id === "new";

  const [values, setValues] = useState<Values>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

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
    if (!record) return;
    // Seed the form-only selectors from what the record actually holds, so an
    // existing video opens on the video side rather than defaulting to photo.
    const seeded = { ...(record as Values) };
    if (config?.fields.some((field) => field.name === "media_kind")) {
      seeded.media_kind = record.video || record.video_url ? "video" : "image";
    }
    setValues(seeded);
  }, [record, config]);

  // A new record has nothing to seed from, so start on the photo side.
  useEffect(() => {
    if (!isNew) return;
    if (!config?.fields.some((field) => field.name === "media_kind")) return;
    setValues((previous) =>
      previous.media_kind ? previous : { ...previous, media_kind: "image" },
    );
  }, [isNew, config]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...values };

      // Picking "Photo" must actually clear a video the item used to carry,
      // otherwise the API still sees a video_url and keeps rendering it as
      // one. Empty string is what the serializer accepts for "no value".
      if (payload.media_kind === "image") {
        payload.video = "";
        payload.video_url = "";
      }

      // Form-only controls steer the fields above; the API has no such column.
      for (const field of config!.fields) {
        if (field.local) delete payload[field.name];
      }

      // Saving is the whole job: what you submit goes live, with no second
      // step. Taking something down again is the eye control in the list, or
      // Unpublish here.
      payload.status = "published";

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
      // An untouched media field still holds the URL the API returned. Sending
      // that back — as a string in JSON or in a multipart body — is rejected
      // with "The submitted data was not a file", so drop every media field
      // that does not carry a newly picked File.
      const mediaFields = config!.fields
        .filter((field) => field.kind === "image" || field.kind === "video")
        .map((field) => field.name);

      for (const name of mediaFields) {
        // An explicit "" is a deliberate clear (see media_kind above) and must
        // reach the API; only untouched URL values are dropped.
        if (payload[name] === "") continue;
        if (!(payload[name] instanceof File)) {
          delete payload[name];
        }
      }

      // A picked file forces multipart; everything else stays JSON so the
      // translated fields keep their object shape.
      const hasFile = Object.values(payload).some((item) => item instanceof File);

      let body: unknown = payload;
      if (hasFile) {
        const form = new FormData();
        for (const [key, item] of Object.entries(payload)) {
          if (item === null || item === undefined) continue;
          if (item instanceof File) {
            form.append(key, item);
          } else if (typeof item === "object") {
            // Translated values travel as JSON inside the multipart body.
            form.append(key, JSON.stringify(item));
          } else {
            form.append(key, String(item));
          }
        }
        body = form;
      }

      if (isNew) {
        const { data } = await api.post<ContentRecord>(
          `/cms/${config!.endpoint}/`,
          body,
        );
        return data;
      }
      const { data } = await api.patch<ContentRecord>(
        `/cms/${config!.endpoint}/${id}/`,
        body,
      );
      return data;
    },
    onSuccess: () => {
      setFieldErrors({});
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["cms", type] });
      // Saving finishes the job, so leave the form: the list is where you can
      // see the change landed. The toast carries the confirmation across the
      // navigation, which an inline banner on the abandoned page could not.
      toast(`${config!.singular} saved. It is live on the public site.`);
      navigate(`/mis/cms/${type}`);
    },
    onError: (error) => handleApiError(error, setFieldErrors, setFormError),
  });

  const unpublish = useMutation({
    mutationFn: () => api.post(`/cms/${config!.endpoint}/${id}/unpublish/`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cms", type, id] });
      void queryClient.invalidateQueries({ queryKey: ["cms", type] });
      toast("Unpublished. It is hidden from the public site.");
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
    <div className="mx-auto max-w-6xl space-y-6">
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

        {/* Publishing is no longer a separate step — saving does it. Only the
            way back down is offered here. */}
        {!isNew && isPublished && (
          <Button
            variant="outline"
            size="sm"
            loading={unpublish.isPending}
            onClick={() => unpublish.mutate()}
          >
            Unpublish
          </Button>
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
        {config.fields
          .filter(
            (field) =>
              !field.showWhen ||
              values[field.showWhen.field] === field.showWhen.equals,
          )
          .map((field) => (
            <FieldControl
              key={field.name}
              field={resolveField(field, values)}
              value={values[field.name]}
              error={fieldErrors[field.name]}
              onChange={(value) => setField(field.name, value)}
            />
          ))}

        <div className="flex items-center gap-3 border-t border-ink-200 pt-5">
          <Button type="submit" icon={<Save className="size-4" />} loading={save.isPending}>
            {isNew ? "Create" : "Save changes"}
          </Button>
          <p className="ml-auto text-xs text-ink-500">
            Saving publishes straight to the public site.
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

  if (field.kind === "image" || field.kind === "video") {
    return (
      <MediaField
        field={field}
        value={value}
        error={error}
        onChange={onChange}
      />
    );
  }

  if (field.kind === "select") {
    return (
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-ink-700">
          {field.label}
        </label>
        <select
          value={(value as string) ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
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

/**
 * Uploading a picture or a video, with what is already there shown above it.
 *
 * The stored value is a URL string until someone picks a file, at which point
 * it becomes a File and the form switches to multipart.
 */
function MediaField({
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
  const isVideo = field.kind === "video";
  const picked = value instanceof File ? value : null;
  const existing = typeof value === "string" && value ? value : null;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink-700">
        {field.label}
        {field.required && (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>

      {picked ? (
        <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
          <Check className="size-3.5 shrink-0" aria-hidden />
          {picked.name} — saved when you press Save.
        </p>
      ) : existing ? (
        <div className="flex items-center gap-3">
          {isVideo ? (
            <video
              src={mediaUrl(existing)}
              className="h-20 w-32 rounded-lg border border-ink-200 object-cover"
              muted
            />
          ) : (
            <img
              src={mediaUrl(existing)}
              alt=""
              className="h-20 w-32 rounded-lg border border-ink-200 object-cover"
            />
          )}
          <span className="text-xs text-ink-500">
            Currently in use. Choose a file to replace it.
          </span>
        </div>
      ) : null}

      <input
        type="file"
        accept={isVideo ? "video/mp4,video/webm" : "image/*"}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
      />

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : field.hint ? (
        <p className="text-xs text-ink-500">{field.hint}</p>
      ) : null}
    </div>
  );
}

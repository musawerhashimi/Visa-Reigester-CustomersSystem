import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { TranslatedInput } from "@/components/cms/TranslatedInput";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import type { CompanyInfo } from "@/lib/cms";
import { useAuth } from "@/stores/auth";
import type { Translated } from "@/types/domain";

/**
 * Company settings (section 44).
 *
 * Only the details that belong in a database live here. Mail server
 * credentials, timezone and upload limits stay in environment variables —
 * putting SMTP passwords behind a web form would place them in the database
 * and in every backup.
 */
export default function Settings() {
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);
  const canManage = hasPermission("cms.pages.manage");

  const [form, setForm] = useState<Partial<CompanyInfo>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mis", "company"],
    queryFn: async () => {
      const { data } = await api.get<CompanyInfo>("/cms/company/");
      return data;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch("/cms/company/", {
        name: form.name,
        description: form.description,
        working_hours: form.working_hours,
        address: form.address,
        phone: form.phone,
        email: form.email,
        website: form.website,
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void queryClient.invalidateQueries({ queryKey: ["mis", "company"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "company"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not save the settings.")),
  });

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-ink-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          Company details used across the public site, emails and documents.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!canManage && (
        <p className="rounded-lg bg-ink-100 px-3.5 py-3 text-sm text-ink-600">
          You can view these settings but not change them.
        </p>
      )}

      <form
        className="card space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">Company</h2>

        <TranslatedInput
          label="Company name"
          required
          value={form.name as Translated | undefined}
          onChange={(value) => setForm((f) => ({ ...f, name: value }))}
        />

        <TranslatedInput
          label="Description"
          multiline
          rows={3}
          value={form.description as Translated | undefined}
          onChange={(value) => setForm((f) => ({ ...f, description: value }))}
          hint="Shown under the heading on the public About page."
        />

        <TranslatedInput
          label="Working hours"
          multiline
          rows={3}
          value={form.working_hours as Translated | undefined}
          onChange={(value) => setForm((f) => ({ ...f, working_hours: value }))}
        />

        <div className="space-y-1.5">
          <label htmlFor="company-address" className="block text-sm font-medium text-ink-700">
            Address
          </label>
          <textarea
            id="company-address"
            rows={2}
            value={form.address ?? ""}
            onChange={(event) =>
              setForm((f) => ({ ...f, address: event.target.value }))
            }
            className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Phone"
            value={form.phone ?? ""}
            onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))}
          />
          <Field
            label="Email"
            type="email"
            value={form.email ?? ""}
            onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
            hint="Where customer enquiries are directed."
          />
        </div>

        <Field
          label="Website"
          type="url"
          value={form.website ?? ""}
          onChange={(event) => setForm((f) => ({ ...f, website: event.target.value }))}
        />

        {canManage && (
          <div className="flex items-center gap-3 border-t border-ink-200 pt-5">
            <Button type="submit" loading={save.isPending}>
              Save settings
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <Check className="size-4" aria-hidden />
                Saved
              </span>
            )}
          </div>
        )}
      </form>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-ink-400" aria-hidden />
          Configured by your administrator
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          These are set in the server environment rather than here, so
          credentials never enter the database or its backups.
        </p>
        <dl className="mt-4 space-y-2.5 text-sm">
          {[
            ["Mail server", "Host, port and credentials for sending email"],
            ["Application prefix", "The reference format, e.g. VISA-2026-000001"],
            ["Upload limits", "Maximum file size and accepted document types"],
            ["Timezone and currency", "Used for dates and amounts throughout"],
          ].map(([label, detail]) => (
            <div key={label} className="flex flex-wrap gap-x-3">
              <dt className="w-44 shrink-0 font-medium text-ink-700">{label}</dt>
              <dd className="min-w-0 flex-1 text-ink-500">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { TranslatedInput } from "@/components/cms/TranslatedInput";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import type { CompanyInfo } from "@/lib/cms";
import { useAuth } from "@/stores/auth";
import type { Translated } from "@/types/domain";

/**
 * Company settings (section 44).
 *
 * Company details, and the mail server the office sends from. The SMTP
 * password is the one secret kept here; it is encrypted before storage and
 * never returned by the API. Timezone and upload limits stay in environment
 * variables.
 */
export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasPermission = useAuth((state) => state.hasPermission);
  const canManage = hasPermission("cms.pages.manage");

  const [form, setForm] = useState<Partial<CompanyInfo>>({});
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
        sending_email: form.sending_email,
        website: form.website,
      }),
    onSuccess: () => {
      setError(null);
      // Settings is a single page with nowhere to return to, so it stays put
      // and only confirms.
      toast("Settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["mis", "company"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "company"] });
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not save the settings.")),
  });

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-ink-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
          </div>
        )}
      </form>

      <MailServerCard canManage={canManage} />

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-ink-400" aria-hidden />
          Also configured by your administrator
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          These are set in the server environment rather than here, so
          credentials never enter the database or its backups.
        </p>
        <dl className="mt-4 space-y-2.5 text-sm">
          {[
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

/**
 * The mail server the office sends from.
 *
 * Kept in its own form and mutation: it saves independently of the company
 * details, and it is the one place in the MIS that takes a password. The
 * password is write-only — the API never sends it back — so the field shows
 * whether one is stored rather than its value.
 */
function MailServerCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<Partial<CompanyInfo>>({});
  const [password, setPassword] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
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
        sending_email: form.sending_email,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port === undefined ? null : form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_use_tls: form.smtp_use_tls,
        smtp_enabled: form.smtp_enabled,
        // Omitted unless retyped, so saving other fields keeps the stored one.
        ...(password === null ? {} : { smtp_password: password }),
      }),
    onSuccess: () => {
      setError(null);
      setPassword(null);
      toast("Mail server saved.");
      void queryClient.invalidateQueries({ queryKey: ["mis", "company"] });
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not save the mail server.")),
  });

  const sendTest = useMutation({
    mutationFn: () => api.post("/cms/mail-test/", { email: testTo }),
    onSuccess: (response) => {
      setError(null);
      toast(response.data?.detail ?? "Test email sent.");
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "The test email could not be sent.")),
  });

  const storedPassword = Boolean(data?.smtp_password_set);

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="size-4 text-ink-400" aria-hidden />
        Mail server
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        Where automatic emails to customers are sent from. The password is
        encrypted before it is stored and is never shown again.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field
          label="Sending address"
          type="email"
          value={form.sending_email ?? ""}
          onChange={(event) =>
            setForm((f) => ({ ...f, sending_email: event.target.value }))
          }
          hint="What customers see in the From line."
          disabled={!canManage}
        />

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field
            label="Host"
            value={form.smtp_host ?? ""}
            onChange={(event) =>
              setForm((f) => ({ ...f, smtp_host: event.target.value }))
            }
            hint="e.g. smtp.gmail.com"
            disabled={!canManage}
          />
          <Field
            label="Port"
            type="number"
            value={form.smtp_port ?? ""}
            onChange={(event) =>
              setForm((f) => ({
                ...f,
                smtp_port: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
            hint="587"
            disabled={!canManage}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Username"
            value={form.smtp_username ?? ""}
            onChange={(event) =>
              setForm((f) => ({ ...f, smtp_username: event.target.value }))
            }
            hint="Usually the full email address."
            disabled={!canManage}
          />

          {password === null && storedPassword ? (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ink-700">
                Password
              </label>
              <div className="flex items-center gap-2">
                <p className="flex-1 rounded-lg bg-ink-100 px-3 py-2.5 text-sm text-ink-500">
                  •••••••• saved
                </p>
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPassword("")}
                  >
                    Change
                  </Button>
                )}
              </div>
              <p className="text-xs text-ink-500">
                Stored encrypted. It cannot be displayed again.
              </p>
            </div>
          ) : (
            <Field
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password ?? ""}
              onChange={(event) => setPassword(event.target.value)}
              hint="For Gmail this is an App Password, not the account password."
              disabled={!canManage}
            />
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.smtp_use_tls ?? true}
            onChange={(event) =>
              setForm((f) => ({ ...f, smtp_use_tls: event.target.checked }))
            }
            disabled={!canManage}
            className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
          />
          Use TLS (port 587). Turn off for implicit SSL on port 465.
        </label>

        <label className="flex items-start gap-2 rounded-lg bg-ink-50 p-3.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.smtp_enabled ?? false}
            onChange={(event) =>
              setForm((f) => ({ ...f, smtp_enabled: event.target.checked }))
            }
            disabled={!canManage}
            className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
          />
          <span>
            <span className="font-medium">Send through this server</span>
            <span className="mt-0.5 block text-xs text-ink-500">
              While this is off, emails are written to the server log and no
              customer receives anything.
            </span>
          </span>
        </label>

        {canManage && (
          <div className="flex flex-wrap items-end gap-3 border-t border-ink-200 pt-5">
            <Button type="submit" loading={save.isPending}>
              Save mail server
            </Button>

            <div className="flex items-end gap-2">
              <Field
                label="Send a test to"
                type="email"
                placeholder="you@example.com"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                className="w-56"
              />
              <Button
                type="button"
                variant="outline"
                loading={sendTest.isPending}
                disabled={!testTo}
                onClick={() => sendTest.mutate()}
              >
                Send test
              </Button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}

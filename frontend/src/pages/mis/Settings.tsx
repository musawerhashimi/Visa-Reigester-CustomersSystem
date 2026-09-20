import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Image as ImageIcon, Info, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { TranslatedInput } from "@/components/cms/TranslatedInput";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, apiErrorMessage } from "@/lib/api";
import { mediaUrl, type CompanyInfo } from "@/lib/cms";
import { useAuth } from "@/stores/auth";
import type { Translated } from "@/types/domain";

/** The settings form's working copy: a picked image is a File until saved. */
type CompanyDraft = Omit<Partial<CompanyInfo>, "logo" | "about_image"> & {
  logo?: CompanyInfo["logo"] | File;
  about_image?: CompanyInfo["about_image"] | File;
};

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
  const seesAllBranches = useAuth((state) => state.user?.sees_all_branches ?? false);
  // These settings are company-wide — the details, the logo, and the mail
  // server every office sends through. A branch configures its own mail on
  // its branch record instead.
  const canManage = hasPermission("cms.pages.manage") && seesAllBranches;

  // Images become a File as soon as one is chosen, so the draft is widened
  // from CompanyInfo's string | null.
  const [form, setForm] = useState<CompanyDraft>({});
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
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        working_hours: form.working_hours,
        history: form.history,
        mission: form.mission,
        vision: form.vision,
        values: form.values,
        goals: form.goals,
        address: form.address,
        phone: form.phone,
        email: form.email,
        sending_email: form.sending_email,
        website: form.website,
      };

      // An untouched image field still holds the URL the API returned.
      // Sending that back is rejected with "The submitted data was not a
      // file", so only a newly picked File is included.
      for (const field of ["logo", "about_image"] as const) {
        if (form[field] instanceof File) payload[field] = form[field];
      }

      const hasFile = Object.values(payload).some((item) => item instanceof File);

      // A picked file forces multipart; otherwise the body stays JSON so the
      // translated fields keep their object shape. Inside multipart they
      // travel as JSON strings instead.
      let body: FormData | Record<string, unknown> = payload;
      if (hasFile) {
        const form = new FormData();
        for (const [key, item] of Object.entries(payload)) {
          if (item === null || item === undefined) continue;
          if (item instanceof File) form.append(key, item);
          else if (typeof item === "object") form.append(key, JSON.stringify(item));
          else form.append(key, String(item));
        }
        body = form;
      }

      return api.patch("/cms/company/", body);
    },
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

  // Reached by typing the URL, since the sidebar link is hidden. Showing the
  // company's configuration read-only would still expose it, so the page says
  // where the branch's own settings live instead.
  if (!seesAllBranches) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <Building2 className="mx-auto size-8 text-ink-300" aria-hidden />
        <h1 className="mt-3 font-display text-xl font-bold">
          Managed by the general branch
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          These are company-wide settings. Your branch's own email address and
          mail server are set on the Branches page.
        </p>
        <Link
          to="/mis/branches"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-ink-300 px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
        >
          Go to Branches
        </Link>
      </div>
    );
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
          {seesAllBranches
            ? "You can view these settings but not change them."
            : "These are company-wide settings, managed by the general branch. Your branch's own email is set on the Branches page."}
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

        <ImageField
          label="Logo"
          hint="Shown in the header, footer and on the sign-in page."
          value={form.logo}
          onChange={(file) => setForm((f) => ({ ...f, logo: file }))}
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

        {/* Everything the public About page renders. Each one hides itself on
            the site when left blank, so the page can be filled in over time. */}
        <fieldset className="space-y-5 rounded-lg border border-ink-200 p-4">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            About page
          </legend>

          <TranslatedInput
            label="Our story"
            multiline
            rows={6}
            value={form.history as Translated | undefined}
            onChange={(value) => setForm((f) => ({ ...f, history: value }))}
            hint="The opening section. Blank lines start a new paragraph."
          />

          <TranslatedInput
            label="Mission"
            multiline
            rows={4}
            value={form.mission as Translated | undefined}
            onChange={(value) => setForm((f) => ({ ...f, mission: value }))}
          />

          <TranslatedInput
            label="Vision"
            multiline
            rows={4}
            value={form.vision as Translated | undefined}
            onChange={(value) => setForm((f) => ({ ...f, vision: value }))}
          />

          <TranslatedInput
            label="Values"
            multiline
            rows={4}
            value={form.values as Translated | undefined}
            onChange={(value) => setForm((f) => ({ ...f, values: value }))}
          />

          <TranslatedInput
            label="Goals"
            multiline
            rows={4}
            value={form.goals as Translated | undefined}
            onChange={(value) => setForm((f) => ({ ...f, goals: value }))}
          />

          <ImageField
            label="About page photograph"
            hint="Your office or team. Shown across the top of the About page."
            value={form.about_image}
            onChange={(file) => setForm((f) => ({ ...f, about_image: file }))}
          />
        </fieldset>

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
/**
 * Picking an image, with the current one shown back.
 *
 * `value` is whatever the form holds: the URL the API returned, or a File the
 * moment one is chosen. Showing the picture rather than a filename is what
 * makes a wrong upload obvious before it is saved.
 */
function ImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string | File | null | undefined;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const chosen = value instanceof File ? value : null;
  const existing = typeof value === "string" ? mediaUrl(value) : undefined;
  const shown = preview ?? existing;

  function choose(file: File | null) {
    // Each object URL pins the file in memory until revoked, so the previous
    // one goes as soon as it is replaced.
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
    onChange(file);
    if (!file && inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-ink-700">{label}</span>

      <div className="flex flex-wrap items-center gap-4">
        {shown ? (
          <img
            src={shown}
            alt=""
            className="size-20 rounded-lg border border-ink-200 object-contain"
          />
        ) : (
          <span className="grid size-20 place-items-center rounded-lg border border-dashed border-ink-300 text-ink-300">
            <ImageIcon className="size-6" aria-hidden />
          </span>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            {shown ? "Replace" : "Choose image"}
          </Button>
          {chosen && (
            <Button type="button" size="sm" variant="ghost" onClick={() => choose(null)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {chosen && (
        <p className="text-xs text-ink-500">
          {chosen.name} — saved when you press Save changes.
        </p>
      )}
      {hint && !chosen && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}


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

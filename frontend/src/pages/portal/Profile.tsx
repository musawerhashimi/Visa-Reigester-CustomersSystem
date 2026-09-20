import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import type { User } from "@/types/domain";

export default function PortalProfile() {
  const { t } = useTranslation();
  const storedUser = useAuth((state) => state.user);
  const loadSession = useAuth((state) => state.loadSession);

  const [values, setValues] = useState({
    first_name: "",
    last_name: "",
    phone: "",
  });
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: async () => {
      const { data } = await api.get<User>("/auth/me/");
      return data;
    },
    initialData: storedUser ?? undefined,
  });

  useEffect(() => {
    if (profile) {
      setValues({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        phone: profile.phone ?? "",
      });
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: () => api.patch<User>("/auth/me/", values),
    onSuccess: async () => {
      setError(null);
      setStatus("saved");
      // Refresh the store so the header greeting updates immediately.
      await loadSession();
      setTimeout(() => setStatus("idle"), 2500);
    },
    onError: (err) => {
      setStatus("idle");
      setError(apiErrorMessage(err, "Could not save your profile."));
    },
  });

  const changePassword = useChangePassword();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-bold">{t("portal.profile")}</h1>

      <section className="card p-6">
        <h2 className="text-sm font-semibold">{t("portal.yourDetails")}</h2>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("auth.firstName")}
              value={values.first_name}
              onChange={(event) =>
                setValues((v) => ({ ...v, first_name: event.target.value }))
              }
            />
            <Field
              label={t("auth.lastName")}
              value={values.last_name}
              onChange={(event) =>
                setValues((v) => ({ ...v, last_name: event.target.value }))
              }
            />
          </div>

          <Field
            label={t("auth.phone")}
            value={values.phone}
            onChange={(event) =>
              setValues((v) => ({ ...v, phone: event.target.value }))
            }
          />

          {/* Email is the login identifier and is verified, so it is shown
              read-only rather than silently ignored on save. */}
          <Field
            label={t("auth.email")}
            value={profile?.email ?? ""}
            readOnly
            disabled
            hint="Contact us if you need to change your email address."
          />

          <div className="flex items-center gap-3">
            <Button type="submit" loading={save.isPending}>
              {t("common.save")}
            </Button>
            {status === "saved" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <Check className="size-4" aria-hidden />
                Saved
              </span>
            )}
          </div>
        </form>
      </section>

      {changePassword.element}
    </div>
  );
}

function useChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/auth/change-password/", {
        current_password: current,
        new_password: next,
      }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setMessage({ ok: true, text: "Your password has been updated." });
    },
    onError: (error) =>
      setMessage({
        ok: false,
        text: apiErrorMessage(error, "Could not change your password."),
      }),
  });

  const element = (
    <section className="card p-6">
      <h2 className="text-sm font-semibold">Password</h2>

      {message && (
        <p
          role="alert"
          className={
            message.ok
              ? "mt-4 rounded-lg bg-success-soft px-3 py-2 text-sm text-success"
              : "mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          }
        >
          {message.text}
        </p>
      )}

      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          required
          onChange={(event) => setCurrent(event.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          required
          hint="At least 10 characters."
          onChange={(event) => setNext(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          loading={mutation.isPending}
          disabled={!current || !next}
        >
          Update password
        </Button>
      </form>
    </section>
  );

  return { element };
}

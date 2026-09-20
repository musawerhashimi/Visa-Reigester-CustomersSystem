import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, Lock, Mail, User } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { CompanyBrand } from "@/components/layout/CompanyBrand";
import { useCompanyName } from "@/components/layout/useCompanyName";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";

const schema = z
  .object({
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    phone: z.string().optional(),
    password: z.string().min(10, "Use at least 10 characters"),
    confirm_password: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "The two passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export default function Signup() {
  const { t } = useTranslation();
  const companyName = useCompanyName();
  const navigate = useNavigate();
  const login = useAuth((state) => state.login);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await api.post("/auth/register/", values);
      // Sign them straight in: making someone re-type credentials they just
      // chose is friction with no security benefit.
      await login(values.email, values.password);
      navigate("/portal/applications/new", { replace: true });
    } catch (error) {
      setFormError(apiErrorMessage(error, "Could not create your account."));
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden isolate overflow-hidden bg-brand-950 lg:block">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(45rem 38rem at 15% -5%, oklch(0.56 0.152 260 / 0.55), transparent 62%), radial-gradient(38rem 32rem at 85% 95%, oklch(0.75 0.162 68 / 0.22), transparent 58%), radial-gradient(30rem 28rem at 70% 25%, oklch(0.40 0.126 262 / 0.5), transparent 60%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/">
            <CompanyBrand tone="light" />
          </Link>

          <div>
            <h2 className="max-w-md font-display text-3xl font-bold leading-tight text-white">
              {t("auth.signupPanelTitle")}
            </h2>
            <ul className="mt-6 space-y-3 text-brand-200">
              {["auth.signupPerk1", "auth.signupPerk2", "auth.signupPerk3"].map(
                (key) => (
                  <li key={key} className="flex items-center gap-2.5">
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-accent-500"
                      aria-hidden
                    />
                    {t(key)}
                  </li>
                ),
              )}
            </ul>
          </div>

          <p className="text-xs text-brand-400">
            © {new Date().getFullYear()} {companyName}
          </p>
        </div>
      </aside>

      <main className="relative isolate flex items-center justify-center px-4 py-12 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(34rem 26rem at 100% 0%, oklch(0.56 0.152 260 / 0.10), transparent 60%), radial-gradient(30rem 24rem at 0% 100%, oklch(0.75 0.162 68 / 0.10), transparent 62%)",
          }}
        />
        <div className="w-full max-w-md">
          {/* The brand panel's own logo links home, but it is hidden below
              lg — and a labelled control says where it goes, which a logo
              alone does not. */}
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("auth.backToSite")}
          </Link>

          <Link to="/" className="mb-8 block lg:hidden">
            <CompanyBrand />
          </Link>

          <div className="card p-6 shadow-lifted sm:p-8">
            <h1 className="font-display text-2xl font-bold">{t("auth.signupTitle")}</h1>
            <p className="mt-2 text-sm text-ink-500">{t("auth.signupSubtitle")}</p>

            {formError && (
              <div
                role="alert"
                className="mt-6 flex gap-2.5 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger ring-1 ring-inset ring-danger/20"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("auth.firstName")}
                autoComplete="given-name"
                required
                icon={<User className="size-4" aria-hidden />}
                error={errors.first_name?.message}
                {...register("first_name")}
              />
              <Field
                label={t("auth.lastName")}
                autoComplete="family-name"
                required
                error={errors.last_name?.message}
                {...register("last_name")}
              />
            </div>

            <Field
              label={t("auth.email")}
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              icon={<Mail className="size-4" aria-hidden />}
              error={errors.email?.message}
              {...register("email")}
            />

            <Field
              label={t("auth.phone")}
              type="tel"
              autoComplete="tel"
              placeholder="+49 30 1234567"
              error={errors.phone?.message}
              {...register("phone")}
            />

            <Field
              label={t("auth.password")}
              type="password"
              autoComplete="new-password"
              required
              hint="At least 10 characters."
              icon={<Lock className="size-4" aria-hidden />}
              error={errors.password?.message}
              {...register("password")}
            />

            <Field
              label={t("auth.confirmPassword")}
              type="password"
              autoComplete="new-password"
              required
              icon={<Lock className="size-4" aria-hidden />}
              error={errors.confirm_password?.message}
              {...register("confirm_password")}
            />

            <p className="text-xs leading-relaxed text-ink-500">
              {t("auth.signupPrivacyNote")}
            </p>

            <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
              {t("auth.submitSignup")}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-ink-500">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              {t("auth.submitLogin")}
            </Link>
          </p>
          </div>

          {/* The dark panel carrying the copyright is hidden below lg, so on a
              phone the page would otherwise end with no company name at all. */}
          <p className="mt-10 text-center text-xs text-ink-400 lg:hidden">
            © {new Date().getFullYear()} {companyName}
          </p>
        </div>
      </main>
    </div>
  );
}

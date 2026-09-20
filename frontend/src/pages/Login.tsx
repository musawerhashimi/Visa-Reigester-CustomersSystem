import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { CompanyBrand } from "@/components/layout/CompanyBrand";
import { useCompanyName } from "@/components/layout/useCompanyName";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { t } = useTranslation();
  const companyName = useCompanyName();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useAuth((state) => state.login);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    resetField,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const user = await login(values.email, values.password);
      // Staff land in the MIS, customers in their portal; an explicit ?next
      // from an expired session wins over both.
      const next = params.get("next");
      const fallback = user.role === "customer" ? "/portal" : "/mis";
      navigate(next ?? fallback, { replace: true });
    } catch (error) {
      setFormError(apiErrorMessage(error, "Could not sign you in."));
      // The server answers a bad sign-in with one generic error and never
      // says which field was wrong, so only the password is cleared: the
      // email is almost always right, and wiping it means retyping it on
      // every attempt.
      resetField("password");
      setFocus("password");
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel — hidden on small screens where it would only push the
          form below the fold. */}
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
              {t("auth.loginPanelTitle")}
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-brand-200">
              {t("auth.loginPanelBody")}
            </p>
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
        <div className="w-full max-w-sm">
          {/* The brand panel's own logo links home, but it is hidden below
              lg — and a labelled control says where it goes, which a logo
              alone does not. A bordered pill reads as a control rather than
              as stray text above the form. */}
          <Link
            to="/"
            className="group mb-6 inline-flex items-center gap-1.5 rounded-full lg:mb-8 border border-ink-200 bg-white/70 py-1.5 pl-2.5 pr-3.5 text-sm font-medium text-ink-600 shadow-subtle backdrop-blur-sm transition-colors hover:border-ink-300 hover:text-ink-900"
          >
            <ArrowLeft
              className="size-4 transition-transform group-hover:-translate-x-0.5"
              aria-hidden
            />
            {t("auth.backToSite")}
          </Link>

          {/* Centred below lg, where the brand panel is hidden and this is the
              only thing identifying whose site this is. */}
          <Link to="/" className="mb-8 flex justify-center lg:hidden">
            <CompanyBrand size="lg" />
          </Link>

          <div className="card p-6 shadow-lifted sm:p-8">
            {/* Centred to match the brand mark above it on narrow screens;
                left-aligned from lg, where the brand panel carries the
                identity and the form is simply a form. */}
            <h1 className="text-center font-display text-2xl font-bold lg:text-left">
              {t("auth.loginTitle")}
            </h1>
            <p className="mt-2 text-center text-sm text-ink-500 lg:text-left">
              {t("auth.loginSubtitle")}
            </p>

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
            <Field
              label={t("auth.email")}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              icon={<Mail className="size-4" aria-hidden />}
              error={errors.email?.message}
              {...register("email")}
            />

            <Field
              label={t("auth.password")}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              icon={<Lock className="size-4" aria-hidden />}
              error={errors.password?.message}
              {...register("password")}
            />

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-sm text-ink-600">
                <input
                  type="checkbox"
                  className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30"
                />
                {t("auth.rememberMe")}
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
              {t("auth.submitLogin")}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-ink-500">
            {t("auth.noAccount")}{" "}
            <Link
              to="/signup"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              {t("auth.submitSignup")}
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

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Lock, Mail, Plane } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

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
  const navigate = useNavigate();
  const [params] = useSearchParams();
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
      const user = await login(values.email, values.password);
      // Staff land in the MIS, customers in their portal; an explicit ?next
      // from an expired session wins over both.
      const next = params.get("next");
      const fallback = user.role === "customer" ? "/portal" : "/mis";
      navigate(next ?? fallback, { replace: true });
    } catch (error) {
      setFormError(apiErrorMessage(error, "Could not sign you in."));
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
              "radial-gradient(50rem 40rem at 20% 0%, oklch(0.48 0.148 261 / 0.6), transparent 60%), radial-gradient(40rem 30rem at 80% 90%, oklch(0.75 0.162 68 / 0.16), transparent 55%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-white/10">
              <Plane className="size-5 text-white" aria-hidden />
            </span>
            <span className="font-display text-[17px] font-bold text-white">
              VisaCare
            </span>
          </Link>

          <div>
            <h2 className="max-w-md font-display text-3xl font-bold leading-tight text-white">
              Everything about your application, in one place.
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-brand-200">
              Check your status, upload what your officer asked for, and download
              your receipts and approval documents.
            </p>
          </div>

          <p className="text-xs text-brand-400">
            © {new Date().getFullYear()} VisaCare
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-700">
              <Plane className="size-5 text-white" aria-hidden />
            </span>
            <span className="font-display text-[17px] font-bold">VisaCare</span>
          </Link>

          <h1 className="font-display text-2xl font-bold">{t("auth.loginTitle")}</h1>
          <p className="mt-2 text-sm text-ink-500">{t("auth.loginSubtitle")}</p>

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
      </main>
    </div>
  );
}

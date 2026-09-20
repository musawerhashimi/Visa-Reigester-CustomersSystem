import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { CompanyBrand } from "@/components/layout/CompanyBrand";
import { useCompanyName } from "@/components/layout/useCompanyName";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";

const schema = z.object({
  email: z.string().email(),
});

type Values = z.infer<typeof schema>;

/**
 * Asking for a new password.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account: saying "no such user" would turn this page into a way to find out
 * who holds one.
 */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const companyName = useCompanyName();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.post("/auth/forgot-password/", values);
      setSent(true);
    } catch (error) {
      setFormError(apiErrorMessage(error, "Could not send the email."));
    }
  }

  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-4 py-12 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(34rem 26rem at 100% 0%, oklch(0.56 0.152 260 / 0.10), transparent 60%), radial-gradient(30rem 24rem at 0% 100%, oklch(0.75 0.162 68 / 0.10), transparent 62%)",
        }}
      />

      <Link
        to="/login"
        aria-label={t("auth.backToLogin")}
        title={t("auth.backToLogin")}
        className="group absolute left-4 top-4 z-10 grid size-10 place-items-center rounded-full border border-ink-200 bg-white/80 text-ink-600 shadow-subtle backdrop-blur-sm transition-colors hover:border-ink-300 hover:text-ink-900 sm:left-6 sm:top-6"
      >
        <ArrowLeft
          className="size-5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
      </Link>

      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <CompanyBrand size="lg" />
        </Link>

        <div className="card p-6 shadow-lifted sm:p-8">
          {sent ? (
            <div className="text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
                <CheckCircle2 className="size-6" aria-hidden />
              </span>
              <h1 className="mt-4 font-display text-xl font-bold">
                {t("auth.forgotTitle")}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {t("auth.forgotSent")}
              </p>
              <Link to="/login" className="mt-6 block">
                <Button fullWidth>{t("auth.submitLogin")}</Button>
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-center font-display text-2xl font-bold">
                {t("auth.forgotTitle")}
              </h1>
              <p className="mt-2 text-center text-sm text-ink-500">
                {t("auth.forgotSubtitle")}
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

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="mt-6 space-y-4"
                noValidate
              >
                <Field
                  label={t("auth.email")}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  icon={<Mail className="size-4" aria-hidden />}
                  error={errors.email?.message}
                  {...register("email")}
                />

                <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                  {t("auth.forgotSubmit")}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-ink-500">
                <Link
                  to="/login"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {t("auth.backToLogin")}
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-ink-400">
          © {new Date().getFullYear()} {companyName}
        </p>
      </div>
    </div>
  );
}

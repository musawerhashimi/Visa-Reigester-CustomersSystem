import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Check, Mail, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { PageBody, PageHeader } from "@/components/public/PageShell";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { useCompanyInfo } from "@/lib/cms";
import { translate } from "@/lib/i18n";

const schema = z.object({
  name: z.string().min(1, "Your name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1, "Please write your message"),
});

type FormValues = z.infer<typeof schema>;

export default function Contact() {
  const { t } = useTranslation();
  const { data: company } = useCompanyInfo();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const send = useMutation({
    mutationFn: (values: FormValues) =>
      api.post("/cms/contact-messages/", values),
    onSuccess: () => {
      setFormError(null);
      setSent(true);
      reset();
    },
    onError: (error) =>
      setFormError(apiErrorMessage(error, "Could not send your message.")),
  });

  return (
    <>
      <PageHeader title={t("contact.title")} subtitle={t("contact.subtitle")} />

      <PageBody>
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="card p-6 sm:p-8">
            {sent ? (
              <div className="py-10 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-6" aria-hidden />
                </span>
                <p className="mt-4 font-medium text-ink-900">
                  {t("contact.success")}
                </p>
                <p className="mt-1.5 text-sm text-ink-500">
                  {t("pages.respondByEmail")}
                </p>
                <Button
                  variant="outline"
                  className="mt-6"
                  onClick={() => setSent(false)}
                >
                  {t("pages.sendAnother")}
                </Button>
              </div>
            ) : (
              <>
                <h2 className="font-display text-xl font-bold">
                  {t("contact.send")}
                </h2>

                {formError && (
                  <div
                    role="alert"
                    className="mt-5 flex gap-2.5 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{formError}</span>
                  </div>
                )}

                <form
                  className="mt-5 space-y-4"
                  onSubmit={handleSubmit((values) => send.mutate(values))}
                  noValidate
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("contact.name")}
                      required
                      error={errors.name?.message}
                      {...register("name")}
                    />
                    <Field
                      label={t("contact.email")}
                      type="email"
                      required
                      error={errors.email?.message}
                      {...register("email")}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("contact.phone")}
                      type="tel"
                      error={errors.phone?.message}
                      {...register("phone")}
                    />
                    <Field
                      label={t("contact.subject")}
                      error={errors.subject?.message}
                      {...register("subject")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="contact-message"
                      className="block text-sm font-medium text-ink-700"
                    >
                      {t("contact.message")}
                      <span className="ml-1 text-danger" aria-hidden>
                        *
                      </span>
                    </label>
                    <textarea
                      id="contact-message"
                      rows={6}
                      aria-invalid={errors.message ? true : undefined}
                      className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      placeholder="How can we help?"
                      {...register("message")}
                    />
                    {errors.message && (
                      <p role="alert" className="text-xs text-danger">
                        {errors.message.message}
                      </p>
                    )}
                  </div>

                  <Button type="submit" size="lg" loading={send.isPending}>
                    {t("contact.send")}
                  </Button>
                </form>
              </>
            )}
          </section>

          <aside className="space-y-4">
            {company?.address && (
              <InfoCard icon={<MapPin className="size-5" />} label={t("contact.address")}>
                {company.address}
              </InfoCard>
            )}
            {company?.phone && (
              <InfoCard icon={<Phone className="size-5" />} label={t("contact.phone")}>
                <a href={`tel:${company.phone}`} className="hover:text-brand-700">
                  {company.phone}
                </a>
              </InfoCard>
            )}
            {company?.email && (
              <InfoCard icon={<Mail className="size-5" />} label={t("contact.email")}>
                <a href={`mailto:${company.email}`} className="hover:text-brand-700">
                  {company.email}
                </a>
              </InfoCard>
            )}
            {company && translate(company.working_hours) && (
              <InfoCard label={t("contact.hours")}>
                <span className="whitespace-pre-line">
                  {translate(company.working_hours)}
                </span>
              </InfoCard>
            )}
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function InfoCard({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card flex gap-4 p-5">
      {icon && (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {label}
        </h3>
        <p className="mt-1 text-sm text-ink-700">{children}</p>
      </div>
    </div>
  );
}

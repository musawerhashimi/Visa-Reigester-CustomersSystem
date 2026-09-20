import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { translate } from "@/lib/i18n";
import type {
  ApplicationDetail,
  Paginated,
  PublicBranch,
  VisaType,
} from "@/types/domain";

type Values = Record<string, string>;

const STEPS = [
  { key: "visa", title: "Visa" },
  { key: "branch", title: "Office" },
  { key: "personal", title: "Personal" },
  { key: "contact", title: "Contact" },
  { key: "passport", title: "Passport" },
  { key: "travel", title: "Travel" },
] as const;

/** Fields per step, with the ones the backend needs marked required. */
const FIELDS: Record<string, { name: string; label: string; type?: string; required?: boolean }[]> = {
  personal: [
    { name: "first_name", label: "First name", required: true },
    { name: "middle_name", label: "Middle name" },
    { name: "last_name", label: "Last name", required: true },
    { name: "father_name", label: "Father's name" },
    { name: "mother_name", label: "Mother's name" },
    { name: "date_of_birth", label: "Date of birth", type: "date" },
    { name: "place_of_birth", label: "Place of birth" },
    { name: "nationality", label: "Nationality" },
  ],
  contact: [
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", required: true },
    { name: "alternative_phone", label: "Alternative phone" },
    { name: "current_address", label: "Current address" },
    { name: "city", label: "City" },
    { name: "country", label: "Country" },
  ],
  passport: [
    { name: "passport_number", label: "Passport number" },
    { name: "passport_type", label: "Passport type" },
    { name: "passport_issue_date", label: "Issue date", type: "date" },
    { name: "passport_expiry_date", label: "Expiry date", type: "date" },
    { name: "passport_issue_country", label: "Issuing country" },
  ],
  travel: [
    { name: "purpose_of_travel", label: "Purpose of travel" },
    { name: "expected_travel_date", label: "Expected travel date", type: "date" },
    { name: "expected_return_date", label: "Expected return date", type: "date" },
    { name: "occupation", label: "Occupation" },
    { name: "employer", label: "Employer" },
    { name: "emergency_contact", label: "Emergency contact" },
  ],
};

export default function NewApplication() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [visaTypeId, setVisaTypeId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);

  const { data: visaTypes } = useQuery({
    queryKey: ["visa-types"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<VisaType>>("/visa-types/");
      return data.results;
    },
  });

  const { data: branches } = useQuery({
    queryKey: ["public-branches"],
    queryFn: async () => {
      const { data } = await api.get<PublicBranch[]>("/public-branches/");
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      // Dates come back as "" from untouched inputs; the API expects null.
      const payload: Record<string, unknown> = {
        visa_type_id: visaTypeId,
        branch_id: branchId,
      };
      for (const [key, value] of Object.entries(values)) {
        payload[key] = value === "" ? null : value;
      }
      const { data } = await api.post<ApplicationDetail>("/applications/", payload);
      return data;
    },
    onSuccess: (application) => {
      // Straight to the detail page: documents must be uploaded before the
      // application can be submitted, and that is where it happens.
      navigate(`/portal/applications/${application.id}`, { replace: true });
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not create the application.")),
  });

  const currentStep = STEPS[step]!;
  const selectedVisa = visaTypes?.find((visa) => visa.id === visaTypeId);

  function update(name: string, value: string) {
    setValues((previous) => ({ ...previous, [name]: value }));
  }

  function canContinue() {
    if (currentStep.key === "visa") return visaTypeId !== null;
    if (currentStep.key === "branch") return branchId !== null;
    const fields = FIELDS[currentStep.key] ?? [];
    return fields.every((field) => !field.required || values[field.name]?.trim());
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/portal/applications"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("portal.applications")}
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold">
          {t("portal.newApplication")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("portal.saveUploadLater")}
        </p>
      </div>

      {/* Progress. A plain numbered rail reads more clearly than a bar when
          the steps have names the applicant needs to recognise. */}
      <ol className="scroll-slim flex gap-1 overflow-x-auto">
        {STEPS.map((item, index) => (
          <li key={item.key} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                index < step
                  ? "bg-success text-white"
                  : index === step
                    ? "bg-brand-600 text-white"
                    : "bg-ink-200 text-ink-500",
              )}
              aria-hidden
            >
              {index < step ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-xs font-medium",
                index === step ? "text-ink-900" : "text-ink-500",
              )}
            >
              {item.title}
            </span>
            {index < STEPS.length - 1 && (
              <span className="hidden h-px flex-1 bg-ink-200 sm:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <form
        className="card p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < STEPS.length - 1) {
            setStep((value) => value + 1);
          } else {
            create.mutate();
          }
        }}
      >
        {currentStep.key === "visa" ? (
          <fieldset>
            <legend className="text-sm font-semibold text-ink-900">
              {t("portal.whichVisa")}
            </legend>
            <div className="mt-4 space-y-2">
              {visaTypes?.map((visa) => (
                <label
                  key={visa.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                    visaTypeId === visa.id
                      ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500"
                      : "border-ink-200 hover:border-ink-300 hover:bg-ink-50",
                  )}
                >
                  <input
                    type="radio"
                    name="visa_type"
                    value={visa.id}
                    checked={visaTypeId === visa.id}
                    onChange={() => setVisaTypeId(visa.id)}
                    className="mt-0.5 size-4 text-brand-600 focus:ring-brand-500/30"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">
                      {translate(visa.name)} {visa.country.flag_emoji}{" "}
                      {translate(visa.country.name)}
                    </span>
                    {translate(visa.description) && (
                      <span className="mt-1 block text-sm text-ink-500">
                        {translate(visa.description)}
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-400">
                      {translate(visa.processing_time) && (
                        <span>Processing: {translate(visa.processing_time)}</span>
                      )}
                      {visa.fee_amount && (
                        <span>
                          Fee: {visa.fee_amount} {visa.fee_currency}
                        </span>
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {selectedVisa && selectedVisa.required_documents.length > 0 && (
              <p className="mt-4 rounded-lg bg-info-soft px-3.5 py-3 text-xs text-info">
                {t("portal.youWillNeed")}{" "}
                {selectedVisa.required_documents
                  .map((item) => translate(item.document_type.name))
                  .join(", ")}
                .
              </p>
            )}
          </fieldset>
        ) : currentStep.key === "branch" ? (
          <fieldset>
            <legend className="text-sm font-semibold text-ink-900">
              {t("portal.whichOffice")}
            </legend>
            <p className="mt-1 text-sm text-ink-500">
{t("portal.officeHint")}
            </p>
            <div className="mt-4 space-y-2">
              {branches?.map((branch) => (
                <label
                  key={branch.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                    branchId === branch.id
                      ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500"
                      : "border-ink-200 hover:border-ink-300 hover:bg-ink-50",
                  )}
                >
                  <input
                    type="radio"
                    name="branch"
                    value={branch.id}
                    checked={branchId === branch.id}
                    onChange={() => setBranchId(branch.id)}
                    className="mt-0.5 size-4 text-brand-600 focus:ring-brand-500/30"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">
                      {branch.name}
                    </span>
                    {(branch.city || branch.country) && (
                      <span className="mt-1 block text-sm text-ink-500">
                        {[branch.city, branch.country]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-400">
                      {branch.address && <span>{branch.address}</span>}
                      {branch.phone && <span>{branch.phone}</span>}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset>
            <legend className="text-sm font-semibold text-ink-900">
              {currentStep.title} information
            </legend>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(FIELDS[currentStep.key] ?? []).map((field) => (
                <Field
                  key={field.name}
                  label={field.label}
                  type={field.type ?? "text"}
                  required={field.required}
                  value={values[field.name] ?? ""}
                  onChange={(event) => update(field.name, event.target.value)}
                />
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink-200 pt-5">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            {t("common.back")}
          </Button>

          <Button
            type="submit"
            disabled={!canContinue()}
            loading={create.isPending}
            icon={
              step < STEPS.length - 1 ? <ArrowRight className="size-4" /> : undefined
            }
          >
            {step < STEPS.length - 1 ? t("common.next") : "Create application"}
          </Button>
        </div>
      </form>
    </div>
  );
}

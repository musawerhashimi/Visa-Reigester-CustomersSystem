import { Mail, MapPin, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCompanyInfo } from "@/lib/cms";
import { translate } from "@/lib/i18n";

import { CompanyBrand } from "./CompanyBrand";
import { useCompanyName } from "./useCompanyName";

const QUICK_LINKS = [
  { to: "/about", key: "nav.about" },
  { to: "/visas", key: "nav.visaServices" },
  { to: "/activities", key: "nav.activities" },
  { to: "/news", key: "nav.news" },
  { to: "/gallery", key: "nav.gallery" },
  { to: "/contact", key: "nav.contact" },
] as const;

export function PublicFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const companyName = useCompanyName();
  const { data: company } = useCompanyInfo();

  // Each contact line hides itself when the office has not filled it in, so
  // the column never shows an empty icon or a dead "mailto:" link.
  const address = company?.address?.trim();
  const phone = company?.phone?.trim();
  const email = company?.email?.trim();
  const hours = translate(company?.working_hours).trim();

  return (
    <footer className="mt-24 bg-brand-950 text-brand-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <CompanyBrand tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-200">
            {translate(company?.description) || t("home.heroSubtitle")}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">{t("footer.quickLinks")}</h3>
          <ul className="mt-4 space-y-2.5">
            {QUICK_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-sm text-brand-200 transition-colors hover:text-white"
                >
                  {t(link.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">{t("footer.contactUs")}</h3>
          <ul className="mt-4 space-y-3 text-sm text-brand-200">
            {address && (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="whitespace-pre-line">{address}</span>
              </li>
            )}
            {phone && (
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                <a
                  href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                  className="transition-colors hover:text-white"
                >
                  {phone}
                </a>
              </li>
            )}
            {email && (
              <li className="flex gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                <a
                  href={`mailto:${email}`}
                  className="break-all transition-colors hover:text-white"
                >
                  {email}
                </a>
              </li>
            )}
          </ul>
        </div>

        {/* Free text from the MIS rather than fixed rows: an office may keep
            Ramadan hours, or close on Friday rather than Sunday. The whole
            column goes when nothing is set, heading included. */}
        {hours && (
          <div>
            <h3 className="text-sm font-semibold text-white">{t("contact.hours")}</h3>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-brand-200">
              {hours}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-brand-300 sm:px-6 lg:px-8">
          © {year} {companyName}. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}

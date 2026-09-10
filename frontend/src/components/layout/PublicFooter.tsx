import { Mail, MapPin, Phone, Plane } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

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

  return (
    <footer className="mt-24 bg-brand-950 text-brand-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-white/10">
              <Plane className="size-5 text-white" aria-hidden />
            </span>
            <span className="font-display text-[17px] font-bold text-white">
              VisaCare
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-200">
            {t("home.heroSubtitle")}
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
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Hauptstraße 1, 10115 Berlin, Germany</span>
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
              <a href="tel:+49301234567" className="transition-colors hover:text-white">
                +49 30 1234567
              </a>
            </li>
            <li className="flex gap-2.5">
              <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
              <a
                href="mailto:office@example.com"
                className="transition-colors hover:text-white"
              >
                office@example.com
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">{t("contact.hours")}</h3>
          <dl className="mt-4 space-y-2 text-sm text-brand-200">
            <div className="flex justify-between gap-4">
              <dt>Mon – Fri</dt>
              <dd className="tabular">09:00 – 17:00</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Saturday</dt>
              <dd className="tabular">10:00 – 14:00</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Sunday</dt>
              <dd>Closed</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-brand-300 sm:px-6 lg:px-8">
          © {year} VisaCare. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}

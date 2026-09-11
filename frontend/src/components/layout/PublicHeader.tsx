import { Menu, Plane, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";

import { LanguageSwitcher } from "./LanguageSwitcher";

const LINKS = [
  { to: "/", key: "nav.home", end: true },
  { to: "/about", key: "nav.about" },
  { to: "/services", key: "nav.services" },
  { to: "/visas", key: "nav.visaServices" },
  { to: "/activities", key: "nav.activities" },
  { to: "/news", key: "nav.news" },
  { to: "/gallery", key: "nav.gallery" },
  { to: "/contact", key: "nav.contact" },
] as const;

export function PublicHeader() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const user = useAuth((state) => state.user);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // The header sits flush over the hero and gains a border once the page moves.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-white/85 backdrop-blur-md transition-shadow duration-200",
        scrolled ? "border-b border-ink-200 shadow-subtle" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-700 text-white shadow-subtle">
            <Plane className="size-5" aria-hidden />
          </span>
          <span className="font-display text-[17px] font-bold tracking-tight text-ink-900">
            VisaCare
          </span>
        </Link>

        <nav className="scroll-slim ml-4 hidden items-center gap-0.5 overflow-x-auto lg:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={"end" in link ? link.end : undefined}
              className={({ isActive }) =>
                cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                )
              }
            >
              {t(link.key)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:block" />

          {user ? (
            <Link to="/portal" className="hidden sm:block">
              <Button size="sm">{t("nav.portal")}</Button>
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 sm:block"
              >
                {t("nav.login")}
              </Link>
              <Link to="/signup" className="hidden sm:block">
                <Button size="sm">{t("nav.signup")}</Button>
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            className="rounded-lg p-2 text-ink-600 transition-colors hover:bg-ink-100 lg:hidden"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-ink-200 bg-white lg:hidden">
          <nav className="mx-auto max-w-7xl space-y-0.5 px-4 py-3 sm:px-6">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={"end" in link ? link.end : undefined}
                className={({ isActive }) =>
                  cn(
                    "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-700 hover:bg-ink-100",
                  )
                }
              >
                {t(link.key)}
              </NavLink>
            ))}

            <div className="flex items-center gap-2 border-t border-ink-200 pt-3">
              <LanguageSwitcher />
              <div className="ml-auto flex gap-2">
                {user ? (
                  <Link to="/portal">
                    <Button size="sm">{t("nav.portal")}</Button>
                  </Link>
                ) : (
                  <>
                    <Link to="/login">
                      <Button size="sm" variant="outline">
                        {t("nav.login")}
                      </Button>
                    </Link>
                    <Link to="/signup">
                      <Button size="sm">{t("nav.signup")}</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";

import { CompanyBrand } from "./CompanyBrand";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserMenu } from "./UserMenu";

interface NavLinkItem {
  to: string;
  key: string;
  end?: boolean;
  /** Pages that belong under this one, shown as a dropdown. */
  children?: { to: string; key: string }[];
}

const LINKS: NavLinkItem[] = [
  { to: "/", key: "nav.home", end: true },
  { to: "/about", key: "nav.about" },
  {
    to: "/services",
    key: "nav.services",
    children: [{ to: "/visas", key: "nav.visaServices" }],
  },
  { to: "/activities", key: "nav.activities" },
  { to: "/news", key: "nav.news" },
  { to: "/gallery", key: "nav.gallery" },
  { to: "/contact", key: "nav.contact" },
];

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
        <Link to="/">
          <CompanyBrand />
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) =>
            link.children ? (
              <DesktopMenu key={link.to} link={link} />
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
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
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:block" />

          {user ? (
            <UserMenu className="hidden sm:block" />
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
              <div key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
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

                {/* Indented rather than collapsed: with one sub-item a
                    disclosure would cost a tap and hide the page. */}
                {link.children?.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) =>
                      cn(
                        "block rounded-lg py-2.5 pl-7 pr-3 text-sm transition-colors",
                        isActive
                          ? "bg-brand-50 font-medium text-brand-700"
                          : "text-ink-600 hover:bg-ink-100",
                      )
                    }
                  >
                    {t(child.key)}
                  </NavLink>
                ))}
              </div>
            ))}

            <div className="flex items-center gap-2 border-t border-ink-200 pt-3">
              <LanguageSwitcher align="left" />
              <div className="ml-auto flex gap-2">
                {user ? (
                  <UserMenu />
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

/**
 * A top-level page that also lists the pages beneath it.
 *
 * The parent stays a real link — Services is a page in its own right — so the
 * dropdown opens on hover and on focus rather than swallowing the click.
 */
function DesktopMenu({ link }: { link: NavLinkItem }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isActive =
    pathname === link.to ||
    (link.children ?? []).some((child) => pathname === child.to);

  // A small delay stops the menu snapping shut while the pointer crosses the
  // gap between the trigger and the panel.
  function scheduleClose() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  function cancelClose() {
    clearTimeout(closeTimer.current);
    setOpen(true);
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div
      className="relative"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onFocus={cancelClose}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <NavLink
        to={link.to}
        end={link.end}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-brand-50 text-brand-700"
            : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        )}
      >
        {t(link.key)}
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </NavLink>

      {open && (
        <div className="absolute left-0 top-full z-50 min-w-52 pt-1.5">
          <ul className="overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-lifted">
            {link.children?.map((child) => (
              <li key={child.to}>
                <NavLink
                  to={child.to}
                  className={({ isActive: childActive }) =>
                    cn(
                      "block px-4 py-2.5 text-sm transition-colors",
                      childActive
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-700 hover:bg-ink-50",
                    )
                  }
                >
                  {t(child.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import { LayoutDashboard, LogOut, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";

/**
 * Signed-in identity in the public header.
 *
 * Shows who is signed in rather than a generic "Customer Portal" link: staff
 * are not customers, and sending an admin to /portal lands them somewhere
 * their role cannot use.
 */
export function UserMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const isCustomer = user.role === "customer";
  const home = isCustomer ? "/portal" : "/mis";
  const homeLabel = isCustomer ? t("nav.portal") : "MIS Dashboard";
  const displayName = user.full_name || user.email;

  function onLogout() {
    logout();
    setOpen(false);
    navigate("/", { replace: true });
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white">
          {initials(displayName)}
        </span>
        <span className="hidden max-w-[12rem] truncate lg:block">{displayName}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lifted"
        >
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-ink-900">{displayName}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
            <p className="mt-1 text-xs text-brand-600">{roleLabel(user.role)}</p>
          </div>

          <div className="p-1">
            <Link
              to={home}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-100"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              {homeLabel}
            </Link>

            {isCustomer && (
              <Link
                to="/portal/profile"
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-100"
              >
                <UserIcon className="size-4" aria-hidden />
                {t("portal.profile")}
              </Link>
            )}

            <button
              type="button"
              onClick={onLogout}
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-100"
            >
              <LogOut className="size-4" aria-hidden />
              {t("auth.logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(value: string) {
  const parts = value.split(/[\s@.]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function roleLabel(role: string) {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

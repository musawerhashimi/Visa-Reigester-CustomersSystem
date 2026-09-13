import {
  Bell,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plane,
  Plus,
  User as UserIcon,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { notificationSocket, playAlertTone } from "@/lib/notifications";
import { useAuth } from "@/stores/auth";
import type { Notification, Paginated } from "@/types/domain";

const NAV = [
  { to: "/portal", key: "portal.dashboard", icon: LayoutDashboard, end: true },
  { to: "/portal/applications", key: "portal.applications", icon: FileText },
  { to: "/portal/notifications", key: "portal.notifications", icon: Bell },
  { to: "/portal/profile", key: "portal.profile", icon: UserIcon },
] as const;

export function PortalLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  // The customer needs to see that something is waiting without opening the
  // page first, so the nav entry carries the unread count.
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification>>("/notifications/", {
        params: { page_size: 50 },
      });
      return data.results;
    },
  });

  const unreadCount = (notifications ?? []).filter((item) => !item.is_read).length;

  useEffect(() => {
    notificationSocket.connect();
    const unsubscribe = notificationSocket.subscribe((notification) => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (notification.play_sound) playAlertTone();
    });
    return () => {
      unsubscribe();
      notificationSocket.disconnect();
    };
  }, [queryClient]);

  function onLogout() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-700 text-white">
              <Plane className="size-5" aria-hidden />
            </span>
            <span className="font-display text-[17px] font-bold text-ink-900">
              VisaCare
            </span>
          </NavLink>

          <nav className="ml-4 hidden items-center gap-0.5 md:flex">
            {NAV.map(({ to, key, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={"end" in rest ? rest.end : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {t(key)}
                {key === "portal.notifications" && unreadCount > 0 && (
                  <UnreadBadge count={unreadCount} />
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:block" />
            <span className="hidden text-sm text-ink-600 lg:block">
              {user?.full_name || user?.email}
            </span>
            <button
              type="button"
              onClick={onLogout}
              aria-label={t("auth.logout")}
              className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <LogOut className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 md:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-ink-200 bg-white px-4 py-3 md:hidden">
            {NAV.map(({ to, key, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={"end" in rest ? rest.end : undefined}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-ink-100",
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {t(key)}
                {key === "portal.notifications" && unreadCount > 0 && (
                  <UnreadBadge count={unreadCount} />
                )}
              </NavLink>
            ))}
            <NavLink
              to="/portal/applications/new"
              onClick={() => setMenuOpen(false)}
              className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus className="size-4" aria-hidden />
              {t("portal.newApplication")}
            </NavLink>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

/** The red count that tells a customer something new is waiting. */
function UnreadBadge({ count }: { count: number }) {
  return (
    <span
      className="tabular ml-1 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

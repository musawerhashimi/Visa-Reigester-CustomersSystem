import {
  BarChart3,
  Building2,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Globe,
  ShieldCheck,
  LogOut,
  Mail,
  Menu,
  Plane,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";

import { NotificationBell } from "./NotificationBell";

/** Sidebar entries, each gated on the permission that makes it useful. */
const NAV = [
  { to: "/mis", label: "Dashboard", icon: LayoutDashboard, end: true },
  // A CMS manager administers the public site and has no business in the
  // application queue (section 42); either view permission qualifies.
  { to: "/mis/applications", label: "Applications", icon: FileText, permission: "applications.view_assigned" },
  { to: "/mis/customers", label: "Customers", icon: Users, permission: "customers.view" },
  { to: "/mis/documents", label: "Documents", icon: FolderOpen, permission: "documents.view" },
  { to: "/mis/emails", label: "Emails", icon: Mail, permission: "emails.send" },
  { to: "/mis/reports", label: "Reports", icon: BarChart3, permission: "reports.view" },
  { to: "/mis/visas", label: "Visa types", icon: Plane, permission: "visas.manage" },
  { to: "/mis/cms", label: "Website", icon: Globe, permission: "cms.pages.manage" },
  { to: "/mis/accounts", label: "Users & Accounts", icon: ShieldCheck, permission: "users.view" },
  { to: "/mis/branches", label: "Branches", icon: Building2, permission: "branches.view" },
  { to: "/mis/settings", label: "Settings", icon: Settings, permission: "cms.pages.manage" },
] as const;

export function MISLayout() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const hasPermission = useAuth((state) => state.hasPermission);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visible = NAV.filter((item) => {
    if (!("permission" in item) || !item.permission) return true;
    if (item.permission === "applications.view_assigned") {
      return (
        hasPermission("applications.view_assigned") ||
        hasPermission("applications.view")
      );
    }
    return hasPermission(item.permission);
  });

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-dvh bg-ink-50">
      {/* Sidebar. Fixed on desktop, a slide-over on smaller screens. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-brand-900 bg-brand-950",
          "transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
          <span className="grid size-8 place-items-center rounded-lg bg-white/10">
            <Plane className="size-4 text-white" aria-hidden />
          </span>
          <span className="font-display text-[15px] font-bold text-white">
            VisaCare MIS
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-1.5 text-brand-300 hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="space-y-0.5 p-3">
          {visible.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest ? rest.end : undefined}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/12 text-white"
                    : "text-brand-200 hover:bg-white/8 hover:text-white",
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {initials(user?.full_name || user?.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.full_name || user?.email}
              </p>
              <p className="truncate text-xs text-brand-300">
                {roleLabel(user?.role)}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="rounded-lg p-1.5 text-brand-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-brand-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function initials(value?: string) {
  if (!value) return "?";
  const parts = value.split(/[\s@.]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function roleLabel(role?: string) {
  if (!role) return "";
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/stores/auth";
import type { UserRole } from "@/types/domain";

interface RequireAuthProps {
  children: ReactNode;
  /** Restrict to these roles; omit to allow any signed-in user. */
  roles?: readonly UserRole[];
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const user = useAuth((state) => state.user);
  const initializing = useAuth((state) => state.initializing);
  const location = useLocation();

  // Wait for the session probe, otherwise a refresh would bounce a signed-in
  // user to the login screen before their token is checked.
  if (initializing) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
      </div>
    );
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // Signed in, wrong area: send them where they do belong.
    return <Navigate to={user.role === "customer" ? "/portal" : "/mis"} replace />;
  }

  return <>{children}</>;
}

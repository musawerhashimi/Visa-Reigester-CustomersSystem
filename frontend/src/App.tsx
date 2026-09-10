import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { PublicLayout } from "@/components/layout/PublicLayout";
import { MISLayout } from "@/components/mis/MISLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/stores/auth";
import type { UserRole } from "@/types/domain";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));
const MISDashboard = lazy(() => import("@/pages/mis/Dashboard"));
const MISApplications = lazy(() => import("@/pages/mis/Applications"));
const MISApplicationDetail = lazy(() => import("@/pages/mis/ApplicationDetail"));

/** Everyone except customers works inside the MIS. */
const MIS_ROLES: readonly UserRole[] = [
  "super_admin",
  "admin",
  "visa_officer",
  "cms_manager",
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx responses are the server's final answer; only retry transport
      // and server errors. A 401 is handled by the axios interceptor.
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

function PageFallback() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="size-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
    </div>
  );
}

export default function App() {
  const loadSession = useAuth((state) => state.loadSession);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
            </Route>

            <Route path="/login" element={<Login />} />

            <Route
              path="/mis"
              element={
                <RequireAuth roles={MIS_ROLES}>
                  <MISLayout />
                </RequireAuth>
              }
            >
              <Route index element={<MISDashboard />} />
              <Route path="applications" element={<MISApplications />} />
              <Route path="applications/:id" element={<MISApplicationDetail />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

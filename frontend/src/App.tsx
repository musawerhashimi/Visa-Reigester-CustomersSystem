import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { PublicLayout } from "@/components/layout/PublicLayout";
import { useAuth } from "@/stores/auth";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // A 401 is handled by the axios interceptor; retrying it here would
      // only stack duplicate refresh attempts.
      retry: (failureCount, error) =>
        failureCount < 2 &&
        !(error as { response?: { status?: number } }).response?.status?.toString().startsWith("4"),
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

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

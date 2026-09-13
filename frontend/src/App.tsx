import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { PublicLayout } from "@/components/layout/PublicLayout";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { MISLayout } from "@/components/mis/MISLayout";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { ToastProvider } from "@/components/ui/Toast";
import { useAuth } from "@/stores/auth";
import type { UserRole } from "@/types/domain";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const About = lazy(() => import("@/pages/public/About"));
const Services = lazy(() => import("@/pages/public/Services"));
const Visas = lazy(() => import("@/pages/public/Visas"));
const Activities = lazy(() => import("@/pages/public/Activities"));
const News = lazy(() => import("@/pages/public/News"));
const NewsArticle = lazy(() => import("@/pages/public/NewsArticle"));
const Gallery = lazy(() => import("@/pages/public/Gallery"));
const Contact = lazy(() => import("@/pages/public/Contact"));
const MISDashboard = lazy(() => import("@/pages/mis/Dashboard"));
const MISApplications = lazy(() => import("@/pages/mis/Applications"));
const MISApplicationDetail = lazy(() => import("@/pages/mis/ApplicationDetail"));
const MISReports = lazy(() => import("@/pages/mis/Reports"));
const MISCustomers = lazy(() => import("@/pages/mis/Customers"));
const MISDocuments = lazy(() => import("@/pages/mis/Documents"));
const MISEmails = lazy(() => import("@/pages/mis/Emails"));
const MISSettings = lazy(() => import("@/pages/mis/Settings"));
const MISAccounts = lazy(() => import("@/pages/mis/Accounts"));
const CMSHome = lazy(() => import("@/pages/mis/cms/CMSHome"));
const ContentList = lazy(() => import("@/pages/mis/cms/ContentList"));
const ContentEditor = lazy(() => import("@/pages/mis/cms/ContentEditor"));
const VisasHome = lazy(() => import("@/pages/mis/visas/VisasHome"));
const VisaTypeList = lazy(() => import("@/pages/mis/visas/VisaTypeList"));
const VisaTypeEditor = lazy(() => import("@/pages/mis/visas/VisaTypeEditor"));
const VisaCountryList = lazy(() =>
  import("@/pages/mis/visas/CatalogueLists").then((module) => ({
    default: module.CountryList,
  })),
);
const VisaCategoryList = lazy(() =>
  import("@/pages/mis/visas/CatalogueLists").then((module) => ({
    default: module.CategoryList,
  })),
);
const PortalDashboard = lazy(() => import("@/pages/portal/Dashboard"));
const PortalApplications = lazy(() => import("@/pages/portal/Applications"));
const PortalApplicationDetail = lazy(() => import("@/pages/portal/ApplicationDetail"));
const NewApplication = lazy(() => import("@/pages/portal/NewApplication"));
const PortalNotifications = lazy(() => import("@/pages/portal/Notifications"));
const PortalProfile = lazy(() => import("@/pages/portal/Profile"));

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
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="about" element={<About />} />
              <Route path="services" element={<Services />} />
              <Route path="visas" element={<Visas />} />
              <Route path="activities" element={<Activities />} />
              <Route path="news" element={<News />} />
              <Route path="news/:slug" element={<NewsArticle />} />
              <Route path="gallery" element={<Gallery />} />
              <Route path="contact" element={<Contact />} />
            </Route>

            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

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
              <Route path="customers" element={<MISCustomers />} />
              <Route path="documents" element={<MISDocuments />} />
              <Route path="emails" element={<MISEmails />} />
              <Route path="reports" element={<MISReports />} />
              <Route path="accounts" element={<MISAccounts />} />
              <Route path="settings" element={<MISSettings />} />
              <Route path="cms" element={<CMSHome />} />
              <Route path="cms/:type" element={<ContentList />} />
              <Route path="cms/:type/:id" element={<ContentEditor />} />
              <Route path="visas" element={<VisasHome />} />
              <Route path="visas/types" element={<VisaTypeList />} />
              <Route path="visas/types/:slug" element={<VisaTypeEditor />} />
              <Route path="visas/countries" element={<VisaCountryList />} />
              <Route path="visas/categories" element={<VisaCategoryList />} />
            </Route>

            <Route
              path="/portal"
              element={
                <RequireAuth roles={["customer"]}>
                  <PortalLayout />
                </RequireAuth>
              }
            >
              <Route index element={<PortalDashboard />} />
              <Route path="applications" element={<PortalApplications />} />
              <Route path="applications/new" element={<NewApplication />} />
              <Route path="applications/:id" element={<PortalApplicationDetail />} />
              <Route path="notifications" element={<PortalNotifications />} />
              <Route path="profile" element={<PortalProfile />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

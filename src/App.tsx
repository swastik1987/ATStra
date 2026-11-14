import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { USAGE_KEY } from "@/hooks/useUsage";
import { AppLayout } from "@/components/AppLayout";
import { Landing } from "@/pages/Landing";
import { Applications } from "@/pages/Applications";
import { CvText } from "@/pages/CvText";
import { NewTailoring } from "@/pages/NewTailoring";
import { Analysis } from "@/pages/Analysis";
import { Export } from "@/pages/Export";

// Development-only layout preview with synthetic data; removed from production builds.
const PhonePreview = import.meta.env.DEV ? lazy(() => import("@/dev/PhonePreview").then((m) => ({ default: m.PhonePreview }))) : null;

const queryClient: QueryClient = new QueryClient({
  // After any model call (success or failure, both are billed), refresh the header credits.
  mutationCache: new MutationCache({
    onSettled: (_d, _e, _v, _c, mutation) => {
      if (mutation.meta?.aiCall) queryClient.invalidateQueries({ queryKey: USAGE_KEY });
    },
  }),
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<Landing />} />
          {PhonePreview && (
            <Route
              path="/__preview/*"
              element={
                <Suspense fallback={null}>
                  <PhonePreview />
                </Suspense>
              }
            />
          )}
          <Route element={<AppLayout />}>
            <Route index element={<Applications />} />
            <Route path="/cv/:id" element={<CvText />} />
            <Route path="/new" element={<NewTailoring />} />
            <Route path="/applications/:id" element={<Analysis />} />
            <Route path="/applications/:id/export" element={<Export />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

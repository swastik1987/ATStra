import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { SignIn } from "@/pages/SignIn";
import { Applications } from "@/pages/Applications";
import { CvText } from "@/pages/CvText";
import { NewTailoring } from "@/pages/NewTailoring";
import { Analysis } from "@/pages/Analysis";
import { Export } from "@/pages/Export";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
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

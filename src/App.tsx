import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { SignIn } from "@/pages/SignIn";
import { Placeholder } from "@/pages/Placeholder";

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
            <Route
              index
              element={
                <Placeholder
                  title="Applications"
                  note="One tailored CV per job. Each keeps its job description, score, accepted edits and what happened after you applied."
                />
              }
            />
            <Route path="/new" element={<Placeholder title="New tailoring" note="Built in phases 1 and 2." />} />
            <Route path="/applications/:id" element={<Placeholder title="Score and suggestions" note="Built in phase 3." />} />
            <Route path="/applications/:id/export" element={<Placeholder title="Export" note="Built in phase 4." />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

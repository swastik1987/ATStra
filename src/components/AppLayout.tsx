import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useSession } from "@/hooks/useSession";
import { useProfile } from "@/hooks/useProfile";

export interface LayoutContext {
  profileId: string | undefined;
}

/** Signed-in shell: redirects to /signin when there is no session. */
export function AppLayout() {
  const session = useSession();
  const location = useLocation();
  const profile = useProfile(session?.user.id);

  if (session === undefined) return <p className="p-8 text-muted">Loading…</p>;
  if (session === null) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;

  return (
    <div className="min-h-screen">
      <AppHeader displayName={profile.data?.display_name ?? session.user.email ?? ""} />
      <main className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-9 pb-16 flex flex-col gap-7">
        <Outlet context={{ profileId: profile.data?.id } satisfies LayoutContext} />
      </main>
    </div>
  );
}

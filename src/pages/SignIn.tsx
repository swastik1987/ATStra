import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";

/** Reads an OAuth error that Supabase appends to the redirect URL (query or hash). */
function redirectError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const raw = params.get("error_description") ?? hash.get("error_description");
  if (!raw) return null;
  if (/gmail/i.test(raw)) return "Only Gmail accounts can use CV Tailor. Sign in with an @gmail.com Google account.";
  return raw.replace(/\+/g, " ");
}

export function SignIn() {
  const session = useSession();
  const [error, setError] = useState<string | null>(redirectError);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <section
        aria-labelledby="signin-title"
        className="w-full max-w-md bg-surface border border-border rounded-[14px] p-8 flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1.5">
          <h1 id="signin-title" className="m-0 font-heading font-bold text-[32px] leading-tight">
            CV Tailor
          </h1>
          <p className="m-0 text-muted">Sign in with your Gmail account. New accounts are created on first sign-in.</p>
        </div>
        {error && (
          <p role="alert" className="m-0 rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3">
            <strong>Sign-in failed.</strong> {error}
          </p>
        )}
        <Button variant="primary" size="lg" onClick={continueWithGoogle} disabled={busy || session === undefined}>
          {busy ? "Opening Google…" : "Continue with Google"}
        </Button>
      </section>
    </main>
  );
}

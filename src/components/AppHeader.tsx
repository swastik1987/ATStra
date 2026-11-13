import { Link, NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center min-h-11 px-3.5 rounded-lg no-underline",
    isActive ? "bg-accent-tint text-accent-ink font-semibold" : "text-nav font-medium hover:text-ink",
  );

export function AppHeader({ displayName }: { displayName: string }) {
  const queryClient = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-8 py-3.5 bg-surface border-b border-border">
      <div className="flex flex-wrap items-center gap-4 sm:gap-7">
        <Link to="/" className="font-heading font-bold text-xl text-ink no-underline hover:text-ink">
          CV Tailor
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          <NavLink to="/" end className={navClass}>
            Applications
          </NavLink>
          <NavLink to="/new" className={navClass}>
            New tailoring
          </NavLink>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold">{displayName}</span>
        <Button onClick={signOut}>Sign out</Button>
      </div>
    </header>
  );
}

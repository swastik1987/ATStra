import { Link, NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { useUsage } from "@/hooks/useUsage";
import { formatCredits } from "@/lib/credits";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center min-h-11 px-3.5 rounded-lg no-underline",
    isActive ? "bg-accent-tint text-accent-ink font-semibold" : "text-nav font-medium hover:text-ink",
  );

/** Approximate cumulative AI usage, in credits (1 credit is about US$0.01 of model cost). */
function CreditsBadge() {
  const usage = useUsage();
  if (!usage.data) return null;
  const { total_credits, month_credits, calls } = usage.data;
  const month = formatCredits(month_credits);
  return (
    <span
      title={`Approximate AI usage: ${formatCredits(total_credits)} credits in total, ${month} this month, across ${calls} model calls. 1 credit is about US$0.01 of model cost.`}
      className="inline-flex items-center gap-1.5 min-h-8 px-2.5 rounded-full bg-accent-tint text-accent-ink text-sm font-semibold whitespace-nowrap"
    >
      <svg width="14" height="14" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3c1.1 6.9 6.1 11.9 13 13-6.9 1.1-11.9 6.1-13 13-1.1-6.9-6.1-11.9-13-13C9.9 14.9 14.9 9.9 16 3Z" fill="currentColor" />
      </svg>
      ≈ {formatCredits(total_credits)} AI credits
      <span className="sr-only">, {month} this month</span>
    </span>
  );
}

export function AppHeader({ displayName }: { displayName: string }) {
  const queryClient = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-8 py-3.5 bg-surface border-b border-border">
      <div className="flex flex-wrap items-center gap-4 sm:gap-7">
        <Link to="/" aria-label="ATStra home" className="inline-flex items-center min-h-11 no-underline">
          <Logo />
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
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{displayName}</span>
        <CreditsBadge />
        <Button onClick={signOut}>Sign out</Button>
      </div>
    </header>
  );
}

import { cn } from "@/lib/utils";

/** The ATStra mark: a four-point star (astra) on the accent square. Same drawing as public/favicon.svg. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="#1D4FD8" />
      <path d="M16 5.5c.9 5.6 4.9 9.6 10.5 10.5-5.6.9-9.6 4.9-10.5 10.5-.9-5.6-4.9-9.6-10.5-10.5C11.1 15.1 15.1 11.1 16 5.5Z" fill="#FFFFFF" />
      <circle cx="24.5" cy="7.5" r="1.6" fill="#9DB7FF" />
    </svg>
  );
}

/** Mark plus wordmark. "ATS" carries the accent so the name reads as ATS + tra. */
export function Logo({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-heading font-bold text-xl tracking-tight", className)}>
      <LogoMark />
      <span>
        <span className={tone === "dark" ? "text-accent" : "text-[#9DB7FF]"}>ATS</span>
        <span className={tone === "dark" ? "text-ink" : "text-white"}>tra</span>
      </span>
    </span>
  );
}

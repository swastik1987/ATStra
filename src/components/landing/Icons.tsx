import type { ReactNode, SVGProps } from "react";

/** A small line-icon set for the landing page: 24px grid, 1.75 stroke, currentColor. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconUpload = () => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 17v-6m-2.5 2.5L12 11l2.5 2.5" />
  </Icon>
);

export const IconTarget = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Icon>
);

export const IconDownload = () => (
  <Icon>
    <path d="M12 4v11m-4-4 4 4 4-4" />
    <path d="M5 19h14" />
  </Icon>
);

export const IconQuote = () => (
  <Icon>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M9 9.5h6M9 12.5h4" />
  </Icon>
);

export const IconHash = () => (
  <Icon>
    <path d="M9 4 7 20M17 4l-2 16M4.5 9h15M4 15h15" />
  </Icon>
);

export const IconShieldCheck = () => (
  <Icon>
    <path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const IconHand = () => (
  <Icon>
    <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5V4.5a1.5 1.5 0 0 1 3 0V10m0-3.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.6-2.2L2.6 15a1.5 1.5 0 0 1 2.3-1.9L8 16" />
  </Icon>
);

export const IconLock = () => (
  <Icon>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const IconChart = () => (
  <Icon>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </Icon>
);

export const IconColumns = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 8h8M8 11.5h8M8 15h5" />
  </Icon>
);

export const IconCheck = ({ className }: { className?: string }) => (
  <Icon className={className} strokeWidth="2.25">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const IconChevron = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const IconArrowRight = ({ className }: { className?: string }) => (
  <Icon className={className} strokeWidth="2">
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </Icon>
);

/** Google's "G" mark, used only on the Google sign-in button per Google's branding guidance. */
export const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

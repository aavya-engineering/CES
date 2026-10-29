// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// icons.tsx — UI-03: the small line icons and the shield-and-star CES mark used
// by the sign-in page and the portal (Aavya wireframe, 2026-10-24). Drawn here
// (no icon library); all decorative, so aria-hidden.

type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

/** CES shield-and-star mark. `tone="light"` for dark backgrounds. */
export function CesShield({ size = 64, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  const outer = tone === 'dark' ? '#0b2447' : '#ffffff';
  const inner = tone === 'dark' ? '#ffffff' : '#0b2447';
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 64 72" aria-hidden="true" focusable="false">
      <path d="M32 2 L60 12 V34 C60 52 47 64 32 70 C17 64 4 52 4 34 V12 Z" fill={outer} />
      <path d="M32 9 L53 16.5 V34 C53 48 43 57.5 32 62.5 C21 57.5 11 48 11 34 V16.5 Z" fill={inner} />
      <path
        d="M32 21 L35.3 30.6 L45.4 30.8 L37.3 36.9 L40.3 46.6 L32 40.8 L23.7 46.6 L26.7 36.9 L18.6 30.8 L28.7 30.6 Z"
        fill="#1d5fd6"
      />
    </svg>
  );
}

export const MailIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5 12 13l8.5-6.5" />
  </svg>
);

export const BuildingIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 21V5l8-2v18M12 8h8v13M2 21h20" />
    <path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" />
  </svg>
);

export const LockIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

export const EyeIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </svg>
);

export const ArrowRightIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const ArrowLeftIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const SunIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
);

export const InfoIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="11" fill="#1d5fd6" />
    <path d="M12 10.5v6.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="7.2" r="1.4" fill="#fff" />
  </svg>
);

export const MicrosoftLogo = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <rect x="0" y="0" width="9.4" height="9.4" fill="#f25022" />
    <rect x="10.6" y="0" width="9.4" height="9.4" fill="#7fba00" />
    <rect x="0" y="10.6" width="9.4" height="9.4" fill="#00a4ef" />
    <rect x="10.6" y="10.6" width="9.4" height="9.4" fill="#ffb900" />
  </svg>
);

/** Sheet1 #2 (2026-10-29): caret for the theme menu button. */
export function ChevronIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

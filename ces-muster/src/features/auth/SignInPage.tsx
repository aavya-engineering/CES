// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// SignInPage.tsx — the first screen of Muster.
//
// UI-03 (2026-10-24): matched to the Aavya wireframe "1. CES Compliance
// Security Login" at Vaibhav's request: the left panel IS the wireframe's
// artwork (public/brand/ces-signin-hero.jpg, cropped from the wireframe), with
// the same words repeated as screen-reader text; the right card reproduces the
// wireframe's controls, wording and icons. Product name: "Compliance Evidence
// System" (decision 2026-10-24).
//
// Behaviour (unchanged from UI-01):
//  - Email + password → POST /auth/login (musterAuth.ts); "Keep me signed in";
//    show/hide password; honest errors (wrong credentials, too many attempts,
//    disabled account, API not reachable).
//  - S1.9 (demo feedback 2026-10-27): Single sign-on, "Sign in with Microsoft"
//    and "Continue offline" are removed from the page (no identity provider is
//    chosen, PRD OQ-12). Offline mode stays available to developers and tests
//    through ?offline=1 (offline-first, DW#5).
//  - "Keep me signed in": the session survives closing the browser (until the
//    token expires) and the email is remembered on this device. Every session
//    ends after 30 minutes without activity (useIdleSignOut, NIST 3.1.11).
//  - Forgot password (decision D3): POST /auth/forgot-password sends a
//    single-use 30-minute link; #/reset-password?token=… sets a new password.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { requestPasswordReset, resetPassword, signInToMuster } from '@/shared/api/musterAuth';
import { resetTokenFromHash } from './resetLink';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CesShield,
  ChevronIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
  MailIcon,
  MoonIcon,
  SunIcon,
} from './icons';
import './signIn.css';

let offlineParamUsed = false;
const REMEMBER_EMAIL_KEY = 'ces-remember-email';
function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeRememberedEmail(email: string | null): void {
  try {
    if (email) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    else localStorage.removeItem(REMEMBER_EMAIL_KEY);
  } catch {
    /* storage blocked */
  }
}

export interface SignInPageProps {
  onSignedIn: () => void;
  onWorkOffline: () => void;
  /** Kept for compatibility; the page now has its own Light/Dark Mode menu. */
  themeToggle?: ReactNode;
  /** A message shown above the form, e.g. "signed out after 30 minutes without activity". */
  notice?: string | null;
  /** Replace the sign-in form with another panel (change password after a temporary one). */
  panel?: ReactNode;
  panelTitle?: string;
  onCancelPanel?: () => void;
}

/** Same contract as the app's theme toggle: data-theme on <html> + localStorage 'ces-theme'. */
function ThemeMenu() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  );
  const apply = (next: 'light' | 'dark') => {
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.setItem('ces-theme', next);
    } catch {
      /* storage blocked */
    }
    setTheme(next);
  };
  // Sheet1 #2/#3/#5 (2026-10-29): a real menu instead of a native <select> — the
  // native option list took the page's dark colours (the "Light Mode" option
  // vanished in dark mode) and clicking the icon did nothing.
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const pick = (next: 'light' | 'dark') => {
    apply(next);
    setOpen(false);
  };
  return (
    <div className="signin-theme-select" ref={box}>
      <button type="button" className="signin-theme-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Colour theme" onClick={() => setOpen((v) => !v)} data-testid="signin-theme">
        {theme === 'dark' ? <MoonIcon size={20} /> : <SunIcon size={20} />}
        <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="signin-theme-menu" role="menu">
          <button type="button" role="menuitemradio" aria-checked={theme === 'light'} onClick={() => pick('light')} data-testid="signin-theme-light">
            <SunIcon size={18} /> Light Mode
          </button>
          <button type="button" role="menuitemradio" aria-checked={theme === 'dark'} onClick={() => pick('dark')} data-testid="signin-theme-dark">
            <MoonIcon size={18} /> Dark Mode
          </button>
        </div>
      )}
    </div>
  );
}

function CardBrand() {
  return (
    <div className="signin-card-brand">
      <CesShield size={64} />
      <div>
        <div className="signin-card-name">CES</div>
        <div className="signin-card-sub">Compliance Evidence System</div>
      </div>
    </div>
  );
}

export default function SignInPage({ onSignedIn, onWorkOffline, notice, panel, panelTitle, onCancelPanel }: SignInPageProps) {
  const ids = useId();
  const [email, setEmail] = useState(readRememberedEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => readRememberedEmail() !== '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(() => resetTokenFromHash());
  const [done, setDone] = useState<string | null>(null);

  // Developers and tests can still work offline (DW#5) with ?offline=1 — once
  // per page load, so "Sign in" from the offline header still reaches this page.
  useEffect(() => {
    if (offlineParamUsed || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('offline') === '1') {
      offlineParamUsed = true;
      onWorkOffline();
    }
  }, [onWorkOffline]);

  // The CUI designation banner (ces-ui.css body::before) is hidden on this page
  // only, to match the wireframe: no CUI is shown before sign-in. It returns
  // on every screen after sign-in.
  useEffect(() => {
    document.body.classList.add('ces-signin');
    return () => document.body.classList.remove('ces-signin');
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setBusy(true);
    try {
      const outcome = await signInToMuster(email.trim(), password, { remember });
      setPassword('');
      if (outcome.ok) {
        writeRememberedEmail(remember ? email.trim() : null);
        onSignedIn();
      }
      else setError(capitalise(outcome.message) + '.');
    } finally {
      setBusy(false);
    }
  };

  const errorProps = error ? { 'aria-invalid': true as const, 'aria-describedby': `${ids}-error` } : {};

  return (
    <div className="signin-page" data-testid="signin-page">
      <section className="signin-hero" aria-labelledby={`${ids}-hero-title`}>
        <img src="/brand/ces-signin-hero.jpg" alt="" className="signin-hero-img" />
        {/* The artwork carries this text visually; repeated here for screen readers. */}
        <div className="sr-only">
          <p>CES — Compliance Evidence System. Secure, compliant, evidence-driven.</p>
          <p>Built for the Defense Industrial Base.</p>
          <h1 id={`${ids}-hero-title`}>Simplifying CMMC Compliance for a Stronger Tomorrow</h1>
          <p>Assess, configure, govern and prove compliance with CMMC Level 2 / NIST SP 800-171 Rev. 2.</p>
          <ul>
            <li>Muster — assess and plan</li>
            <li>Stamper — configure and verify</li>
            <li>AdminOps — govern ongoing changes</li>
            <li>EvidenceOps — prove and maintain</li>
          </ul>
          <p>CMMC Level 2, NIST SP 800-171 Rev. 2. Defense Industrial Base, secure and controlled. Evidence-driven, audit ready.</p>
        </div>
      </section>

      <section className="signin-side">
        <div className="signin-theme">
          <ThemeMenu />
        </div>

        <div className="signin-card">
          <CardBrand />

          {panel ? (
            <>
              <h2 className="signin-title">{panelTitle ?? 'Welcome Back'}</h2>
              {panel}
              {onCancelPanel && (
                <button type="button" className="signin-back" onClick={onCancelPanel} data-testid="signin-panel-cancel">
                  <ArrowLeftIcon /> Back to Sign In
                </button>
              )}
            </>
          ) : resetToken ? (
            <ResetPanel
              token={resetToken}
              onDone={(msg) => {
                setResetToken(null);
                setDone(msg);
                try {
                  window.history.replaceState(null, '', window.location.pathname);
                } catch {
                  /* ignore */
                }
              }}
            />
          ) : forgot ? (
            <ForgotPanel initialEmail={email} onBack={() => setForgot(false)} />
          ) : (
            <>
              <h2 className="signin-title">Welcome Back</h2>
              <p className="signin-intro">Sign in to access your engagements, manage compliance and maintain evidence.</p>

              {(notice || done) && (
                <p className="signin-status" role="status" data-testid="signin-status">
                  {done ?? notice}
                </p>
              )}
              {(
                <form
                  id={`${ids}-panel-password`}
                  aria-label="Sign in with email and password"
                  className="signin-form"
                  onSubmit={submit}
                  noValidate
                  data-testid="signin-form"
                >
                  <label htmlFor={`${ids}-email`}>Email address</label>
                  <div className="signin-field">
                    <MailIcon className="signin-field-icon" />
                    <input
                      id={`${ids}-email`}
                      type="email"
                      autoComplete="username"
                      placeholder="name@yourorganization.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="signin-email"
                      required
                      {...errorProps}
                    />
                  </div>

                  <label htmlFor={`${ids}-password`}>Password</label>
                  <div className="signin-field">
                    <LockIcon className="signin-field-icon" />
                    <input
                      id={`${ids}-password`}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      data-testid="signin-password"
                      required
                      {...errorProps}
                    />
                    <button
                      type="button"
                      className="signin-reveal"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      data-testid="signin-reveal"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                  </div>

                  <div className="signin-row">
                    <label className="signin-check">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="signin-remember" />
                      Keep me signed in
                    </label>
                    <button type="button" className="signin-link" data-testid="signin-forgot" onClick={() => setForgot(true)}>
                      Forgot password?
                    </button>
                  </div>

                  {error && (
                    <p id={`${ids}-error`} className="signin-error" role="alert" data-testid="signin-error">
                      {error}
                    </p>
                  )}

                  <button type="submit" className="signin-submit" disabled={busy} data-testid="signin-submit">
                    <span>{busy ? 'Signing in…' : 'Sign In'}</span>
                    <ArrowRightIcon />
                  </button>
                </form>
              )}

              <div className="signin-notice" role="note" data-testid="signin-notice">
                <InfoIcon />
                <div>
                  <strong>Authorized Use Only</strong>
                  <p>
                    CES is a U.S. Government contractor tool. By signing in, you agree to your organization&apos;s
                    acceptable use policy and all applicable security requirements.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

      </section>
    </div>
  );
}

function ForgotPanel({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const ids = useId();
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter your work email address.');
      return;
    }
    setBusy(true);
    const r = await requestPasswordReset(email.trim());
    setBusy(false);
    if (r.ok) setSent(r.message);
    else setError(r.message);
  };
  return (
    <div data-testid="signin-forgot-panel">
      <h2 className="signin-title">Forgot your password?</h2>
      <p className="signin-intro">Enter your work email address and we&apos;ll send you a link to reset your password.</p>
      {sent ? (
        <p className="signin-status" role="status" data-testid="signin-reset-sent">
          {sent} The link works once, for 30 minutes.
        </p>
      ) : (
        <form className="signin-form" onSubmit={submit} noValidate data-testid="signin-forgot-form">
          <label htmlFor={`${ids}-femail`}>Email address</label>
          <div className="signin-field">
            <MailIcon className="signin-field-icon" />
            <input
              id={`${ids}-femail`}
              type="email"
              autoComplete="username"
              placeholder="name@yourorganization.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="signin-forgot-email"
              {...(error ? { 'aria-invalid': true, 'aria-describedby': `${ids}-ferr` } : {})}
            />
          </div>
          {error && (
            <p id={`${ids}-ferr`} className="signin-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="signin-submit" disabled={busy} data-testid="signin-forgot-submit">
            <span>{busy ? 'Sending…' : 'Send Reset Link'}</span>
            <ArrowRightIcon />
          </button>
        </form>
      )}
      <button type="button" className="signin-back" onClick={onBack} data-testid="signin-back">
        <ArrowLeftIcon /> Back to Sign In
      </button>
      <div className="signin-notice" role="note">
        <InfoIcon />
        <div>
          <strong>Secure password reset</strong>
          <p>If an account exists for this email, you&apos;ll receive instructions to reset your password.</p>
        </div>
      </div>
    </div>
  );
}

function ResetPanel({ token, onDone }: { token: string; onDone: (message: string) => void }) {
  const ids = useId();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (pw.length < 12) return setError('Use at least 12 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    const r = await resetPassword(token, pw);
    setBusy(false);
    if (r.ok) onDone(r.message);
    else setError(r.message);
  };
  return (
    <div data-testid="signin-reset-panel">
      <h2 className="signin-title">Choose a new password</h2>
      <p className="signin-intro">Use at least 12 characters, and do not include your email name.</p>
      <form className="signin-form" onSubmit={submit} noValidate>
        <label htmlFor={`${ids}-pw1`}>New password</label>
        <div className="signin-field">
          <LockIcon className="signin-field-icon" />
          <input id={`${ids}-pw1`} type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="reset-password" />
          <button type="button" className="signin-reveal" aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((v) => !v)}>
            {show ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
        <label htmlFor={`${ids}-pw2`}>Confirm new password</label>
        <div className="signin-field">
          <LockIcon className="signin-field-icon" />
          <input id={`${ids}-pw2`} type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="reset-password-confirm" />
        </div>
        {error && (
          <p className="signin-error" role="alert" data-testid="reset-error">
            {error}
          </p>
        )}
        <button type="submit" className="signin-submit" disabled={busy} data-testid="reset-submit">
          <span>{busy ? 'Saving…' : 'Set New Password'}</span>
          <ArrowRightIcon />
        </button>
      </form>
    </div>
  );
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

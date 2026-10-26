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
//  - Single sign-on / Sign in with Microsoft: look as drawn, not available yet
//    (no identity provider chosen, PRD OQ-12). Pressing them says so.
//  - Forgot password: same panel layout as wireframe 2, but it says plainly
//    that no email is sent — CES has no email service.
//  - "Continue without signing in" (offline-first, DW#5) sits below the card.
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { signInToMuster } from '@/shared/api/musterAuth';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingIcon,
  CesShield,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
  MailIcon,
  MicrosoftLogo,
  MoonIcon,
  SunIcon,
} from './icons';
import './signIn.css';

type Method = 'password' | 'sso';

export interface SignInPageProps {
  onSignedIn: () => void;
  onWorkOffline: () => void;
  /** Kept for compatibility; the page now has its own Light/Dark Mode menu. */
  themeToggle?: ReactNode;
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
  return (
    <label className="signin-theme-select">
      {theme === 'dark' ? <MoonIcon size={20} /> : <SunIcon size={20} />}
      <select
        aria-label="Colour theme"
        value={theme}
        onChange={(e) => apply(e.target.value as 'light' | 'dark')}
        data-testid="signin-theme"
      >
        <option value="light">Light Mode</option>
        <option value="dark">Dark Mode</option>
      </select>
    </label>
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

export default function SignInPage({ onSignedIn, onWorkOffline, panel, panelTitle, onCancelPanel }: SignInPageProps) {
  const ids = useId();
  const [method, setMethod] = useState<Method>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const [msNote, setMsNote] = useState(false);

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
      if (outcome.ok) onSignedIn();
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
          ) : forgot ? (
            <div data-testid="signin-forgot-panel">
              <h2 className="signin-title">Forgot your password?</h2>
              <p className="signin-intro" data-testid="signin-reset-help">
                Muster has no self-service password reset yet, so no email is sent. Ask your platform administrator to
                reset it from <strong>Platform → Users</strong>. You will get a temporary password and choose a new
                one at your next sign-in.
              </p>
              <button type="button" className="signin-submit" onClick={() => setForgot(false)} data-testid="signin-back">
                <span>Back to Sign In</span>
                <ArrowLeftIcon />
              </button>
              <div className="signin-notice" role="note">
                <InfoIcon />
                <div>
                  <strong>Secure password reset</strong>
                  <p>
                    A reset link by email needs an email service and a verified address for every user. That is an
                    open decision for Blue Heron Defense.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <h2 className="signin-title">Welcome Back</h2>
              <p className="signin-intro">Sign in to access your engagements, manage compliance and maintain evidence.</p>

              <div className="signin-methods" role="tablist" aria-label="Sign-in method">
                <button
                  type="button"
                  role="tab"
                  id={`${ids}-tab-password`}
                  aria-selected={method === 'password'}
                  aria-controls={`${ids}-panel-password`}
                  className={method === 'password' ? 'is-active' : undefined}
                  data-testid="signin-method-password"
                  onClick={() => setMethod('password')}
                >
                  <MailIcon size={20} /> Email &amp; Password
                </button>
                <button
                  type="button"
                  role="tab"
                  id={`${ids}-tab-sso`}
                  aria-selected={method === 'sso'}
                  aria-controls={`${ids}-panel-sso`}
                  className={method === 'sso' ? 'is-active' : undefined}
                  data-testid="signin-method-sso"
                  onClick={() => setMethod('sso')}
                >
                  <BuildingIcon size={20} /> Single Sign-On (SSO)
                </button>
              </div>

              {method === 'password' ? (
                <form
                  id={`${ids}-panel-password`}
                  role="tabpanel"
                  aria-labelledby={`${ids}-tab-password`}
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
              ) : (
                <div id={`${ids}-panel-sso`} role="tabpanel" aria-labelledby={`${ids}-tab-sso`} className="signin-form" data-testid="signin-sso-panel">
                  <p className="signin-note">
                    Single sign-on is not set up for CES yet. It depends on which identity provider Blue Heron Defense
                    chooses. Use your email and password for now.
                  </p>
                  <button type="button" className="signin-submit" onClick={() => setMethod('password')}>
                    <span>Use Email &amp; Password</span>
                    <ArrowRightIcon />
                  </button>
                </div>
              )}

              <div className="signin-divider" aria-hidden="true">
                <span>OR</span>
              </div>

              <button
                type="button"
                className="signin-microsoft"
                aria-disabled="true"
                aria-describedby={msNote ? `${ids}-ms-note` : undefined}
                onClick={() => setMsNote(true)}
                data-testid="signin-microsoft"
              >
                <MicrosoftLogo /> Sign in with Microsoft
              </button>
              {msNote && (
                <p id={`${ids}-ms-note`} className="signin-note" role="status" data-testid="signin-microsoft-note">
                  Sign in with Microsoft is not available yet — it waits for the identity-provider decision. Use your
                  email and password.
                </p>
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

        {!panel && (
          <button type="button" className="signin-offline" onClick={onWorkOffline} data-testid="signin-work-offline">
            Continue offline without signing in
          </button>
        )}
      </section>
    </div>
  );
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

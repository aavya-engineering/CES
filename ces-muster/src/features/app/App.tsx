// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { useState, useEffect, useCallback } from 'react';
import { TimingProvider } from '@/features/timer/TimingContext';
import TimerBar from '@/features/timer/TimerBar';
import AssessmentPage from '@/features/assessment/AssessmentPage';
import ResultScreen from '@/features/scoring/ResultScreen';
import StaticRollup from '@/features/rollup/StaticRollup';
import QuickSession from '@/features/quick/QuickSession';
import ContractsPage from '@/features/contracts/ContractsPage';
import ShellNav from '@/features/app/ShellNav';
import DiscoveryOffer from '@/features/discovery/DiscoveryOffer';
import DiscoverySubTab from '@/features/discovery/DiscoverySubTab';
import BoundaryConfirmPanel from '@/features/discovery/BoundaryConfirmPanel';
import type { DiscoveryResult } from '@/__fixtures__/discoveryResults';
import { runDiscoveryOnApi } from '@/features/discovery/discoveryRunService';
import { runSimHarvest } from '@/features/assessment/harvestRunService';
import ReadinessTab from '@/features/readiness/ReadinessTab';
import PlanTab from '@/features/plan/PlanTab';
import { executeExportAndDownload } from '@/features/export/exportPipeline';
import { db } from '@/shared/db/schema';
import SignInPage from '@/features/auth/SignInPage';
import PortalShell from '@/features/portal/PortalShell';
import { useIdleSignOut } from '@/features/app/idleSignOut';
import { refreshMusterSession } from '@/shared/api/musterAuth';
import { defaultRoute, routesFor, type MusterView, type RouteId, type Viewer } from '@/features/portal/nav';
import { currentAccount, parseHash, writeOfflineChoice, type Account } from './account';
import RequirementsPage from '@/features/portal/pages/RequirementsPage';
import SprsWeightsPage from '@/features/portal/pages/SprsWeightsPage';
import ObjectivesPage from '@/features/portal/pages/ObjectivesPage';
import { EvidenceCatalogPage, EvidenceMappingPage } from '@/features/portal/pages/EvidencePages';
import CatalogPage from '@/features/portal/pages/shared/CatalogPage';
import MappingPage from '@/features/portal/pages/shared/MappingPage';
import RulesPage from '@/features/portal/pages/shared/RulesPage';
import { SharedViewerContext, type SharedViewer } from '@/features/portal/governedState';
import { ContractsInfoPage, HelpPage, ModulePage, NotBuiltPage, SharedOverviewPage } from '@/features/portal/pages/InfoPages';
import { EngagementsPage, HomePage } from '@/features/portal/pages/HomeAndEngagements';
import PortfolioPage from '@/features/portal/PortfolioPage';
import { AuditPage, ChangePasswordForm, ChangePasswordPage, RolesPage, UsersPage } from '@/features/portal/pages/AdminPages';
import { MUSTER_AUTH_EVENT, clearMusterToken } from '@/shared/api/musterToken';
import type { EngagementKind, InterviewFact } from '@/shared/types/engagement';
import type { ReadinessConsent, ReadinessObservation } from '@/shared/types/readinessResult';

/** S1.8: roles whose Home is the portfolio dashboard (muster-api portfolio.read). */
const PORTFOLIO_VIEWERS = ['bhd_operator', 'prime', 'platform_admin'];

type View =
  | 'assessment'
  | 'result'
  | 'rollup'
  | 'quick-session'
  | 'contracts'
  | 'help'
  | 'discovery'
  | 'readiness'
  | 'plan';

interface AppState {
  view: View;
  engagementId: string | null;
  engagementKind: EngagementKind | null;
  /** In-progress session the assessment view should resume. */
  sessionId: string | null;
  /** Completed session shown by the result view. */
  completedSessionId: string | null;
  /** Current party ID, set after Begin Interview; used by ContractsPage. */
  partyId: string | null;
}

const APP_VERSION = 'v2.2.3';

// Theme toggle — same contract as the shared ces-theme-toggle.js
// (localStorage key "ces-theme", data-theme="dark" attribute on <html>).
// document/localStorage access is guarded so MusterNav stays renderable
// via renderToStaticMarkup in node-env unit tests (DW#3b).
function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light'
  );

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('ces-theme', next);
    setTheme(next);
  };

  return (
    <button
      id="ces-theme-toggle"
      onClick={toggle}
      aria-label="Toggle light/dark theme"
      title="Toggle light/dark theme"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

// Exported for narrow component testing (DW#3b)
export function MusterNav({
  kind,
  onNavigate,
  account,
  onSignOut,
  onSignIn,
  embedded = false,
}: {
  kind: EngagementKind | null;
  onNavigate: (v: View) => void;
  /** UI-02: inside the portal the top bar owns the theme toggle and the account. */
  embedded?: boolean;
  /** UI-01; optional so narrow component tests can render the nav alone. */
  account?: Account;
  onSignOut?: () => void;
  onSignIn?: () => void;
}) {
  return (
    <header className="ces-header">
      <button
        className="header-brand"
        onClick={() => onNavigate('assessment')}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <img src="/ces-logo.svg" alt="" className="header-logo" />
        <span>CES Muster</span>
        <span className="header-company">Blue Heron Defense — Muster</span>
      </button>
      <div className="header-controls">
        <button
          className="header-nav-btn"
          data-testid="quick-session-nav"
          onClick={() => onNavigate('quick-session')}
        >
          Quick Session
        </button>
        {/* Contracts button appears for BOTH engagement kinds */}
        <button
          className="header-nav-btn"
          data-testid="contracts-nav"
          onClick={() => onNavigate('contracts')}
        >
          Contracts
        </button>
        {kind === 'prime_and_subs' && (
          <button
            className="header-nav-btn"
            data-testid="rollup-nav"
            onClick={() => onNavigate('rollup')}
          >
            Rollup
          </button>
        )}
        <span className="header-version">{APP_VERSION}</span>
        {!embedded && account?.kind === 'signed-in' && (
          <span className="header-account" data-testid="header-account">
            <span className="header-account-label">Signed in · {account.role}</span>
            <button
              className="header-nav-btn"
              data-testid="header-signout"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </span>
        )}
        {!embedded && account?.kind === 'offline' && (
          <span className="header-account" data-testid="header-account">
            <span className="header-account-label">Working offline</span>
            <button
              className="header-nav-btn"
              data-testid="header-signin"
              onClick={onSignIn}
            >
              Sign in
            </button>
          </span>
        )}
        {!embedded && <ThemeToggle />}
      </div>
    </header>
  );
}

export default function App() {
  // UI-01: sign-in gate. Evaluated locally on mount; follows later changes.
  const [account, setAccount] = useState<Account>(currentAccount);
  useEffect(() => {
    const sync = () => setAccount(currentAccount());
    window.addEventListener(MUSTER_AUTH_EVENT, sync);
    return () => window.removeEventListener(MUSTER_AUTH_EVENT, sync);
  }, []);

  // S1.9: sign out after 30 minutes without activity (warning 2 minutes before).
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null);
  const idle = useIdleSignOut(account.kind === 'signed-in', () => {
    writeOfflineChoice(false);
    clearMusterToken();
    setSignOutNotice('You were signed out after 30 minutes without activity. Sign in again to continue.');
    setAccount({ kind: 'signed-out' });
  }, undefined, refreshMusterSession);

  // UI-02: portal route, mirrored in the URL hash (#/shared/requirements,
  // #/muster/discovery) so the back button and deep links work.
  const viewer: Viewer =
    account.kind === 'signed-in' ? { kind: 'signed-in', role: account.roleId } : { kind: 'offline' };
  const resolveRoute = useCallback(
    (wanted: RouteId | null): RouteId => (wanted && routesFor(viewer).has(wanted) ? wanted : defaultRoute(viewer)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account.kind, account.kind === 'signed-in' ? account.roleId : '']
  );
  const [route, setRoute] = useState<RouteId>(() => resolveRoute(parseHash().route));
  useEffect(() => {
    setRoute(resolveRoute(parseHash().route));
  }, [resolveRoute]);

  const [state, setState] = useState<AppState>({
    view: 'assessment',
    engagementId: null,
    engagementKind: null,
    sessionId: null,
    completedSessionId: null,
    partyId: null,
  });

  // Discovery branch sub-step: 'offer' (pros/cons + Run/Skip), 'running'
  // (sub-tab), or 'confirm' (GO-2 M1 boundary confirm/correct — rung 1's
  // "correction, not creation" step between the run and the interview).
  // 'Skip to Manual' navigates straight to the assessment view (M5 parity) and
  // never sets this to 'running'.
  const [discoveryStep, setDiscoveryStep] = useState<'offer' | 'running' | 'confirm'>('offer');
  // GO-2 M3: the results feeding the confirm step — the canned fixture for a
  // "run", or a parsed script-upload results file (import-file mode; one
  // mechanism, one downstream path).
  // W4-MU2 (MU-02): a "run" is now the REAL sim executor via muster-api
  // (discoveryRunService) — no canned rows; empty until a run or import lands.
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryResult[]>([]);
  const [discoveryRunBusy, setDiscoveryRunBusy] = useState(false);
  const [discoveryRunError, setDiscoveryRunError] = useState('');
  // W4-MU2 (MU-06): Graph harvest prefill (sim).
  const [harvestBusy, setHarvestBusy] = useState(false);
  const [harvestError, setHarvestError] = useState('');
  // PLAN-2 M1: facts[] carried by an imported readiness-result payload.
  const [payloadFacts, setPayloadFacts] = useState<InterviewFact[]>([]);
  // FC-MU-3: live consents from an imported / API-run readiness record.
  const [payloadConsents, setPayloadConsents] = useState<ReadinessConsent[]>([]);
  // MG-23: the executor's full observation rows, persisted with the session.
  const [payloadObservations, setPayloadObservations] = useState<ReadinessObservation[]>([]);

  // On mount, detect any in-progress session and resume from where the user left off.
  useEffect(() => {
    const checkResume = async () => {
      const session = await db.interview_sessions
        .where('status')
        .equals('in_progress')
        .first();
      if (!session) return;
      const party = await db.assessed_parties.get(session.party_id);
      if (!party) return;
      const engagement = await db.engagements.get(party.engagement_id);
      if (!engagement) return;
      setState({
        view: 'assessment',
        engagementId: engagement.id,
        engagementKind: engagement.engagement_kind,
        sessionId: session.id,
        completedSessionId: null,
        partyId: party.id,
      });
    };
    void checkResume();
  }, []);

  const navigate = (view: View) => setState((prev) => ({ ...prev, view }));

  // Open a hash-linked Muster view on first load (#/muster/discovery).
  useEffect(() => {
    const v = parseHash().view;
    if (v) setState((prev) => ({ ...prev, view: v as View }));
  }, []);

  const go = useCallback(
    (r: RouteId, v?: MusterView) => {
      setRoute(resolveRoute(r));
      if (r === 'muster' && v) setState((prev) => ({ ...prev, view: v as View }));
    },
    [resolveRoute]
  );

  // Keep the hash in step with what is shown; follow back/forward.
  useEffect(() => {
    if (account.kind !== 'signed-in' && account.kind !== 'offline') return;
    const want = route === 'muster' ? `#/muster/${state.view}` : `#/${route}`;
    if (window.location.hash !== want) window.history.pushState(null, '', want);
  }, [route, state.view, account.kind]);
  useEffect(() => {
    const onPop = () => {
      const h = parseHash();
      setRoute(resolveRoute(h.route));
      if (h.view) setState((prev) => ({ ...prev, view: h.view as View }));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [resolveRoute]);

  const handleEngagementReady = useCallback(
    (kind: EngagementKind, engagementId: string, partyId: string) => {
      // C2: thread the real party_id so ContractsPage attaches new contracts to
      // the party even mid-new-session (previously null until a resume).
      setState((prev) => ({ ...prev, engagementKind: kind, engagementId, partyId }));
    },
    []
  );

  const handleInterviewComplete = (sessionId: string) => {
    setState((prev) => ({ ...prev, view: 'result', completedSessionId: sessionId, sessionId: null }));
  };

  const handleExport = async () => {
    if (!state.completedSessionId) return;
    await executeExportAndDownload(state.completedSessionId);
  };

  if (account.kind === 'signed-out') {
    return (
      <SignInPage
        notice={signOutNotice}
        onSignedIn={() => {
          writeOfflineChoice(false);
          setSignOutNotice(null);
          setAccount(currentAccount());
        }}
        onWorkOffline={() => {
          writeOfflineChoice(true);
          setAccount({ kind: 'offline' });
        }}
      />
    );
  }

  if (account.kind === 'must-change') {
    return (
      <SignInPage
        onSignedIn={() => setAccount(currentAccount())}
        onWorkOffline={() => {
          clearMusterToken();
          writeOfflineChoice(true);
          setAccount({ kind: 'offline' });
        }}
        panel={
          <ChangePasswordForm
            required
            email={account.email ?? undefined}
            onDone={() => setAccount(currentAccount())}
          />
        }
        panelTitle="Choose your password"
        onCancelPanel={() => {
          clearMusterToken();
          setAccount({ kind: 'signed-out' });
        }}
      />
    );
  }

  const signOut = () => {
    // Signs out of muster-api only. Assessment data stays in this browser's
    // IndexedDB (offline-first); clearing it on sign-out is a BHD decision for
    // shared hosting (docs/sign-in.md, decision L3).
    writeOfflineChoice(false);
    clearMusterToken();
    setAccount({ kind: 'signed-out' });
  };

  const portalUser =
    account.kind === 'signed-in' ? { name: account.name, email: account.email, roleLabel: account.role } : null;

  const sharedViewer: SharedViewer = {
    signedIn: account.kind === 'signed-in',
    canEdit: account.kind === 'signed-in' && account.roleId === 'platform_admin',
    userId: account.kind === 'signed-in' ? account.sub : null,
  };

  const page = (() => {
    switch (route) {
      case 'home':
        // S1.8: the wireframe portfolio for roles that may read it (operator, prime;
        // platform administrator gets counts only); others keep the device view.
        return viewer.kind === 'signed-in' && PORTFOLIO_VIEWERS.includes(viewer.role) ? (
          <PortfolioPage go={go} openMuster={(v) => go('muster', v)} />
        ) : (
          <HomePage viewer={viewer} name={portalUser?.name ?? null} go={go} openMuster={(v) => go('muster', v)} />
        );
      case 'shared/overview':
        return <SharedOverviewPage go={go} />;
      case 'shared/requirements':
        return <RequirementsPage />;
      case 'shared/sprs':
        return <SprsWeightsPage />;
      case 'shared/objectives':
        return <ObjectivesPage />;
      // S1.2: signed in → governed content from muster-api (add / edit / publish);
      // offline → the read-only files, no network call (DW#5).
      case 'shared/evidence':
        return sharedViewer.signedIn ? <CatalogPage /> : <EvidenceCatalogPage />;
      case 'shared/mapping':
        return sharedViewer.signedIn ? <MappingPage /> : <EvidenceMappingPage />;
      case 'shared/contracts':
        return <ContractsInfoPage />;
      case 'shared/rules':
        return sharedViewer.signedIn ? <RulesPage /> : <NotBuiltPage route={route} />;
      case 'shared/tests':
      case 'shared/registry':
      case 'shared/compat':
      case 'shared/interfaces':
      case 'store/adminops':
      case 'store/tokens':
      case 'store/passkeys':
      case 'store/integrity':
      case 'engagements/tenants':
        return <NotBuiltPage route={route} />;
      case 'engagements/all':
        return <EngagementsPage viewer={viewer} openMuster={(v) => go('muster', v)} />;
      case 'module/stamper':
        return <ModulePage module="stamper" />;
      case 'module/adminops':
        return <ModulePage module="adminops" />;
      case 'module/evidenceops':
        return <ModulePage module="evidenceops" />;
      case 'platform/users':
        return <UsersPage selfId={account.kind === 'signed-in' ? account.sub ?? undefined : undefined} />;
      case 'platform/roles':
        return <RolesPage />;
      case 'platform/audit':
        return <AuditPage />;
      case 'account/password':
        return <ChangePasswordPage />;
      case 'help':
        return <HelpPage role={account.kind === 'signed-in' ? account.roleId : null} go={go} />;
      default:
        return null;
    }
  })();

  return (
    <PortalShell
      viewer={viewer}
      user={portalUser}
      route={route}
      musterView={state.view as MusterView}
      onGo={go}
      onSignOut={signOut}
      onSignIn={() => {
        // S1.9: drop ?offline=1 so the sign-in page does not switch straight back to offline.
        try {
          if (window.location.search) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
        } catch {
          /* ignore */
        }
        writeOfflineChoice(false);
        setAccount({ kind: 'signed-out' });
      }}
      themeToggle={<ThemeToggle />}
      userId={sharedViewer.userId}
    >
      {idle.left !== null && (
        <div className="idle-warning" role="alertdialog" aria-live="assertive" aria-label="Session ending" data-testid="idle-warning">
          <p>
            <strong>Your session is about to end.</strong> You will be signed out in {Math.ceil(idle.left / 1000)} seconds because
            there has been no activity for almost 30 minutes.
          </p>
          <button type="button" className="btn btn-primary" onClick={idle.stay} data-testid="idle-stay">
            Stay signed in
          </button>
        </div>
      )}
      {route !== 'muster' ? (
        <SharedViewerContext.Provider value={sharedViewer}>{page}</SharedViewerContext.Provider>
      ) : (
    <TimingProvider>
      <div className="portal-module-bar">
      <ShellNav onNavigate={navigate} planEnabled={!!state.completedSessionId} />
      <MusterNav
        embedded
        kind={state.engagementKind}
        onNavigate={navigate}
        account={account}
        onSignOut={signOut}
      />
      </div>

      <main style={{ minHeight: 'calc(100vh - 200px)' }}>
        {state.view === 'result' && (
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
            <TimerBar />
          </div>
        )}

        {state.view === 'assessment' && (
          <AssessmentPage
            key={state.sessionId ?? 'fresh'}
            existingSessionId={state.sessionId ?? undefined}
            onEngagementReady={handleEngagementReady}
            onComplete={handleInterviewComplete}
          />
        )}

        {state.view === 'result' && state.completedSessionId && (
          <ResultScreen sessionId={state.completedSessionId} onExport={handleExport} />
        )}

        {state.view === 'rollup' && state.engagementKind === 'prime_and_subs' && (
          <section data-testid="roster-section">
            <StaticRollup />
          </section>
        )}

        {state.view === 'quick-session' && <QuickSession />}

        {state.view === 'contracts' && (
          <ContractsPage
            engagementKind={state.engagementKind}
            partyId={state.partyId}
          />
        )}

        {state.view === 'help' && (
          <div className="page" data-testid="help-view">
            <div className="ces-titleblock" style={{ marginBottom: 16 }}>
              <span className="tb-title">Help</span>
            </div>
            <p>
              Muster walks you through a discovery-first CMMC readiness assessment.
              Start on Situation to declare the engagement, use Discovery to
              auto-resolve objective coverage, then review your Readiness posture.
            </p>
          </div>
        )}

        {state.view === 'discovery' && discoveryStep === 'offer' && (
          <DiscoveryOffer
            runBusy={discoveryRunBusy}
            runError={discoveryRunError}
            harvestBusy={harvestBusy}
            harvestError={harvestError}
            onHarvestFromTenant={() => {
              setHarvestBusy(true);
              setHarvestError('');
              void runSimHarvest().then((o) => {
                setHarvestBusy(false);
                if (!o.ok) {
                  setHarvestError(o.message);
                  return;
                }
                // The store is written; the interview's mount-time prefill
                // reads it (AUTO-DETECTED answers, existing answers win).
                navigate('assessment');
              });
            }}
            onRunDiscovery={() => {
              setDiscoveryRunBusy(true);
              setDiscoveryRunError('');
              void runDiscoveryOnApi().then((o) => {
                setDiscoveryRunBusy(false);
                if (!o.ok) {
                  setDiscoveryRunError(o.message);
                  return;
                }
                setDiscoveryResults(o.results);
                setPayloadFacts(o.facts);
                setPayloadConsents(o.consents);
                setPayloadObservations(o.observations);
                setDiscoveryStep('running');
              });
            }}
            onSkip={() => navigate('assessment')}
            onImportResults={(results, importedFacts, importedConsents, importedObservations) => {
              setDiscoveryResults(results);
              setPayloadFacts(importedFacts ?? []);
              setPayloadConsents(importedConsents ?? []);
              setPayloadObservations(importedObservations ?? []);
              setDiscoveryStep('confirm');
            }}
          />
        )}

        {state.view === 'discovery' && discoveryStep === 'running' && (
          <DiscoverySubTab results={discoveryResults} onContinue={() => setDiscoveryStep('confirm')} />
        )}

        {state.view === 'discovery' && discoveryStep === 'confirm' && (
          <BoundaryConfirmPanel
            results={discoveryResults}
            payloadFacts={payloadFacts}
            payloadConsents={payloadConsents}
            payloadObservations={payloadObservations}
            onContinue={() => navigate('assessment')}
          />
        )}

        {state.view === 'readiness' && (
          <ReadinessTab completedSessionId={state.completedSessionId} />
        )}

        {state.view === 'plan' && (
          <PlanTab completedSessionId={state.completedSessionId} />
        )}
      </main>

      <footer className="ces-footer">
        CES Muster {APP_VERSION} · Compliance Evidence System · Blue Heron Defense
      </footer>
    </TimingProvider>
      )}
    </PortalShell>
  );
}

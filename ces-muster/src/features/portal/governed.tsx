// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// governed.tsx — S1.2: shared pieces for the CES-Shared edit screens:
// status pill, draft/publish/discard/retire bar (no self-approval), version
// history and change list, side drawer.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { sharedApi, type ItemDetail, type ItemView, type Kind } from '@/shared/api/sharedApi';
import { actorLabel, describeFailure, statusOf, useSharedViewer } from './governedState';

export function StatusPill({ view }: { view: ItemView<unknown> }) {
  const s = statusOf(view);
  return (
    <span className="pill" data-tone={s.tone} data-testid="item-status">
      {s.label}
    </span>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * The governance bar for one item. Publish is disabled for the draft's own
 * author (the server refuses it too: SELF_APPROVAL).
 */
export function GovernanceBar({ kind, view, onChanged }: { kind: Kind; view: ItemView<unknown>; onChanged: (msg: string) => void }) {
  const viewer = useSharedViewer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!viewer.canEdit) return null;
  const who = (id: string | null) => actorLabel(id, viewer.userId);
  const draft = view.draft;
  const ownDraft = !!draft && (draft.created_by === viewer.userId || draft.updated_by === viewer.userId);

  const run = async (fn: () => ReturnType<typeof sharedApi.publish> | ReturnType<typeof sharedApi.discardDraft>, msg: string) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(describeFailure(r));
    onChanged(msg);
  };

  return (
    <div className="gov-bar" data-testid="gov-bar">
      {draft ? (
        <p className="gov-note">
          <strong>Draft v{draft.version}</strong> by {who(draft.updated_by)} · {when(draft.updated_at)}
          {ownDraft && <span className="gov-sod"> — a second administrator must publish it.</span>}
        </p>
      ) : (
        <p className="gov-note">
          {view.published ? <>Published v{view.published.version} · {when(view.published.published_at)} by {who(view.published.published_by)}</> : 'Retired'}
        </p>
      )}
      <div className="gov-actions">
        {draft && (
          <>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => run(() => sharedApi.discardDraft(kind, view.key), 'Draft discarded.')} data-testid="gov-discard">
              Discard draft
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || ownDraft}
              title={ownDraft ? 'You edited this draft; another administrator publishes it.' : undefined}
              onClick={() => run(() => sharedApi.publish(kind, view.key), `Published v${draft.version}.`)}
              data-testid="gov-publish"
            >
              Publish v{draft.version}
            </button>
          </>
        )}
        {view.published && (
          <button type="button" className="btn btn-ghost btn-danger-text" disabled={busy} onClick={() => setConfirm(true)} data-testid="gov-retire">
            Delete
          </button>
        )}
      </div>
      {error && (
        <p className="note" data-tone="bad" role="alert" data-testid="gov-error">
          {error}
        </p>
      )}
      {confirm && (
        <DeleteItemDialog
          kind={kind}
          view={view}
          name={view.key}
          onCancel={() => setConfirm(false)}
          onDone={(msg) => {
            setConfirm(false);
            onChanged(msg);
          }}
        />
      )}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  seed: 'Imported',
  'draft.create': 'Draft created',
  'draft.update': 'Draft updated',
  'draft.delete': 'Draft discarded',
  publish: 'Published',
  retire: 'Retired',
};

export function VersionHistory({ detail }: { detail: ItemDetail<unknown> }) {
  const viewer = useSharedViewer();
  const who = (id: string | null) => actorLabel(id, viewer.userId);
  return (
    <div data-testid="version-history">
      <table className="tbl tbl-compact">
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Status</th>
            <th scope="col">Published</th>
          </tr>
        </thead>
        <tbody>
          {detail.versions.map((v) => (
            <tr key={v.id}>
              <td>v{v.version}</td>
              <td>{v.status}</td>
              <td>{v.published_at ? `${when(v.published_at)} · ${who(v.published_by)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail.changes.length > 0 && (
        <ol className="change-list">
          {detail.changes.map((c) => (
            <li key={c.id}>
              <strong>{ACTION_LABEL[c.action] ?? c.action}</strong>
              {c.version ? ` v${c.version}` : ''} · {who(c.actor_user_id)} · {when(c.at)}
              {Array.isArray(c.detail?.fields) && (c.detail!.fields as string[]).length > 0 && (
                <span className="muted"> — {(c.detail!.fields as string[]).join(', ')}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  testId,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  testId?: string;
  wide?: boolean;
}) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className={`drawer${wide ? ' drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="drawer-sub">{subtitle}</p>}
          </div>
          <button type="button" className="icon-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        <div className="drawer-foot">{footer}</div>
      </div>
    </>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  // Standard: confirmation toasts close themselves after 6 s (and on ×).
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="toast" role="status" data-testid="toast">
      {message}
      <button type="button" className="icon-x" onClick={onDone} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

/** Small tag-list editor: one entry per line. */
export function LinesInput({ value, onChange, label, testId, placeholder }: { value: string[]; onChange: (v: string[]) => void; label: string; testId?: string; placeholder?: string }) {
  return (
    <label className="form-row">
      {label}
      <textarea maxLength={2000}
        className="input"
        rows={4}
        value={value.join('\n')}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trimStart()))}
        onBlur={() => onChange(value.map((s) => s.trim()).filter(Boolean))}
        data-testid={testId}
      />
      <span className="hint">One per line.</span>
    </label>
  );
}

export interface RowAction {
  label: string;
  onSelect: () => void;
  tone?: 'danger';
  testId?: string;
  /** Shown greyed out with this reason as a tooltip (QA 2026-10-30: say why, don't hide). */
  disabledReason?: string;
}

/**
 * Standard row "⋮" menu (View / Edit / Delete). Closes on outside click and
 * Escape; arrow keys move between items (WAI-ARIA menu button pattern).
 */
export function RowActions({ label, actions, testId }: { label: string; actions: RowAction[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    // Fixed position from the button, so the table's scroll box never clips the menu.
    const btn = ref.current?.querySelector<HTMLButtonElement>('.row-menu-btn');
    const r = btn?.getBoundingClientRect();
    if (r) {
      const height = 8 + actions.length * 38;
      const below = r.bottom + 4 + height <= window.innerHeight;
      setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - height), left: Math.max(8, r.right - 180) });
    }
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const shut = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    // preventScroll: focusing the first item must not scroll the table box, which would fire the
    // scroll listener above and close the menu on its first click (S1.10, short tables).
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [open, actions.length]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>('.row-menu-btn')?.focus();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };
  if (!actions.length) return null;
  return (
    <div className="row-menu" ref={ref} onKeyDown={onKey}>
      <button
        type="button"
        className="row-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Actions for ${label}`}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        ⋮
      </button>
      {open && (
        <div className="row-menu-list" role="menu" id={id} style={pos ? { position: 'fixed', top: pos.top, left: pos.left, right: 'auto' } : undefined}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              data-tone={a.tone}
              data-testid={a.testId}
              disabled={!!a.disabledReason}
              aria-disabled={!!a.disabledReason || undefined}
              title={a.disabledReason}
              onClick={() => {
                if (a.disabledReason) return;
                setOpen(false);
                a.onSelect();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Standard confirmation dialog for destructive actions. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        data-testid="confirm-dialog"
      >
        <h2 id="confirm-title" className="modal-title">
          {title}
        </h2>
        <div className="modal-body">{children}</div>
        {error && (
          <p className="note" data-tone="bad" role="alert">
            {error}
          </p>
        )}
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onCancel} ref={ref}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy} data-testid="confirm-ok">
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Standard Delete for governed items. A draft that was never published is
 * deleted; anything published is retired (soft delete): it leaves use, and its
 * versions and change log stay for audit (PRD SH-FR-05, NIST 3.3.1).
 */
/** QA 2026-10-30: delete several organisation-defined requirements at once (NIST rows are skipped). */
export function BulkDeleteDialog({
  views,
  skipped,
  onCancel,
  onDone,
}: {
  views: ItemView<unknown>[];
  skipped: number;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    let ok = 0;
    for (const v of views) {
      const r = v.published ? await sharedApi.retire('custom_requirement', v.key) : await sharedApi.discardDraft('custom_requirement', v.key);
      if (r.ok) ok++;
      else {
        setError(`${v.key}: ${r.message} (${ok} of ${views.length} deleted)`);
        setBusy(false);
        return;
      }
    }
    onDone(`${ok} requirement${ok === 1 ? '' : 's'} deleted.${skipped ? ` ${skipped} NIST requirement${skipped === 1 ? ' was' : 's were'} skipped (locked).` : ''}`);
  };
  return (
    <ConfirmDialog title={`Delete ${views.length} requirement${views.length === 1 ? '' : 's'}?`} confirmLabel="Delete" busy={busy} error={error} onConfirm={run} onCancel={onCancel}>
      <p>Organisation-defined requirements will be removed from use (published ones are retired and keep their history).</p>
      {skipped > 0 && <p className="hint">{skipped} selected NIST SP 800-171 requirement{skipped === 1 ? ' is' : 's are'} part of the locked 110 and will be skipped.</p>}
      <ul className="hint" style={{ margin: '8px 0 0', paddingLeft: 18, maxHeight: 160, overflow: 'auto' }}>
        {views.map((v) => (
          <li key={v.key}>{v.key}</li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}

export function DeleteItemDialog({
  kind,
  view,
  name,
  onCancel,
  onDone,
}: {
  kind: Kind;
  view: ItemView<unknown>;
  name: string;
  onCancel: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftOnly = !view.published;
  const run = async () => {
    setBusy(true);
    setError(null);
    const r = draftOnly ? await sharedApi.discardDraft(kind, view.key) : await sharedApi.retire(kind, view.key);
    setBusy(false);
    if (!r.ok) return setError(describeFailure(r));
    onDone(draftOnly ? `${name} deleted.` : `${name} deleted (retired). Its history is kept.`);
  };
  return (
    <ConfirmDialog title={`Delete ${name}?`} confirmLabel="Delete" busy={busy} error={error} onConfirm={run} onCancel={onCancel}>
      {draftOnly ? (
        <p>This draft was never published. It will be removed.</p>
      ) : (
        <>
          <p>
            It will be removed from use (retired) and no longer shown to readers.
            {view.draft ? ' The unpublished draft stays and can be discarded separately.' : ''}
          </p>
          <p className="muted">Published versions are never erased: they stay in the version history and the change log for audit.</p>
        </>
      )}
    </ConfirmDialog>
  );
}

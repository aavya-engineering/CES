// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// NotificationsBell.tsx — S1.4 (wireframe bell, decision D-11 in doc 28).
// The PRD defines no notification source, so the bell shows the one thing CES
// can honestly say today: CES-Shared drafts that wait for YOUR approval (a
// platform administrator may not publish their own draft). Other roles see
// "No notifications" until BHD defines more sources (e.g. the review queue).
import { useCallback, useEffect, useRef, useState } from 'react';
import { sharedApi, type Kind } from '@/shared/api/sharedApi';
import type { RouteId, Viewer } from './nav';

const KIND_ROUTE: Record<Kind, RouteId> = {
  requirement_meta: 'shared/requirements',
  archetype: 'shared/evidence',
  mapping: 'shared/mapping',
  rule: 'shared/rules',
};
const KIND_LABEL: Record<Kind, string> = {
  requirement_meta: 'Requirement metadata',
  archetype: 'Evidence archetype',
  mapping: 'Mapping',
  rule: 'Evaluation rule',
};

interface Note {
  kind: Kind;
  key: string;
}

export default function NotificationsBell({ viewer, userId, go }: { viewer: Viewer; userId: string | null; go: (r: RouteId) => void }) {
  const admin = viewer.kind === 'signed-in' && viewer.role === 'platform_admin';
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!admin) return;
    const out: Note[] = [];
    for (const kind of Object.keys(KIND_ROUTE) as Kind[]) {
      const r = await sharedApi.list(kind);
      if (!r.ok) continue;
      for (const v of r.data) if (v.draft && v.draft.created_by !== userId) out.push({ kind, key: v.key });
    }
    setNotes(out);
  }, [admin, userId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (viewer.kind !== 'signed-in') return null;
  return (
    <div className="portal-bell" ref={box}>
      <button
        type="button"
        className="portal-icon-btn"
        aria-label={notes.length ? `Notifications: ${notes.length}` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        data-testid="notifications-bell"
      >
        <span aria-hidden="true">🔔︎</span>
        {notes.length > 0 && (
          <span className="portal-badge" data-testid="notifications-count">
            {notes.length > 99 ? '99+' : notes.length}
          </span>
        )}
      </button>
      {open && (
        <div className="portal-user-menu portal-bell-menu" role="dialog" aria-label="Notifications" data-testid="notifications-panel">
          <div className="portal-bell-head">Notifications</div>
          {notes.length === 0 ? (
            <p className="pg-meta" style={{ padding: '8px 12px' }}>
              No notifications.
            </p>
          ) : (
            <>
              <p className="pg-meta" style={{ padding: '4px 12px' }}>
                Drafts by another administrator, waiting for your approval
              </p>
              {notes.slice(0, 8).map((n) => (
                <button
                  type="button"
                  key={`${n.kind}:${n.key}`}
                  onClick={() => {
                    setOpen(false);
                    go(KIND_ROUTE[n.kind]);
                  }}
                >
                  <strong>{n.key}</strong> · {KIND_LABEL[n.kind]}
                </button>
              ))}
              {notes.length > 8 && <p className="pg-meta" style={{ padding: '4px 12px' }}>and {notes.length - 8} more</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

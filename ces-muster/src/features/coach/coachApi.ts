// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * Coach API client — thin wrapper around POST /coach/chat.
 * Separated from CoachPanel.tsx so non-component exports don't
 * violate the react-refresh/only-export-components ESLint rule.
 */
import { api } from '@/shared/api/musterApi';
import { REQUIREMENTS } from '@/features/portal/referenceData';

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  reply: string;
  degraded?: boolean;
  reason?: string;
}

/** QA 2026-11-13: why the Coach could not answer, so the panel can say so in words. */
export type CoachUnavailableReason = 'offline' | 'not_configured' | 'provider' | 'forbidden' | 'error';

export interface CoachResult {
  reply: string;
  degraded: boolean;
  reason?: CoachUnavailableReason;
}

/**
 * Send a chat message to the coach API.
 * Returns {reply, degraded: false} on success.
 * Returns {reply: '', degraded: true, reason} on any failure or 503.
 */
export async function sendChatMessage(
  sessionId: string,
  messages: CoachMessage[]
): Promise<CoachResult> {
  const result = await api.post<ChatResponse>('/coach/chat', { sessionId, messages });
  if (!result.ok) {
    const reason: CoachUnavailableReason = result.status === 0 ? 'offline' : result.status === 403 ? 'forbidden' : result.status === 503 ? (result.error === 'not_configured' ? 'not_configured' : 'provider') : 'error';
    return { reply: '', degraded: true, reason };
  }
  if (result.data.degraded === true) return { reply: '', degraded: true, reason: result.data.reason === 'not_configured' ? 'not_configured' : 'provider' };
  return { reply: result.data.reply, degraded: false };
}

/** What the panel says when the Coach cannot answer. */
export const UNAVAILABLE_TEXT: Record<CoachUnavailableReason, { title: string; detail: string }> = {
  offline: { title: 'Coach is offline', detail: 'muster-api cannot be reached from this browser. The interview itself keeps working; the Coach comes back when the connection does.' },
  not_configured: { title: 'Coach is not set up on this server', detail: 'The AI service key (ANTHROPIC_API_KEY) is not configured on muster-api, so the Coach cannot answer. Ask the administrator to add it; until then the reference guidance below applies.' },
  provider: { title: 'Coach is temporarily unavailable', detail: 'The AI service did not answer (rate limit or outage). Try again in a minute; the reference guidance below applies meanwhile.' },
  forbidden: { title: 'Coach is not available for your role', detail: 'Only assessment roles may use the Coach.' },
  error: { title: 'Coach could not answer', detail: 'muster-api returned an unexpected error. Try again; if it persists, tell the administrator.' },
};

/** QA 2026-11-13: reference guidance per requirement (was one sentence for every question). */
export function referenceGuidance(requirements: string[]): { id: string; family: string; practice: string }[] {
  const byId = new Map(REQUIREMENTS.map((r) => [r.control_id, r]));
  return [...new Set(requirements)]
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.control_id, family: r.family_name, practice: r.practice }));
}

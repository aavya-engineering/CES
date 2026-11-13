// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * Coach Panel — collapsible right-side chat assistant for the assessment page.
 *
 * Online: sends {sessionId, messages} to POST /coach/chat and renders the reply.
 * Degraded (503 / any failure): says why in words, closes the input, offers
 * "Try again", and shows reference guidance built from the current question's
 * mapped_requirements (the requirement text, not a generic sentence).
 * No retry loop — one attempt per user submission.
 */
import { useMemo, useState } from 'react';
import { referenceGuidance, sendChatMessage, UNAVAILABLE_TEXT, type CoachMessage, type CoachUnavailableReason } from './coachApi';

export interface CoachPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  /** Mapped requirement codes for the currently-active question cluster. */
  currentRequirements: string[];
}

const EXAMPLES = ['What does this requirement expect from a small company?', 'What evidence would an assessor ask for here?', 'We use Microsoft 365 GCC High — what already covers this?'];

export default function CoachPanel({
  isOpen,
  onClose,
  sessionId,
  currentRequirements,
}: CoachPanelProps) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<CoachUnavailableReason | null>(null);
  const [lastAsked, setLastAsked] = useState<string>('');
  const guidance = useMemo(() => referenceGuidance(currentRequirements), [currentRequirements]);

  if (!isOpen) return null;

  const ask = async (text: string) => {
    const userMsg: CoachMessage = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLastAsked(text);
    setLoading(true);
    setUnavailable(null);

    const result = await sendChatMessage(sessionId, next);
    setLoading(false);

    if (result.degraded) {
      setUnavailable(result.reason ?? 'error');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: guidance.length ? `I cannot answer right now. For this question the requirements are: ${guidance.map((g) => `${g.id} — ${g.practice}`).join(' · ')}` : 'I cannot answer right now, and this question is not mapped to a specific requirement.' },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.reply },
      ]);
    }
  };
  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    await ask(text);
  };
  const retry = async () => {
    if (!lastAsked) { setUnavailable(null); return; }
    // Re-send the last question without adding it to the transcript twice.
    setLoading(true);
    setUnavailable(null);
    const result = await sendChatMessage(sessionId, messages.filter((m) => m.role === 'user'));
    setLoading(false);
    if (result.degraded) setUnavailable(result.reason ?? 'error');
    else setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
  };
  const blocked = loading || !!unavailable;

  return (
    <div className="coach-panel" role="complementary" aria-label="Coach assistant">
      <div className="coach-panel-header">
        <span className="coach-panel-title">Coach</span>
        <button
          className="coach-panel-close"
          onClick={onClose}
          aria-label="Close coach panel"
        >
          ✕
        </button>
      </div>

      {unavailable && (
        <div className="callout-warning coach-unavailable" role="status" data-testid="coach-degraded-notice">
          <strong>{UNAVAILABLE_TEXT[unavailable].title}</strong>
          <p>{UNAVAILABLE_TEXT[unavailable].detail}</p>
          {unavailable !== 'forbidden' && (
            <button type="button" className="btn" onClick={() => void retry()} disabled={loading} data-testid="coach-retry">
              {loading ? 'Trying…' : 'Try again'}
            </button>
          )}
        </div>
      )}

      <div className="coach-messages" data-testid="coach-messages">
        {messages.length === 0 && (
          <div className="coach-empty coach-intro" data-testid="coach-intro">
            <p><strong>Ask the Coach about the requirements on this tab.</strong></p>
            <ul>
              <li>It answers in plain language about CMMC Level 2 / NIST 800-171 and what an assessor looks for.</li>
              <li>It sees which requirements this tab maps to{guidance.length ? ` (${guidance.map((g) => g.id).join(', ')})` : ''}, not your answers or evidence.</li>
              <li>It is guidance, not a ruling — the compliance manager and the assessor decide.</li>
            </ul>
            <p className="coach-examples-label">Try one:</p>
            <div className="coach-examples">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="coach-example" onClick={() => void ask(e)} disabled={blocked} data-testid="coach-example">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`coach-message coach-message--${m.role}`}
            data-testid={`coach-msg-${m.role}`}
          >
            {m.content}
          </div>
        ))}
        {loading && <p className="coach-loading">Thinking…</p>}
        {unavailable && guidance.length > 0 && (
          <div className="coach-guidance" data-testid="coach-guidance">
            <strong>Reference guidance for this tab</strong>
            <ul>
              {guidance.map((g) => (
                <li key={g.id}><code>{g.id}</code> <span className="coach-guidance-family">{g.family}</span><br />{g.practice}</li>
              ))}
            </ul>
            <small>From NIST SP 800-171 Rev. 2 — open 110 Requirements in Shared Foundation for objectives and evidence expectations.</small>
          </div>
        )}
      </div>

      <div className="coach-input-row">
        <input
          type="text"
          className="coach-input"
          placeholder={unavailable ? 'Coach unavailable — use Try again' : 'Ask the coach…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          disabled={blocked}
          aria-label="Coach message input"
          aria-describedby={unavailable ? 'coach-degraded-notice' : undefined}
        />
        <button
          className="btn btn-primary"
          onClick={() => void send()}
          disabled={blocked || !input.trim()}
          title={unavailable ? UNAVAILABLE_TEXT[unavailable].title : undefined}
        >
          Send
        </button>
      </div>
    </div>
  );
}

'use client';

import { FormEvent, useState } from 'react';

type Status = 'idle' | 'loading' | 'ok' | 'error';

export function ContinuityWaitlistForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const payload = {
      email: String(fd.get('email') || '').trim(),
      role: String(fd.get('role') || '').trim(),
      interest: String(fd.get('interest') || '').trim(),
      site: String(fd.get('site') || '').trim(),
      note: String(fd.get('note') || '').trim(),
      website: String(fd.get('website') || '').trim(),
    };

    if (!payload.email) {
      setStatus('error');
      setMessage('Add a valid work email to continue.');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/waitlist/continuity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setStatus('error');
        setMessage(
          data.error ||
            'Could not record signup. Email hello@designesy.org with subject “Continuity waitlist”.'
        );
        return;
      }

      setStatus('ok');
      setMessage(
        'You are on the list. We write when founding access opens — only about Continuity.'
      );
      form.reset();
    } catch {
      setStatus('error');
      setMessage(
        'Network error. Try again, or email hello@designesy.org with subject “Continuity waitlist”.'
      );
    }
  }

  return (
    <form className="waitlist-form" onSubmit={onSubmit} noValidate>
      {/* Honeypot */}
      <div className="waitlist-hp" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="email">Work email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@studio.com"
          disabled={status === 'loading'}
        />
      </div>

      <div className="waitlist-row">
        <div className="waitlist-field">
          <label htmlFor="role">You are</label>
          <select id="role" name="role" defaultValue="" disabled={status === 'loading'}>
            <option value="">Select…</option>
            <option value="solo">Solo builder / founder</option>
            <option value="designer">Product / brand designer</option>
            <option value="engineer">Engineer / agent operator</option>
            <option value="studio">Studio (2–10)</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="waitlist-field">
          <label htmlFor="interest">Most useful first</label>
          <select
            id="interest"
            name="interest"
            defaultValue=""
            disabled={status === 'loading'}
          >
            <option value="">Select…</option>
            <option value="score-pass">Score Pass (credits + export)</option>
            <option value="continuity">Continuity (history + drift)</option>
            <option value="both">Both</option>
            <option value="unsure">Not sure yet</option>
          </select>
        </div>
      </div>

      <div className="waitlist-field">
        <label htmlFor="site">
          Site or product URL <span className="waitlist-optional">(optional)</span>
        </label>
        <input
          id="site"
          name="site"
          type="url"
          inputMode="url"
          placeholder="https://"
          disabled={status === 'loading'}
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="note">
          What should stay continuous?{' '}
          <span className="waitlist-optional">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={4}
          placeholder="e.g. marketing site score history, agent design-review gate, private contract for a product surface…"
          disabled={status === 'loading'}
        />
      </div>

      <div className="waitlist-actions">
        <button
          type="submit"
          className="button primary"
          disabled={status === 'loading'}
          data-cuelume-hover="tick"
          data-cuelume-press
        >
          {status === 'loading' ? 'Sending…' : 'Request access'}
        </button>
        <p className="waitlist-trust">
          No charge. No spam cadence. Used only for Continuity access — see{' '}
          <a href="/privacy" data-cuelume-hover="bloom">
            Privacy
          </a>
          .
        </p>
      </div>

      <div
        className={`waitlist-status${status === 'ok' || status === 'error' ? ' is-visible' : ''}${
          status === 'ok' ? ' is-ok' : status === 'error' ? ' is-error' : ''
        }`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </form>
  );
}

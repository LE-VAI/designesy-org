import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const NOTIFY_TO = process.env.WAITLIST_NOTIFY_TO || 'hello@designesy.org';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM =
  process.env.WAITLIST_FROM_EMAIL || 'Designesy Continuity <onboarding@resend.dev>';
const WEBHOOK_URL = process.env.WAITLIST_WEBHOOK_URL || '';

const ALLOWED_ROLES = new Set([
  '',
  'solo',
  'designer',
  'engineer',
  'studio',
  'other',
]);
const ALLOWED_INTEREST = new Set([
  '',
  'score-pass',
  'continuity',
  'both',
  'unsure',
]);

type WaitlistBody = {
  email?: unknown;
  role?: unknown;
  interest?: unknown;
  site?: unknown;
  note?: unknown;
  website?: unknown; // honeypot
};

type Normalized = {
  email: string;
  role: string | null;
  interest: string | null;
  site: string | null;
  note: string | null;
  source: 'continuity-waitlist';
  product: 'Designesy Continuity';
  capturedAt: string;
};

const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  const xf = req.headers.get('x-forwarded-for') || '';
  const ip = xf.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return ip.slice(0, 64);
}

function rateLimit(key: string, limit = 8, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now > row.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

function isEmail(value: string): boolean {
  if (value.length < 5 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  return t.slice(0, max);
}

function normalize(body: WaitlistBody): { ok: true; data: Normalized } | { ok: false; error: string } {
  // Honeypot — bots fill hidden "website"
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { ok: false, error: 'rejected' };
  }

  const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isEmail(emailRaw)) {
    return { ok: false, error: 'A valid work email is required.' };
  }

  const role = cleanText(body.role, 32) || '';
  if (!ALLOWED_ROLES.has(role)) {
    return { ok: false, error: 'Invalid role.' };
  }

  const interest = cleanText(body.interest, 32) || '';
  if (!ALLOWED_INTEREST.has(interest)) {
    return { ok: false, error: 'Invalid interest.' };
  }

  let site = cleanText(body.site, 500);
  if (site && !/^https?:\/\//i.test(site)) {
    site = `https://${site}`;
  }
  if (site) {
    try {
      const u = new URL(site);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: 'Site URL must be http(s).' };
      }
      site = u.toString().slice(0, 500);
    } catch {
      return { ok: false, error: 'Site URL looks invalid.' };
    }
  }

  const note = cleanText(body.note, 2000);

  return {
    ok: true,
    data: {
      email: emailRaw,
      role: role || null,
      interest: interest || null,
      site,
      note,
      source: 'continuity-waitlist',
      product: 'Designesy Continuity',
      capturedAt: new Date().toISOString(),
    },
  };
}

function formatNotifyText(data: Normalized): string {
  return [
    'Designesy Continuity waitlist signup',
    '',
    `Email: ${data.email}`,
    `Role: ${data.role || '—'}`,
    `Interest: ${data.interest || '—'}`,
    `Site: ${data.site || '—'}`,
    `Note: ${data.note || '—'}`,
    `Captured: ${data.capturedAt}`,
    `Source: ${data.source}`,
    `Product: ${data.product}`,
  ].join('\n');
}

async function sendResend(data: Normalized): Promise<{ ok: boolean; detail?: string }> {
  if (!RESEND_API_KEY) return { ok: false, detail: 'resend_unconfigured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [NOTIFY_TO],
      reply_to: data.email,
      subject: `[Continuity waitlist] ${data.email}`,
      text: formatNotifyText(data),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, detail: `resend_${res.status}:${body.slice(0, 200)}` };
  }
  return { ok: true };
}

async function sendFormSubmit(data: Normalized): Promise<{ ok: boolean; detail?: string }> {
  // Zero-config fallback: first delivery may require one activation click in hello@ inbox.
  const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(NOTIFY_TO)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      _subject: `[Continuity waitlist] ${data.email}`,
      _template: 'table',
      _captcha: 'false',
      email: data.email,
      role: data.role || '',
      interest: data.interest || '',
      site: data.site || '',
      note: data.note || '',
      source: data.source,
      product: data.product,
      capturedAt: data.capturedAt,
      message: formatNotifyText(data),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, detail: `formsubmit_${res.status}:${body.slice(0, 200)}` };
  }
  return { ok: true };
}

async function sendWebhook(data: Normalized): Promise<{ ok: boolean; detail?: string }> {
  if (!WEBHOOK_URL) return { ok: false, detail: 'webhook_unconfigured' };
  let parsed: URL;
  try {
    parsed = new URL(WEBHOOK_URL);
  } catch {
    return { ok: false, detail: 'webhook_invalid_url' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, detail: 'webhook_https_only' };
  }

  const res = await fetch(parsed.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    return { ok: false, detail: `webhook_${res.status}` };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req))) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Try again in a bit, or email hello@designesy.org.' },
      { status: 429 }
    );
  }

  let json: WaitlistBody;
  try {
    json = (await req.json()) as WaitlistBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const normalized = normalize(json);
  if (!normalized.ok) {
    if (normalized.error === 'rejected') {
      // Silent success for honeypot
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  }

  const data = normalized.data;
  const transportErrors: string[] = [];

  // Prefer first-party Resend when configured; else FormSubmit; optional webhook fan-out.
  let delivered = false;

  if (RESEND_API_KEY) {
    const r = await sendResend(data);
    if (r.ok) delivered = true;
    else if (r.detail) transportErrors.push(r.detail);
  }

  if (!delivered) {
    const f = await sendFormSubmit(data);
    if (f.ok) delivered = true;
    else if (f.detail) transportErrors.push(f.detail);
  }

  if (WEBHOOK_URL) {
    const w = await sendWebhook(data);
    if (!w.ok && w.detail) transportErrors.push(w.detail);
    // Webhook alone can count if email transports failed but webhook ok
    if (w.ok && !delivered) delivered = true;
  }

  if (!delivered) {
    console.error('[continuity-waitlist] delivery failed', transportErrors);
    return NextResponse.json(
      {
        ok: false,
        error:
          'Could not record signup right now. Email hello@designesy.org with subject “Continuity waitlist”.',
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}

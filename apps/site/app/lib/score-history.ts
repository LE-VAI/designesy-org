// Score history — free-tier local storage layer
//
// Pure utility module. No React, no fetch, no external deps.
// SSR-safe: every access guards `typeof window === 'undefined'`.
//
// Free tier: stores the 5 most recent scores per browser. Same-URL
// re-scores replace the prior entry (keeps the freshest result, not a
// long tail of duplicates). 90-day retention — entries older than that
// are pruned on read.
//
// The Score Pass tier (paid) replaces this with server-side 90-day
// history + export. The free tier seeds that promise: a returning user
// sees their last 5 scores, and the upgrade prompt surfaces "unlock
// 90 days + export" — see the pricing page FAQ.
//
// Contract compliance: zero raw hex, zero magic numbers in motion, all
// durations come from the contract's motion token set when used in CSS.

export type ScoreHistoryEntry = {
  url: string;
  score: number;
  grade: string;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  total: number;
  tokensExtracted: number;
  scoredAt: string; // ISO-8601
  prevScore?: number; // score this entry replaced, if the URL was re-scored
};

const STORAGE_KEY = 'designesy.score.history.v1';
const MAX_ENTRIES = 5;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Read the score history from localStorage. SSR-safe — returns [] on
 * the server. Prunes entries older than 90 days on read so the list
 * stays fresh without a separate cleanup pass.
 */
export function readScoreHistory(): ScoreHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreHistoryEntry[];
    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - RETENTION_MS;
    const fresh = parsed.filter((e) => {
      const ts = Date.parse(e.scoredAt);
      return Number.isFinite(ts) && ts >= cutoff;
    });

    // If pruning removed entries, persist the trimmed list so the next
    // read is O(1) and the storage doesn't bloat.
    if (fresh.length !== parsed.length) {
      writeScoreHistory(fresh);
    }
    return fresh;
  } catch {
    return [];
  }
}

/**
 * Save a score to history. Replaces any existing entry for the same URL
 * (most-recent wins), caps the list at MAX_ENTRIES, and trims the oldest
 * beyond that. SSR-safe — no-op on the server.
 */
export function saveScore(url: string, result: {
  score?: number;
  grade?: string;
  pass?: number;
  fail?: number;
  warn?: number;
  skip?: number;
  total?: number;
  tokensExtracted?: number;
}): ScoreHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  if (!url || typeof result.score !== 'number' || typeof result.grade !== 'string') {
    return readScoreHistory();
  }

  const entry: ScoreHistoryEntry = {
    url,
    // Round to 1dp at write time so floating-point artifacts from the weighted
    // score pipeline (e.g. 58.099999999999994) never reach storage or the UI.
    score: Math.round(result.score * 10) / 10,
    grade: result.grade,
    pass: result.pass ?? 0,
    fail: result.fail ?? 0,
    warn: result.warn ?? 0,
    skip: result.skip ?? 0,
    total: result.total ?? 0,
    tokensExtracted: result.tokensExtracted ?? 0,
    scoredAt: new Date().toISOString(),
  };

  const current = readScoreHistory();
  // Capture the score being replaced so the UI can show a delta
  // ("67.4 → 71.2, +3.8 since last run"). Most-recent wins.
  const prior = current.find((e) => e.url === url);
  if (prior && typeof prior.score === 'number' && prior.score !== entry.score) {
    entry.prevScore = prior.score;
  }
  // Drop any prior entry for the same URL so we keep the freshest score
  // per site, not a long tail of duplicates.
  const withoutDupes = current.filter((e) => e.url !== url);
  const next = [entry, ...withoutDupes].slice(0, MAX_ENTRIES);
  writeScoreHistory(next);
  return next;
}

/**
 * Clear all score history. SSR-safe — no-op on the server.
 */
export function clearScoreHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private mode, quota). Silent no-op.
  }
}

/**
 * Format a relative-time label for a history entry ("just now",
 * "3m ago", "2d ago", "5w ago"). Pure — no DOM, no Date locale drift.
 * Returns an empty string for malformed timestamps.
 */
export function relativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 8) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

/**
 * Truncate a URL for compact display. Strips protocol, truncates to
 * maxLen chars, adds an ellipsis if truncated. Pure.
 */
export function truncateUrl(url: string, maxLen = 48): string {
  let clean = url.replace(/^https?:\/\//i, '');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

// Internal — write to localStorage. Never throws; storage may be
// unavailable (private mode, quota exceeded, disabled).
function writeScoreHistory(entries: ScoreHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage disabled — silent no-op. The free tier
    // history is best-effort; if it can't persist, the app still works.
  }
}
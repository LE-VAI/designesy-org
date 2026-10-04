'use client';

// The site's control surface: the URL bar on the homepage and the engine
// pages, the segmented choices under it, and the status line that says what a
// run will read. One anatomy (command-bar.css): a glass slab, each field set
// into it as a well, the run button raised out of it as a key, and a foot
// whose rows start on the wells' content edge.
//
// The status line is the helper. At rest it carries the page's note. While a
// field holds a value it shows what the engine will read (the https:// it
// adds, the origin readiness probes), or, in the same quiet voice, what the
// value still lacks. A submit the engine would refuse stays on the page: the
// line turns to a warning, the field keeps focus, and a live region says why.
//
// The segmented control is an APG radio group: one tab stop, arrow keys move
// and select, Home/End jump. Each option carries its own description, read
// with the option and shown under the control for the one selected.

import '../../instrument.css';
import './command-bar.css';
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/** A field's reading. ok: what the engine will read (verb and target);
    otherwise the plain sentence saying what the value still lacks. */
export type FieldCheck = { ok: boolean; text: ReactNode; plain: string; verb?: string; target?: string };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Hosts the URL guard refuses: loopback, private and link-local ranges,
    local names, and every IPv6 literal. */
function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.startsWith('[')) return true;
  if (!IPV4.test(host)) return false;
  const [a, b] = host.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** What the engine will read for a typed value, or what the value still lacks. */
export function checkUrl(raw: string, reads: 'page' | 'origin' = 'page'): FieldCheck | null {
  const v = raw.trim();
  if (!v) return null;
  const miss = (plain: string): FieldCheck => ({ ok: false, text: plain, plain });
  if (/\s/.test(v)) return miss('A web address has no spaces. Paste one URL.');
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return miss('That is not a web address yet.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return miss('Only http and https addresses can be read.');
  const host = u.hostname.toLowerCase();
  if (isPrivateHost(host)) return miss('The engine reads public sites. Local and private addresses are out of its reach.');
  if (!host.includes('.')) return miss(`Add the domain ending, like ${host}.com.`);
  const target = reads === 'origin' ? u.origin : u.href;
  const verb = reads === 'origin' ? 'Probes' : 'Reads';
  return { ok: true, text: <>{verb} <b>{target}</b></>, plain: `${verb} ${target}`, verb, target };
}

export function checkEmail(raw: string): FieldCheck | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { ok: true, text: <>Drift alerts go to <b>{v}</b></>, plain: `Drift alerts go to ${v}` };
  const plain = 'Add a full address, like you@studio.com.';
  return { ok: false, text: plain, plain };
}

type Field = {
  value: string;
  onChange: (v: string) => void;
  /** The field's accessible name. */
  label: string;
  placeholder: string;
  type?: 'url' | 'email';
  optional?: boolean;
  /** A letter shown in the well instead of the globe (the compare pair: A, B). */
  mark?: string;
  /** readiness probes the origin, every other engine reads the page. */
  reads?: 'page' | 'origin';
};

function check(f: Field): FieldCheck | null {
  return f.type === 'email' ? checkEmail(f.value) : checkUrl(f.value, f.reads);
}

function FieldMark({ field }: { field: Field }) {
  if (field.mark) {
    return (
      <span className="eg-bar-mark" aria-hidden="true">
        {field.mark}
      </span>
    );
  }
  if (field.type === 'email') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" />
    </svg>
  );
}

export function EngineBar({
  fields,
  onSubmit,
  busy,
  go,
  goBusy,
  note,
  choices,
}: {
  fields: Field[];
  onSubmit: () => void;
  busy: boolean;
  go: string;
  goBusy: string;
  /** The status line at rest: one sentence on what a run does. */
  note?: ReactNode;
  /** Segmented choices, drawn above the status line. */
  choices?: ReactNode;
}) {
  const id = useId();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // The field whose status the line shows: the one last focused or edited.
  const [active, setActive] = useState(0);
  // A refused submit: which field, and why. Cleared by the next edit.
  const [refused, setRefused] = useState<{ i: number; plain: string } | null>(null);
  const [said, setSaid] = useState('');

  const refuse = (i: number, plain: string) => {
    setActive(i);
    setRefused({ i, plain });
    setSaid(plain);
    inputs.current[i]?.focus();
  };

  // The button stays live at rest: an empty submit puts the caret where the
  // URL goes and says so, instead of greying out the page's one action.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!f.value.trim()) {
        if (f.optional) continue;
        refuse(i, f.type === 'email' ? 'Add an email address first.' : 'Add a URL first, like stripe.com.');
        return;
      }
      const c = check(f);
      if (c && !c.ok) {
        refuse(i, c.plain);
        return;
      }
    }
    setRefused(null);
    setSaid('');
    onSubmit();
  };

  const shown = fields[active] ?? fields[0];
  const live = check(shown);
  const isRefused = refused !== null && refused.i === active;
  const status: { tone: 'note' | 'read' | 'hint' | 'warn'; text: ReactNode } = isRefused
    ? { tone: 'warn', text: refused.plain }
    : live
      ? {
          tone: live.ok ? 'read' : 'hint',
          // On the compare pair the line names its side: "B reads https://…".
          text:
            live.ok && shown.mark && live.verb && live.target ? (
              <>
                {shown.mark} {live.verb.toLowerCase()} <b>{live.target}</b>
              </>
            ) : (
              live.text
            ),
        }
      : { tone: 'note', text: note };

  const pair = fields.length > 1;

  return (
    <form className={`eg-bar${pair ? ' is-pair' : ''}`} onSubmit={submit} noValidate aria-busy={busy}>
      <div className="eg-bar-line">
        {fields.map((f, i) => (
          <label className="eg-bar-field" key={f.label} data-invalid={refused?.i === i || undefined}>
            <FieldMark field={f} />
            <span className="sr-only">{f.label}</span>
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              className="eg-bar-input"
              type={f.type === 'email' ? 'email' : 'text'}
              inputMode={f.type === 'email' ? 'email' : 'url'}
              enterKeyHint="go"
              autoComplete={f.type === 'email' ? 'email' : 'url'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={f.value}
              onFocus={() => setActive(i)}
              onChange={(e) => {
                setActive(i);
                if (refused?.i === i) setRefused(null);
                f.onChange(e.target.value);
              }}
              placeholder={f.placeholder}
              readOnly={busy}
              aria-invalid={refused?.i === i || undefined}
              aria-describedby={`${id}-status`}
            />
          </label>
        ))}
        <button type="submit" className="eg-bar-go" aria-busy={busy} data-cuelume-press="sparkle">
          {/* Both labels hold the key's width, so it never resizes mid-run. */}
          <span className="eg-go-l" aria-hidden={busy || undefined}>
            {go}
            <svg className="eg-go-glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
            </svg>
          </span>
          <span className="eg-go-l is-busy" aria-hidden={!busy || undefined}>
            <i className="eg-go-spin" aria-hidden="true" />
            {goBusy}
          </span>
        </button>
      </div>
      <div className="eg-bar-foot">
        {choices}
        {/* The note keeps its place while a live line stands over it, so the
            first keystroke never changes the bar's height. The status is a
            bar, not a paragraph: it spans the foot (it carries the slab's
            divider under the choices) and holds the lines, which carry the
            text and its 66ch measure (command-bar.css). */}
        <div className="eg-bar-status" id={`${id}-status`} data-tone={status.tone}>
          <span className="eg-bar-note" data-off={status.tone !== 'note' || undefined}>
            {note}
          </span>
          {status.tone !== 'note' && (
            <span className="eg-bar-live">
              {status.tone === 'warn' && (
                <svg className="eg-bar-warn" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 2.2 14.4 13.4H1.6Z" />
                  <path d="M8 6.6v3.2M8 11.6v.1" />
                </svg>
              )}
              <span>{status.text}</span>
            </span>
          )}
        </div>
        <span className="sr-only" role="status">
          {said}
        </span>
      </div>
    </form>
  );
}

/** A secondary field for the foot of a bar (the leaderboard's optional name
    and category): a smaller well whose visible tag is its label. */
export function Well({
  tag,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  tag: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  readOnly?: boolean;
}) {
  return (
    <label className="eg-bar-field is-sub">
      <span className="eg-bar-tag">{tag}</span>
      <input
        className="eg-bar-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: string; hint?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (to: number) => {
    const n = (to + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(at + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(options.length - 1); }
  };
  const hint = options[at]?.hint;
  return (
    <div className="eg-seg">
      <span className="eg-seg-label" id={`${id}-l`}>
        {label}
      </span>
      <span
        className="eg-seg-track"
        role="radiogroup"
        aria-labelledby={`${id}-l`}
        onKeyDown={key}
        style={{ '--seg-n': options.length, '--seg-i': at } as CSSProperties}
      >
        <i className="eg-seg-thumb" aria-hidden="true" />
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-describedby={o.hint ? `${id}-d${i}` : undefined}
            tabIndex={o.value === value ? 0 : -1}
            className="eg-seg-opt"
            onClick={() => onChange(o.value)}
            disabled={disabled}
            data-cuelume-hover="tick"
          >
            {o.label}
          </button>
        ))}
      </span>
      {options.map((o, i) =>
        o.hint ? (
          <span key={o.value} id={`${id}-d${i}`} hidden>
            {o.hint}
          </span>
        ) : null,
      )}
      {hint && (
        <p className="eg-seg-hint" aria-hidden="true">
          {hint}
        </p>
      )}
    </div>
  );
}

'use client';

// The engine pages' input: one glass line holding the URL field(s) and the run
// button, with an optional segmented control beneath (scope, cadence). The
// segmented control is an APG radio group: one tab stop, arrow keys move and
// select, Home/End jump, and the selection is one tile that slides.

import { useId, useRef, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

type Field = {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  type?: 'url' | 'email';
  optional?: boolean;
};

export function EngineBar({
  fields,
  onSubmit,
  busy,
  go,
  goBusy,
  foot,
}: {
  fields: Field[];
  onSubmit: () => void;
  busy: boolean;
  go: string;
  goBusy: string;
  foot?: ReactNode;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // The button stays live at rest: an empty submit puts the caret where the
  // URL goes instead of greying out the page's one action.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const empty = fields.findIndex((f) => !f.optional && !f.value.trim());
    if (empty >= 0) {
      inputs.current[empty]?.focus();
      return;
    }
    onSubmit();
  };
  return (
    <form className="eg-bar" onSubmit={submit} noValidate>
      <div className={`eg-bar-line${fields.length > 1 ? ' is-pair' : ''}`}>
        {fields.map((f, i) => (
          <label className="eg-bar-field" key={f.label}>
            {i === 0 && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" />
              </svg>
            )}
            <span className="sr-only">{f.label}</span>
            <input
              ref={(el) => { inputs.current[i] = el; }}
              className="eg-bar-input"
              type={f.type === 'email' ? 'email' : 'text'}
              inputMode={f.type === 'email' ? 'email' : 'url'}
              autoComplete={f.type === 'email' ? 'email' : 'off'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              disabled={busy}
            />
          </label>
        ))}
        <button type="submit" className="eg-bar-go" aria-busy={busy} data-cuelume-press="sparkle">
          {busy ? goBusy : go}
        </button>
      </div>
      {foot && <div className="eg-bar-foot">{foot}</div>}
    </form>
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
  options: { value: T; label: string; hint?: string }[];
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
  return (
    <span className="eg-seg">
      <span className="eg-seg-label" id={id}>{label}</span>
      <span
        className="eg-seg-track"
        role="radiogroup"
        aria-labelledby={id}
        onKeyDown={key}
        style={{ '--seg-n': options.length, '--seg-i': at } as CSSProperties}
      >
        <i className="eg-seg-thumb" aria-hidden="true" />
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            className="eg-seg-opt"
            title={o.hint}
            onClick={() => onChange(o.value)}
            disabled={disabled}
            data-cuelume-hover="tick"
          >
            {o.label}
          </button>
        ))}
      </span>
    </span>
  );
}

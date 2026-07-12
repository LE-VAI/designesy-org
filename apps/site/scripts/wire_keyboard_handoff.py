from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new.strip()[:40] in text and old not in text:
        print(f"{label}: already applied")
        return
    if old not in text:
        raise SystemExit(f"{label}: needle missing in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"{label}: updated")


# review/page.tsx
replace_once(
    APP / "review" / "page.tsx",
    """              <span className="lab-card-arrow">Open review →</span>
            </Link>
          </div>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            Field checks publish when an artifact is live enough to judge.""",
    """              <span className="lab-card-arrow">Open review →</span>
            </Link>
            <Link
              href="/review/keyboard"
              className="lab-card"
              data-cuelume-hover="tick"
              data-cuelume-press
              data-cuelume-release
            >
              <div className="lab-card-top">
                <span className="status-badge">Verification</span>
                <span className="lab-card-status">Holds</span>
              </div>
              <h3 className="lab-card-title">Keyboard path</h3>
              <p className="lab-card-lede">
                Site-wide skip link, tab order, and focus-visible proof.
              </p>
              <p className="lab-card-desc">
                Shared chrome packet for every public route — complements the
                Lab One keyboard path.
              </p>
              <span className="lab-card-arrow">Open keyboard path →</span>
            </Link>
          </div>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            Field checks publish when an artifact is live enough to judge.""",
    "review page",
)

# open/page.tsx
replace_once(
    APP / "open" / "page.tsx",
    """            <Link
              className="row"
              role="listitem"
              href="/docs"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Docs</span>
                <span className="row-meta">
                  Mission, principles, architecture
                </span>
              </span>
            </Link>
          </div>
        </section>""",
    """            <Link
              className="row"
              role="listitem"
              href="/open/handoff"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Open handoff pack</span>
                <span className="row-meta">
                  Share copy, agent prompt, verification paths
                </span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/review/keyboard"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Keyboard path · site-wide</span>
                <span className="row-meta">
                  Skip link, main landmark, shared chrome
                </span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/docs"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">Docs</span>
                <span className="row-meta">
                  Mission, principles, architecture
                </span>
              </span>
            </Link>
          </div>
        </section>""",
    "open page",
)

# docs/page.tsx
replace_once(
    APP / "docs" / "page.tsx",
    """  {
    href: '/privacy',
    title: 'Privacy',
    meta: 'What this surface collects, what it does not, open export scope',
  },
  {
    href: '/contracts#design-system-contract',
    title: 'Full contract tables',
    meta: 'Complete human contract on /contracts',
  },
];""",
    """  {
    href: '/privacy',
    title: 'Privacy',
    meta: 'What this surface collects, what it does not, open export scope',
  },
  {
    href: '/open/handoff',
    title: 'Open handoff pack',
    meta: 'Share copy, agent prompt, verification paths for /open',
  },
  {
    href: '/review/keyboard',
    title: 'Keyboard path',
    meta: 'Site-wide skip link, tab order, focus-visible proof',
  },
  {
    href: '/contracts#design-system-contract',
    title: 'Full contract tables',
    meta: 'Complete human contract on /contracts',
  },
];""",
    "docs page",
)

# poise keyboard
poise = APP / "review" / "poise" / "keyboard" / "page.tsx"
replace_once(
    poise,
    """  {
    title: 'Site-wide keyboard packet for every route',
    meta: 'Only Poise is covered by this artifact today',
    status: 'Open',
  },
];""",
    """  {
    title: 'Site-wide keyboard packet for every route',
    meta: 'Published at /review/keyboard · skip link + main landmark + shared chrome',
    status: 'Hold',
  },
];""",
    "poise results",
)

replace_once(
    poise,
    """              without removing controls. Open item: this packet covers Poise,
              not every public route.""",
    """              without removing controls. Site-wide chrome is covered by
              /review/keyboard; this packet remains Lab One specific.""",
    "poise verdict",
)

replace_once(
    poise,
    """  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Kit One review packet this proof supports',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.1.1',
    meta: 'focus-visible, reduced-motion, and adopted Poise interaction rules',
  },""",
    """  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Kit One review packet this proof supports',
  },
  {
    href: '/review/keyboard',
    title: 'Keyboard path · site-wide',
    meta: 'Skip link, main landmark, shared chrome packet',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.1.1',
    meta: 'focus-visible, reduced-motion, and adopted Poise interaction rules',
  },""",
    "poise related",
)

print("all wiring complete")

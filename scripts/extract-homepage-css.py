#!/usr/bin/env python3
"""
Extract homepage-only CSS rules from globals.css into a CSS Module.

Strategy:
1. Parse globals.css into top-level blocks (rules, @media, @supports, comments).
2. For each block, extract all class selectors (.foo).
3. Mark a block for extraction ONLY if ALL its class selectors are homepage-only.
   Mixed blocks (homepage + shared classes) stay in globals.css — too risky to split.
4. Deduplicate: if the same selector appears multiple times (pre-existing duplication),
   keep the LAST occurrence (it wins by cascade) and remove all others.
5. Write extracted rules to page.module.css wrapped in :global() so class names
   are NOT hashed — the JSX keeps using className="hero" etc. unchanged.
6. Remove extracted blocks from globals.css.

Conservative: only extracts blocks where EVERY class selector is homepage-only.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "apps" / "site" / "app"
GLOBALS = ROOT / "globals.css"
# Use a plain .css (not .module.css) imported in page.tsx — Next.js App Router
# code-splits it to the / route only, and class names stay un-hashed so the
# JSX (className="hero" etc.) needs no changes.
MODULE = ROOT / "home.css"

# Homepage-only classes: used on the homepage, NOT on any other route.
# Verified by cross-referencing className usage across all 66 routes.
HOMEPAGE_ONLY = {
    "fade-in", "fade-up-delay-5",
    "field-card-arrow", "field-card-desc", "field-card-lede", "field-card-title", "field-card-top",
    "hc-arc-ghost", "hc-arc-layer", "hc-arc-lit", "hc-arc-tick",
    "health-panel", "health-rack-grid", "health-rack-label", "health-rack-module",
    "health-rack-numeral", "health-rack-svg", "health-rack-tip", "health-rack-track",
    "health-rack-unit", "health-rack-value",
    "hero", "hero-architectural", "hero-construction", "hero-construction-svg",
    "hero-content", "hero-display", "hero-display-line", "hero-eyebrow",
    "hero-hint", "hero-proof", "hero-proof-caveat", "hero-proof-dot",
    "hero-proof-grade", "hero-proof-num", "hero-proof-recent",
    "hero-proof-recent-dots", "hero-proof-recent-item", "hero-proof-recent-label",
    "hero-proof-recent-link", "hero-proof-recent-list", "hero-proof-recent-name",
    "hero-proof-recent-score", "hero-proof-recent-self", "hero-proof-stat",
    "hero-proof-stats", "hero-sub", "hero-title", "hero-word-free",
    "is-accent", "is-live",
    "mark-glyph-core", "mark-glyph-ring",
    "pillar", "pillar-grid", "pillar-number",
    "principle-cell", "principle-layout",
    "score-hero-input",
    "section-eyebrow", "section-heading-badge", "section-heading-badge-label",
    "section-heading-badge-numeral", "section-heading-badge-unit",
    "section-heading-badge-value", "section-heading-row", "section-more",
    "section-title", "state-layout",
    "surface-card-arrow", "surface-card-desc", "surface-card-label",
    "surface-card-meta", "surface-list",
}

# Classes that JS references by string (querySelector/closest/classList).
# These MUST stay in globals.css — CSS Modules would hash them and break JS.
# Verified: none of the HOMEPAGE_ONLY classes appear in JS string refs.
# But we double-check here: these are the JS-touched classes to NEVER extract.
JS_TOUCHED = {
    "seam-dot", "seam-orbit", "seam-square", "seam-triangle", "seam-block",
    "seam-dot-pulse", "definition", "definition-label", "definition-copy-badge",
    "is-copyable", "is-copied", "is-shaking", "mag-cursor-ring", "mag-cursor-dot",
    "is-hovering", "tab", "js-ready",
}


def extract_class_names(selector_text):
    """Extract .class-name tokens from a selector string."""
    # Match .class-name (not inside :pseudo or ::pseudo-element)
    return set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]+)", selector_text))


def parse_css_blocks(css_text):
    """
    Parse CSS into a list of blocks. Each block is:
    {
        "type": "rule" | "at-rule" | "comment",
        "text": full text including braces,
        "start": start offset,
        "end": end offset,
        "selectors": set of class names (for rules),
        "inner_blocks": [...] (for @media/@supports),
    }
    """
    blocks = []
    i = 0
    n = len(css_text)

    while i < n:
        # Skip whitespace
        if css_text[i] in " \t\n\r":
            i += 1
            continue

        # Comment
        if css_text[i:i+2] == "/*":
            end = css_text.find("*/", i + 2)
            if end == -1:
                end = n
            else:
                end += 2
            blocks.append({
                "type": "comment",
                "text": css_text[i:end],
                "start": i,
                "end": end,
                "selectors": set(),
                "inner_blocks": [],
            })
            i = end
            continue

        # At-rule (@media, @supports, @keyframes, etc.)
        if css_text[i] == "@":
            # Find the rule name
            at_match = re.match(r"@([a-zA-Z-]+)", css_text[i:])
            if not at_match:
                i += 1
                continue
            at_name = at_match.group(1)

            # Find the opening brace
            brace_pos = css_text.find("{", i)
            if brace_pos == -1:
                # At-rule without body (e.g. @import)
                line_end = css_text.find("\n", i)
                if line_end == -1:
                    line_end = n
                blocks.append({
                    "type": "at-rule-no-body",
                    "text": css_text[i:line_end+1],
                    "start": i,
                    "end": line_end+1,
                    "selectors": set(),
                    "inner_blocks": [],
                })
                i = line_end + 1
                continue

            # Find matching closing brace
            depth = 1
            j = brace_pos + 1
            while j < n and depth > 0:
                if css_text[j] == "{":
                    depth += 1
                elif css_text[j] == "}":
                    depth -= 1
                j += 1

            prelude = css_text[i:brace_pos+1]
            body = css_text[brace_pos+1:j-1]
            full_text = css_text[i:j]

            # Parse inner blocks for @media/@supports
            inner_blocks = []
            if at_name in ("media", "supports"):
                inner_blocks = parse_css_blocks(body)

            # Collect all selectors from inner blocks
            all_selectors = set()
            for ib in inner_blocks:
                all_selectors |= ib["selectors"]

            blocks.append({
                "type": "at-rule",
                "at_name": at_name,
                "prelude": prelude,
                "body": body,
                "text": full_text,
                "start": i,
                "end": j,
                "selectors": all_selectors,
                "inner_blocks": inner_blocks,
            })
            i = j
            continue

        # Regular rule
        brace_pos = css_text.find("{", i)
        if brace_pos == -1:
            # No more rules
            break

        # Find matching closing brace
        depth = 1
        j = brace_pos + 1
        while j < n and depth > 0:
            if css_text[j] == "{":
                depth += 1
            elif css_text[j] == "}":
                depth -= 1
            j += 1

        selector_text = css_text[i:brace_pos]
        body_text = css_text[brace_pos:j]
        full_text = css_text[i:j]

        classes = extract_class_names(selector_text)

        blocks.append({
            "type": "rule",
            "text": full_text,
            "start": i,
            "end": j,
            "selectors": classes,
            "inner_blocks": [],
        })
        i = j

    return blocks


def is_homepage_only(block):
    """Check if a block's selectors are ALL homepage-only (and has at least one)."""
    if not block["selectors"]:
        return False
    # Check for JS-touched classes — never extract these
    if block["selectors"] & JS_TOUCHED:
        return False
    # All selectors must be homepage-only
    return all(cls in HOMEPAGE_ONLY for cls in block["selectors"])


def extract_from_at_rule(block):
    """
    For @media/@supports blocks: check if ALL inner rules are homepage-only.
    If so, the entire block can be extracted.
    If only SOME inner rules are homepage-only, we'd need to split — too risky, skip.
    """
    if not block["inner_blocks"]:
        return False
    for ib in block["inner_blocks"]:
        if ib["type"] == "comment":
            continue
        if not is_homepage_only(ib):
            return False
    return True


def main():
    dry_run = "--dry-run" in sys.argv
    css_text = GLOBALS.read_text(encoding="utf-8")
    print(f"Original globals.css: {len(css_text)} bytes, {css_text.count(chr(10))} lines")

    blocks = parse_css_blocks(css_text)
    print(f"Parsed {len(blocks)} top-level blocks")

    # Identify blocks to extract
    extract_indices = set()
    extracted_selectors_summary = []
    for idx, block in enumerate(blocks):
        if block["type"] == "comment":
            continue
        if block["type"] == "rule" and is_homepage_only(block):
            extract_indices.add(idx)
            extracted_selectors_summary.append(("rule", block["selectors"]))
        elif block["type"] == "at-rule" and extract_from_at_rule(block):
            extract_indices.add(idx)
            extracted_selectors_summary.append((f"@{block.get('at_name','?')}", block["selectors"]))

    print(f"Marked {len(extract_indices)} blocks for extraction")
    print("\nExtracted selectors:")
    for btype, sels in extracted_selectors_summary:
        print(f"  [{btype}] {', '.join(sorted(sels))}")

    # Collect extracted text (these go into the module)
    extracted_texts = []
    for idx in sorted(extract_indices):
        extracted_texts.append(blocks[idx]["text"])

    # Build the module CSS — plain .css, no :global() wrapper needed
    module_content = "/* Homepage-only styles — extracted from globals.css.\n"
    module_content += "   Plain .css imported in page.tsx — Next.js App Router code-splits\n"
    module_content += "   this to the / route only. Class names are un-hashed.\n"
    module_content += "   The JSX keeps using className=\"hero\" etc. unchanged. */\n\n"
    for text in extracted_texts:
        module_content += text + "\n\n"

    # Build new globals.css — remove extracted blocks
    # We build by scanning original text and skipping extracted ranges
    extract_ranges = sorted(
        [(blocks[idx]["start"], blocks[idx]["end"]) for idx in extract_indices],
        key=lambda r: r[0],
    )

    new_css_parts = []
    last_end = 0
    for start, end in extract_ranges:
        new_css_parts.append(css_text[last_end:start])
        last_end = end
    new_css_parts.append(css_text[last_end:])
    new_css = "".join(new_css_parts)

    # Clean up excessive blank lines (3+ → 2)
    new_css = re.sub(r"\n{4,}", "\n\n\n", new_css)

    print(f"New globals.css: {len(new_css)} bytes, {new_css.count(chr(10))} lines")
    print(f"Reduction: {len(css_text) - len(new_css)} bytes ({(len(css_text) - len(new_css)) / len(css_text) * 100:.1f}%)")
    print(f"Module: {len(module_content)} bytes, {module_content.count(chr(10))} lines")

    if dry_run:
        print("\n[DRY RUN — no files written]")
        return

    # Write files
    MODULE.write_text(module_content, encoding="utf-8")
    GLOBALS.write_text(new_css, encoding="utf-8")
    print(f"\nWrote {MODULE}")
    print(f"Wrote {GLOBALS}")


if __name__ == "__main__":
    main()
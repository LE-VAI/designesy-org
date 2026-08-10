#!/usr/bin/env python3
"""
Extract route-specific CSS rules from globals.css into a route-local .css file.

Generic version of extract-homepage-css.py — works for any route.
Usage: python3 extract-route-css.py <route-dir> <output-css-name> [--dry-run]

Example: python3 extract-route-css.py leaderboard leaderboard.css

Strategy: same conservative approach — only extract blocks where ALL selectors
are unique to the route (not used on any other route).
"""

import re
import sys
import os
import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "apps" / "site" / "app"
GLOBALS = ROOT / "globals.css"


def get_route_classes(route_dir):
    """Find classes used ONLY in this route, not in any other route."""
    route_path = ROOT / route_dir

    # Collect classes from this route's tsx files
    mine = set()
    for f in glob.glob(str(route_path / "**" / "*.tsx"), recursive=True):
        text = open(f, encoding="utf-8").read()
        for m in re.findall(r'className="([^"]+)"', text):
            mine |= set(m.split())

    # Collect classes from ALL other tsx files
    others = set()
    for f in glob.glob(str(ROOT / "**" / "*.tsx"), recursive=True):
        # Skip if this file is in our route dir
        if os.path.normpath(f).startswith(os.path.normpath(str(route_path))):
            continue
        text = open(f, encoding="utf-8").read()
        for m in re.findall(r'className="([^"]+)"', text):
            others |= set(m.split())

    unique = mine - others
    return unique


def extract_class_names(selector_text):
    return set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]+)", selector_text))


def parse_css_blocks(css_text):
    blocks = []
    i = 0
    n = len(css_text)
    while i < n:
        if css_text[i] in " \t\n\r":
            i += 1
            continue
        if css_text[i:i+2] == "/*":
            end = css_text.find("*/", i + 2)
            if end == -1:
                end = n
            else:
                end += 2
            blocks.append({"type": "comment", "text": css_text[i:end], "selectors": set(), "inner_blocks": [], "start": i, "end": end})
            i = end
            continue
        if css_text[i] == "@":
            at_match = re.match(r"@([a-zA-Z-]+)", css_text[i:])
            if not at_match:
                i += 1
                continue
            at_name = at_match.group(1)
            brace_pos = css_text.find("{", i)
            if brace_pos == -1:
                line_end = css_text.find("\n", i)
                if line_end == -1:
                    line_end = n
                blocks.append({"type": "at-rule-no-body", "text": css_text[i:line_end+1], "selectors": set(), "inner_blocks": [], "start": i, "end": line_end+1})
                i = line_end + 1
                continue
            depth = 1
            j = brace_pos + 1
            while j < n and depth > 0:
                if css_text[j] == "{":
                    depth += 1
                elif css_text[j] == "}":
                    depth -= 1
                j += 1
            body = css_text[brace_pos+1:j-1]
            inner_blocks = []
            if at_name in ("media", "supports"):
                inner_blocks = parse_css_blocks(body)
            all_selectors = set()
            for ib in inner_blocks:
                all_selectors |= ib["selectors"]
            blocks.append({"type": "at-rule", "at_name": at_name, "text": css_text[i:j], "selectors": all_selectors, "inner_blocks": inner_blocks, "start": i, "end": j})
            i = j
            continue
        brace_pos = css_text.find("{", i)
        if brace_pos == -1:
            break
        depth = 1
        j = brace_pos + 1
        while j < n and depth > 0:
            if css_text[j] == "{":
                depth += 1
            elif css_text[j] == "}":
                depth -= 1
            j += 1
        selector_text = css_text[i:brace_pos]
        classes = extract_class_names(selector_text)
        blocks.append({"type": "rule", "text": css_text[i:j], "selectors": classes, "inner_blocks": [], "start": i, "end": j})
        i = j
    return blocks


def is_route_only(block, route_unique):
    if not block["selectors"]:
        return False
    return all(cls in route_unique for cls in block["selectors"])


def extract_from_at_rule(block, route_unique):
    """Extract an @media block only if ALL inner rules are route-unique."""
    if not block["inner_blocks"]:
        return False
    for ib in block["inner_blocks"]:
        if ib["type"] == "comment":
            continue
        if not is_route_only(ib, route_unique):
            return False
    return True


def split_at_rule(block, route_unique):
    """
    For @media blocks with MIXED selectors (some route-unique, some shared):
    extract only the route-unique inner rules, leaving shared rules in globals.css.

    Returns (route_rules_text, remaining_rules_text) or None if nothing to extract.
    This prevents the cascade-order bug where desktop rules move to route CSS
    but their mobile @media overrides stay in globals.css (which loads first).
    """
    if not block["inner_blocks"]:
        return None

    # Find the @media selector (e.g. "@media (max-width: 720px)")
    at_selector = block["text"].split("{")[0].strip()

    route_rules = []
    remaining_rules = []
    has_route = False
    has_remaining = False

    for ib in block["inner_blocks"]:
        if ib["type"] == "comment":
            # Keep comments with whichever rules follow them
            # Simple heuristic: keep in remaining (globals)
            remaining_rules.append(ib["text"])
            continue
        if is_route_only(ib, route_unique):
            route_rules.append(ib["text"])
            has_route = True
        else:
            remaining_rules.append(ib["text"])
            has_remaining = True

    if not has_route:
        return None

    return (route_rules, at_selector, remaining_rules if has_remaining else None)


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 extract-route-css.py <route-dir> <output-css-name> [--dry-run]")
        print("Example: python3 extract-route-css.py leaderboard leaderboard.css")
        sys.exit(1)

    route_dir = sys.argv[1]
    output_name = sys.argv[2]
    dry_run = "--dry-run" in sys.argv

    route_unique = get_route_classes(route_dir)
    print(f"Route: {route_dir} ({len(route_unique)} unique classes)")
    print(f"Unique: {sorted(route_unique)}")

    if not route_unique:
        print("No unique classes — nothing to extract.")
        return

    css_text = GLOBALS.read_text(encoding="utf-8")
    print(f"globals.css: {len(css_text)} bytes")

    blocks = parse_css_blocks(css_text)
    extract_indices = set()
    split_blocks = []  # (block_index, route_rules, at_selector, remaining_rules)
    for idx, block in enumerate(blocks):
        if block["type"] == "comment":
            continue
        if block["type"] == "rule" and is_route_only(block, route_unique):
            extract_indices.add(idx)
        elif block["type"] == "at-rule":
            if extract_from_at_rule(block, route_unique):
                # All inner rules are route-unique — extract whole block
                extract_indices.add(idx)
            else:
                # Mixed @media block — try to split route-unique rules out
                split_result = split_at_rule(block, route_unique)
                if split_result:
                    route_rules, at_selector, remaining_rules = split_result
                    split_blocks.append((idx, route_rules, at_selector, remaining_rules))

    print(f"Marked {len(extract_indices)} blocks for extraction")
    print(f"Split {len(split_blocks)} mixed @media blocks (route-unique rules extracted, shared rules kept)")

    if not extract_indices and not split_blocks:
        print("No blocks to extract.")
        return

    extracted_texts = [blocks[idx]["text"] for idx in sorted(extract_indices)]

    # Add split @media blocks: wrap route-unique rules in a new @media block
    for idx, route_rules, at_selector, _ in split_blocks:
        media_block = f"{at_selector} {{\n"
        for rule in route_rules:
            media_block += f"  {rule}\n"
        media_block += "}"
        extracted_texts.append(media_block)

    output_path = ROOT / route_dir / output_name
    module_content = f"/* {route_dir} route-only styles — extracted from globals.css.\n"
    module_content += f"   Plain .css imported in {route_dir}/page.tsx — Next.js code-splits\n"
    module_content += f"   this to the /{route_dir} route only. */\n\n"
    for text in extracted_texts:
        module_content += text + "\n\n"

    # Build the new globals.css: remove fully-extracted blocks, and for
    # split @media blocks, replace them with only the shared (remaining) rules
    extract_ranges = sorted(
        [(blocks[idx]["start"], blocks[idx]["end"]) for idx in extract_indices],
        key=lambda r: r[0],
    )

    # For split blocks, we need to replace the block text (not just remove it)
    # Build a map of block index -> replacement text
    split_replacements = {}
    for idx, route_rules, at_selector, remaining_rules in split_blocks:
        if remaining_rules:
            # Rebuild the @media block with only the shared rules
            replacement = f"{at_selector} {{\n"
            for rule in remaining_rules:
                replacement += f"  {rule}\n"
            replacement += "}"
            split_replacements[idx] = replacement
        else:
            # No shared rules left — mark for full removal
            extract_indices.add(idx)

    # Rebuild extract_ranges (may have changed)
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

    # Apply split replacements (insert shared-only @media blocks where full blocks were removed)
    for idx, replacement in split_replacements.items():
        # Insert the replacement text at the position where the block was
        # This is a simplification — for now, append at the end
        pass  # The split block's shared rules are kept by not adding idx to extract_indices

    # Actually, for split blocks with remaining rules, we need a different approach:
    # replace the block text in-place instead of removing it
    if split_replacements:
        # Rebuild: instead of removing split blocks, replace their content
        new_css_parts = []
        last_end = 0
        all_changes = []
        for idx in extract_indices:
            all_changes.append((blocks[idx]["start"], blocks[idx]["end"], None))
        for idx, replacement in split_replacements.items():
            all_changes.append((blocks[idx]["start"], blocks[idx]["end"], replacement))
        all_changes.sort(key=lambda x: x[0])

        for start, end, replacement in all_changes:
            new_css_parts.append(css_text[last_end:start])
            if replacement:
                new_css_parts.append(replacement)
            last_end = end
        new_css_parts.append(css_text[last_end:])
        new_css = "".join(new_css_parts)

    new_css = re.sub(r"\n{4,}", "\n\n\n", new_css)

    print(f"New globals.css: {len(new_css)} bytes (reduction: {len(css_text) - len(new_css)} bytes)")
    print(f"Route CSS: {len(module_content)} bytes")

    if dry_run:
        print("[DRY RUN — no files written]")
        return

    output_path.write_text(module_content, encoding="utf-8")
    GLOBALS.write_text(new_css, encoding="utf-8")
    print(f"Wrote {output_path}")
    print(f"Wrote {GLOBALS}")


if __name__ == "__main__":
    main()
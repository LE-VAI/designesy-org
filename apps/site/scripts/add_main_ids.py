from pathlib import Path

root = Path(__file__).resolve().parents[1] / "app"
for path in root.rglob("page.tsx"):
    text = path.read_text(encoding="utf-8")
    if 'id="main-content"' in text:
        print("skip", path.relative_to(root))
        continue
    updated = text.replace(
        '<main className="surface-page">',
        '<main id="main-content" className="surface-page">',
    ).replace(
        '<main className="site-shell">',
        '<main id="main-content" className="site-shell">',
    )
    if updated == text:
        print("no-main", path.relative_to(root))
        continue
    path.write_text(updated, encoding="utf-8")
    print("updated", path.relative_to(root))

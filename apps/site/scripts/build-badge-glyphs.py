#!/usr/bin/env python3
"""Outline the live score badge's type into app/lib/badge/glyphs.ts.

WHY
The live badge at /api/badge is an SVG that renders inside other people's
pages through an <img>. An image cannot load web fonts, so badge text set in a
font stack falls back to whatever the host machine has (Arial on one, Segoe on
another), its width moves with it, and it never matches the site. Outlining the
few characters the badge uses, from the site's own OFL faces (the static TTFs
in app/lib/og-fonts that the share cards already use), gives the badge the
site's type on every machine and an exact width to lay out against.

WHAT IT WRITES
For each face below, the outline of each character in its set (integer font
units, y up: one absolute M from the glyph's origin, then relative m, l, q, c
and z), its advance, and the face's 'kern' pair adjustments between those
characters (GPOS PairPos, formats 1 and 2).
app/lib/badge/glyphs.ts is generated: edit this script and re-run it, never
the output.

Usage (from apps/site):  python scripts/build-badge-glyphs.py
Needs fontTools (pip install fonttools).
"""

from __future__ import annotations

import json
import os
import sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
FONTS = os.path.join(APP, 'app', 'lib', 'og-fonts')
OUT = os.path.join(APP, 'app', 'lib', 'badge', 'glyphs.ts')

UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
LOWER = 'abcdefghijklmnopqrstuvwxyz'
DIGITS = '0123456789'

# face key -> (file, role, characters)
FACES = {
    'label': ('SchibstedGrotesk-700.ttf', 'Schibsted Grotesk 700: the label, the grade and the score', UPPER + DIGITS + ' .'),
    'body': ('SchibstedGrotesk-500.ttf', 'Schibsted Grotesk 500: the "Not scored" line', 'Not scored'),
    'mono': ('GeistMono-400.ttf', 'Geist Mono 400: the host, the date and /100', LOWER + DIGITS + ' .-/…'),
}


class OutlinePen(BasePen):
    """Records a glyph in integer font units: the first point absolute
    ("M x y", from the glyph's origin), every later command relative (m, l, q,
    c, z). Only the leading M depends on where the glyph sits, so a renderer
    places a glyph by rewriting that one pair, and relative numbers are short."""

    def __init__(self, glyphSet):
        super().__init__(glyphSet)
        self.ops: list[str] = []
        self.cur = (0, 0)
        self.start = (0, 0)

    def _pts(self, *pts):
        # Relative coordinates in one command are all measured from the
        # point the command starts at.
        base = self.cur
        parts = []
        for pt in pts:
            x, y = round(pt[0]), round(pt[1])
            parts.append(f'{x - base[0]} {y - base[1]}')
            last = (x, y)
        self.cur = last
        return ' '.join(parts)

    def _moveTo(self, pt):
        x, y = round(pt[0]), round(pt[1])
        if not self.ops:
            self.ops.append(f'M{x} {y}')
        else:
            self.ops.append(f'm{x - self.cur[0]} {y - self.cur[1]}')
        self.cur = (x, y)
        self.start = (x, y)

    def _lineTo(self, pt):
        self.ops.append('l' + self._pts(pt))

    def _qCurveToOne(self, p1, p2):
        self.ops.append('q' + self._pts(p1, p2))

    def _curveToOne(self, p1, p2, p3):
        self.ops.append('c' + self._pts(p1, p2, p3))

    def _closePath(self):
        self.ops.append('z')
        self.cur = self.start

    def _endPath(self):
        self.cur = self.start


def pair_kerning(font: TTFont, names: dict[str, str]) -> dict[str, int]:
    """XAdvance adjustments of the 'kern' feature between the given glyphs."""
    if 'GPOS' not in font:
        return {}
    gpos = font['GPOS'].table
    lookup_ids = sorted({
        i
        for fr in gpos.FeatureList.FeatureRecord
        if fr.FeatureTag == 'kern'
        for i in fr.Feature.LookupListIndex
    })
    out: dict[str, int] = {}
    chars = list(names)
    for li in lookup_ids:
        lookup = gpos.LookupList.Lookup[li]
        subtables = []
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                if st.ExtensionLookupType != 2:
                    continue
                st = st.ExtSubTable
            elif lookup.LookupType != 2:
                continue
            subtables.append(st)
        for st in subtables:
            coverage = st.Coverage.glyphs
            for a in chars:
                ga = names[a]
                if ga not in coverage:
                    continue
                for b in chars:
                    key = a + b
                    if key in out:
                        continue  # the first subtable that covers a pair wins
                    gb = names[b]
                    value = None
                    if st.Format == 1:
                        pairset = st.PairSet[coverage.index(ga)]
                        for rec in pairset.PairValueRecord:
                            if rec.SecondGlyph == gb:
                                value = rec.Value1
                                break
                    elif st.Format == 2:
                        c1 = st.ClassDef1.classDefs.get(ga, 0)
                        c2 = st.ClassDef2.classDefs.get(gb, 0)
                        value = st.Class1Record[c1].Class2Record[c2].Value1
                    if value is not None:
                        adv = getattr(value, 'XAdvance', 0) or 0
                        if adv:
                            out[key] = int(adv)
    return out


def build_face(file: str, chars: str) -> dict:
    font = TTFont(os.path.join(FONTS, file))
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    hmtx = font['hmtx']
    upm = font['head'].unitsPerEm
    os2 = font['OS/2']
    names: dict[str, str] = {}
    glyphs: dict[str, dict] = {}
    for ch in chars:
        name = cmap.get(ord(ch))
        if name is None:
            raise SystemExit(f'{file}: no glyph for {ch!r}')
        names[ch] = name
        pen = OutlinePen(glyph_set)
        glyph_set[name].draw(pen)
        glyphs[ch] = {'w': hmtx[name][0], 'd': ''.join(pen.ops)}
    return {
        'upm': upm,
        'capHeight': os2.sCapHeight,
        'xHeight': os2.sxHeight,
        'glyphs': glyphs,
        'kern': pair_kerning(font, names),
    }


def main() -> int:
    faces = {}
    lines = [
        '// GENERATED by scripts/build-badge-glyphs.py from the OFL faces in',
        '// app/lib/og-fonts. Do not edit by hand: change the script and re-run it.',
        '//',
        '// Each glyph is its outline in font units (y up; a leading absolute M from the',
        "// glyph's origin, then relative commands) and its advance; kern holds the",
        "// face's pair adjustments between the characters listed here.",
        '',
        'export interface BadgeFace {',
        '  upm: number;',
        '  capHeight: number;',
        '  xHeight: number;',
        '  glyphs: Record<string, { w: number; d: string }>;',
        '  kern: Record<string, number>;',
        '}',
        '',
    ]
    for key, (file, role, chars) in FACES.items():
        face = build_face(file, chars)
        faces[key] = face
        lines.append(f'/** {role} ({file}). */')
        lines.append(f'export const {key.upper()}: BadgeFace = {json.dumps(face, ensure_ascii=True, separators=(",", ":"))};')
        lines.append('')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(lines))
    size = os.path.getsize(OUT)
    summary = ', '.join(f'{k} {len(v["glyphs"])} glyphs {len(v["kern"])} kern pairs' for k, v in faces.items())
    print(f'wrote {os.path.relpath(OUT, APP)} ({size} bytes): {summary}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

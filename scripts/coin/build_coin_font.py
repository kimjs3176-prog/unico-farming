"""
코인 아이콘 글꼴 만들기: python3 scripts/coin/build_coin_font.py  (pip install fonttools brotli)
→ public/fonts/unico-coin.woff2  (🪙 U+1FA99 한 글자, COLRv0 컬러 글꼴)
"""
# Fluent Emoji Flat 'coin' (MIT, Microsoft) → COLRv0 컬러 폰트 (U+1FA99 🪙 하나만)
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.svgLib.path import parse_path
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.ttLib.tables import otTables
svg = open(os.path.join(HERE, 'fluent_coin_flat.svg')).read()
paths = re.findall(r'<path([^>]*)/>', svg)
layers = []
for attrs in paths:
    d = re.search(r'\sd="([^"]+)"', attrs).group(1)
    fill = re.search(r'fill="#([0-9A-Fa-f]{6})"', attrs).group(1)
    op = re.search(r'opacity="([0-9.]+)"', attrs)
    layers.append((d, fill, float(op.group(1)) if op else 1.0))
UPM = 1000; S = 35.0  # 32px 그림 → 1120 단위 (지름 약 0.98em, 시스템 이모지와 비슷한 크기)
# 글자 높이에 맞춰: 그림 y=2..30 → 글꼴 y = (27.5 - y)*S (기준선 약간 아래까지)
xf = (S, 0, 0, -S, 0, 27.0 * S)
def draw(d, reverse):
    pen = TTGlyphPen(None)
    p = Cu2QuPen(pen, 1.0, reverse_direction=reverse)
    parse_path(d, TransformPen(p, xf))
    return pen.glyph()
names = ['.notdef', 'coin'] + [f'coin.l{i}' for i in range(len(layers))]
glyphs = {'.notdef': TTGlyphPen(None).glyph()}
# 좌표 y 뒤집기로 방향이 바뀌므로 reverse_direction 으로 TrueType 시계 방향 유지
glyphs['coin'] = draw(layers[0][0], True)
for i, (d, _, _) in enumerate(layers): glyphs[f'coin.l{i}'] = draw(d, True)
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(names)
fb.setupCharacterMap({0x1FA99: 'coin'})
fb.setupGlyf(glyphs)
adv = int(32 * S * 0.98)
fb.setupHorizontalMetrics({n: (adv if n != ".notdef" else 500, int(2 * S) if n != ".notdef" else 0) for n in names})
fb.setupHorizontalHeader(ascent=880, descent=-120)
fb.setupNameTable({'familyName': 'Unico Coin', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=880, sTypoDescender=-120, usWinAscent=880, usWinDescent=120)
fb.setupPost()
def rgba(h, a): return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)
fb.setupCPAL([[rgba(f, a) for (_, f, a) in layers]])
fb.setupCOLR({'coin': [(f'coin.l{i}', i) for i in range(len(layers))]}, version=0)
fb.font.flavor = 'woff2'
fb.save(os.path.join(HERE, '..', '..', 'public', 'fonts', 'unico-coin.woff2'))
print('ok')

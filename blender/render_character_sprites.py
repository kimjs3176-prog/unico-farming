"""
원본 마스코트 벡터 → 고해상도 투명 PNG 스프라이트 (PyMuPDF 래스터)
- 3D 릴리프 대신 게임에서 빌보드 평면에 입혀 쓰는 기본 캐릭터 표현
- 라벨 글자/바닥 그림자 제외, 소품이 포함된 포즈는 CROP_X 로 캐릭터만 잘라냄
- 출력: public/sprites/unico_<pose>.png + public/sprites/unico_sprites.json (가로세로비, 발 기준점)

사용: python3 blender/render_character_sprites.py <원본.ai> [pose ...]
"""
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pymupdf  # noqa: E402

import vector_extract as VE  # noqa: E402
from build_character_relief import CROP_X, POSES, _filter_paths  # noqa: E402

HEIGHT_PX = 1024   # 스프라이트 세로 해상도
MARGIN = 0.03      # 여백 비율


def render(char, name, out_png):
    char = _filter_paths(char, name)
    x0, y0, x1, y1 = char["bbox"]
    w, h = x1 - x0, y1 - y0
    m = h * MARGIN
    pw, ph = w + 2 * m, h + 2 * m
    doc = pymupdf.open()
    page = doc.new_page(width=pw, height=ph)
    shape = page.new_shape()
    off = pymupdf.Point(m - x0, m - y0)
    T = lambda pt: pymupdf.Point(pt.x + off.x, pt.y + off.y)
    for p in char["paths"]:
        # 원본 경로 명령(직선/베지어/사각형)을 그대로 재생 → 곡선·구멍(감김 방향) 원본과 동일
        for it in p["items"]:
            op = it[0]
            if op == "l":
                shape.draw_line(T(it[1]), T(it[2]))
            elif op == "c":
                shape.draw_bezier(T(it[1]), T(it[2]), T(it[3]), T(it[4]))
            elif op == "re":
                r = it[1]
                shape.draw_rect(pymupdf.Rect(r.x0 + off.x, r.y0 + off.y, r.x1 + off.x, r.y1 + off.y))
            elif op == "qu":
                q = it[1]
                shape.draw_quad(pymupdf.Quad(T(q.ul), T(q.ur), T(q.ll), T(q.lr)))
        shape.finish(fill=p["color"], color=None, closePath=bool(p.get("closePath", True)), even_odd=p.get("even_odd", False))
    shape.commit()
    scale = HEIGHT_PX / ph
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=True)
    pix.save(out_png)
    return {"w": pix.width, "h": pix.height, "aspect": pix.width / pix.height, "foot": 1 - MARGIN / (1 + 2 * MARGIN) * 1.0, "pieces": len(char["paths"])}


def main(src, poses):
    VE.BEZIER_STEPS = 32
    VE.SAMPLE_PT = 0.4
    chars = {c["name"]: c for c in VE.extract_all(src)}
    out = os.path.join(os.path.dirname(HERE), "public", "sprites")
    os.makedirs(out, exist_ok=True)
    meta_path = os.path.join(out, "unico_sprites.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for pose in poses:
        key = POSES[pose]
        if key not in chars:
            print(f"[{pose}] 클러스터 {key} 없음")
            continue
        png = os.path.join(out, f"unico_{pose}.png")
        info = render(chars[key], pose, png)
        meta[pose] = info
        print(f"[unico_{pose:10s}] {info['w']}x{info['h']} pieces={info['pieces']:3d} {os.path.getsize(png)/1024:6.1f}KB", flush=True)
    json.dump(meta, open(meta_path, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    main(args[0], args[1:] or list(POSES))

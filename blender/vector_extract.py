"""
원본 AI(PDF 호환) 파일에서 캐릭터 벡터 도형을 추출 (PyMuPDF).
- 각 페이지의 채움(fill) 패스를 x 좌표 기준으로 묶어 캐릭터 단위 클러스터로 분리
- 라벨 글자(작은 회색 글리프), 상단 구분선, 바닥 그림자 타원은 제외
결과: [{ 'name', 'page', 'bbox', 'paths': [ {'color': (r,g,b), 'subpaths': [[(x,y),...], ...]} ] }]
좌표계는 PDF(pt, y 아래 방향) 그대로.
"""
import math
import os
import sys
import warnings

warnings.filterwarnings("ignore")
import pymupdf  # noqa: E402

BEZIER_STEPS = 5
SAMPLE_PT = 2.5  # 곡선 샘플 간격(pt). 작을수록 정밀 (래스터용은 0.4)


def _bez(p0, p1, p2, p3, n=None):
    if n is None:  # 곡선 길이에 따라 적응형 샘플링 (pt 단위)
        approx = math.dist((p0.x, p0.y), (p1.x, p1.y)) + math.dist((p1.x, p1.y), (p2.x, p2.y)) + math.dist((p2.x, p2.y), (p3.x, p3.y))
        n = max(2, min(BEZIER_STEPS, int(approx / SAMPLE_PT) + 1))
    pts = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0.x + 3 * mt**2 * t * p1.x + 3 * mt * t**2 * p2.x + t**3 * p3.x
        y = mt**3 * p0.y + 3 * mt**2 * t * p1.y + 3 * mt * t**2 * p2.y + t**3 * p3.y
        pts.append((x, y))
    return pts


def _subpaths(items):
    """fitz drawing items -> 닫힌 폴리라인 목록"""
    subs = []
    cur = []
    last = None

    def flush():
        nonlocal cur
        if len(cur) >= 3:
            # 중복 끝점 제거
            if math.dist(cur[0], cur[-1]) < 1e-3:
                cur.pop()
            if len(cur) >= 3:
                subs.append(cur)
        cur = []

    for it in items:
        op = it[0]
        if op == "re":
            flush()
            r = it[1]
            cur = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
            flush()
            last = None
            continue
        if op == "qu":
            flush()
            q = it[1]
            cur = [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]
            flush()
            last = None
            continue
        p0 = it[1]
        if last is None or math.dist((p0.x, p0.y), last) > 1e-3:
            flush()
            cur = [(p0.x, p0.y)]
        if op == "l":
            p1 = it[2]
            cur.append((p1.x, p1.y))
            last = (p1.x, p1.y)
        elif op == "c":
            pts = _bez(it[1], it[2], it[3], it[4])
            cur.extend(pts)
            last = pts[-1]
    flush()
    return subs


def _is_gray(c, lo=0.3, hi=0.95):
    return c is not None and max(c) - min(c) < 0.03 and lo < c[0] < hi


def extract_page(doc, pno, gap=14.0):
    page = doc[pno]
    drawings = page.get_drawings()
    shapes = []
    for z, d in enumerate(drawings):
        if d.get("fill") is None:
            continue  # 선(stroke) 전용 = 상단 구분선
        r = d["rect"]
        w, h = r.width, r.height
        if _is_gray(d["fill"], 0.4, 0.65) and h < 12 and w < 12:
            continue  # 라벨 글리프
        if _is_gray(d["fill"], 0.6, 0.8) and w > 3.5 * h and w > 40:
            continue  # 바닥 그림자 타원
        subs = _subpaths(d["items"])
        if not subs:
            continue
        shapes.append({"color": tuple(d["fill"]), "subpaths": subs, "rect": (r.x0, r.y0, r.x1, r.y1), "even_odd": bool(d.get("even_odd")), "z": z, "items": d["items"], "closePath": d.get("closePath")})
    # x 축 클러스터링
    shapes.sort(key=lambda s: s["rect"][0])
    clusters = []
    for s in shapes:
        x0, _, x1, _ = s["rect"]
        placed = False
        for c in clusters:
            if x0 <= c["x1"] + gap and x1 >= c["x0"] - gap:
                c["shapes"].append(s)
                c["x0"], c["x1"] = min(c["x0"], x0), max(c["x1"], x1)
                placed = True
                break
        if not placed:
            clusters.append({"x0": x0, "x1": x1, "shapes": [s]})
    # 클러스터 병합(겹침 재검사) 후 좌->우 정렬
    merged = True
    while merged:
        merged = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                a, b = clusters[i], clusters[j]
                if a["x0"] <= b["x1"] + gap and a["x1"] >= b["x0"] - gap:
                    a["shapes"] += b["shapes"]
                    a["x0"], a["x1"] = min(a["x0"], b["x0"]), max(a["x1"], b["x1"])
                    clusters.pop(j)
                    merged = True
                    break
            if merged:
                break
    clusters.sort(key=lambda c: c["x0"])
    out = []
    for ci, c in enumerate(clusters):
        # 원래 그리기 순서(z-order) 복원 — 겹침 앞뒤가 원본과 같아야 함
        c["shapes"].sort(key=lambda s: s["z"])
        ys = [s["rect"][1] for s in c["shapes"]] + [s["rect"][3] for s in c["shapes"]]
        out.append({"name": f"p{pno+1}_{ci}", "page": pno + 1, "bbox": (c["x0"], min(ys), c["x1"], max(ys)), "paths": c["shapes"]})
    return out


def extract_all(path):
    doc = pymupdf.open(path)
    result = []
    for pno in range(1, len(doc)):
        result += extract_page(doc, pno)
    return result


if __name__ == "__main__":
    src = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else None
    chars = extract_all(src)
    for c in chars:
        x0, y0, x1, y1 = c["bbox"]
        print(f"{c['name']:8s} page={c['page']} shapes={len(c['paths']):3d} bbox=({x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}) size={x1-x0:.0f}x{y1-y0:.0f}")
    if outdir:
        os.makedirs(outdir, exist_ok=True)
        doc = pymupdf.open(src)
        for c in chars:
            x0, y0, x1, y1 = c["bbox"]
            pix = doc[c["page"] - 1].get_pixmap(clip=pymupdf.Rect(x0 - 5, y0 - 5, x1 + 5, y1 + 5), dpi=120)
            pix.save(os.path.join(outdir, c["name"] + ".png"))

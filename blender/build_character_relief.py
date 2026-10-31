"""
원본 마스코트 벡터(AI 파일)를 그대로 입체화한 '릴리프' 캐릭터
- 각 채움 패스를 Blender 2D 커브로 만들어 두께(extrude)와 모서리 베벨을 주고,
  그리기 순서대로 앞쪽으로 조금씩 쌓아(stacking) 종이공예/클레이 느낌의 3D 로 변환
- 원본의 선·색·비율이 100% 유지됨 (사용자 요구: 원본과 동일한 캐릭터)
- 포즈별 GLB: public/models/unico_<pose>.glb  (idle, front, side, back, wave, water, tablet, safety, cheer, heart, think, lab, fly, megaphone, present)

사용: python3 blender/build_character_relief.py <원본.ai> [pose ...]
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402

import common as C  # noqa: E402
import vector_extract as VE  # noqa: E402

TARGET_HEIGHT = 2.0   # 캐릭터 키 (m)
DEPTH = 0.09          # 각 조각 두께
GAP = 0.012           # 조각별 앞쪽 오프셋 (z-order)
BEVEL = 0.0           # 모서리 베벨 (0 = 없음, 용량 절약)

# 클러스터 이름 -> 포즈 이름 (vector_extract 결과 기준)
POSES = {
    "idle": "p2_0", "wave": "p3_0", "megaphone": "p3_1", "present": "p3_2",
    "fly": "p4_0", "phone": "p4_1", "travel": "p4_2",
    "sprout": "p5_0", "water": "p5_1", "tablet": "p5_2", "safety": "p5_3",
    "lab": "p6_0", "earth": "p6_1", "think": "p6_2",
    "heart": "p7_0", "cheer": "p7_1",
    "front": "p8_0", "side": "p8_1", "back": "p8_2",
}
# 소품이 같이 그려진 포즈: 클러스터 폭 기준 비율로 캐릭터 영역만 잘라냄 (safety = 2D 트랙터 제외, 3D 트랙터로 대체)
CROP_X = {"safety": (0.62, 1.0), "tablet": (0.55, 1.0)}
# 포즈별 추가 제외 규칙: (정규화 bbox, 색) -> True 면 제거. safety: 머리 높이의 트랙터 초록 조각(캐빈 기둥)
DROP = {
    "safety": lambda nb, col: col == "#7cc062" and nb[1] < 0.45,
}


def _filter_paths(char, name):
    x0, y0, x1, y1 = char["bbox"]
    w, h = x1 - x0, y1 - y0
    lo, hi = CROP_X.get(name, (0.0, 1.0))
    out = []
    for p in char["paths"]:
        px0, py0, px1, py1 = p["rect"]
        if px0 < x0 + lo * w - 1 or px1 > x0 + hi * w + 1:
            continue
        drop = DROP.get(name)
        if drop:
            nb = ((px0 - x0) / w, (py0 - y0) / h, (px1 - x0) / w, (py1 - y0) / h)
            col = "#%02x%02x%02x" % tuple(int(round(c * 255)) for c in p["color"])
            if drop(nb, col):
                continue
        # 흰 배경 위의 작은 흰 조각(2D 에선 안 보이지만 3D 에선 떠 보임) 제거
        if all(c > 0.97 for c in p["color"]) and (px1 - px0) * (py1 - py0) < 0.004 * w * h:
            continue
        out.append(p)
    if not out:
        return char
    ys = [p["rect"][1] for p in out] + [p["rect"][3] for p in out]
    xs = [p["rect"][0] for p in out] + [p["rect"][2] for p in out]
    return {**char, "paths": out, "bbox": (min(xs), min(ys), max(xs), max(ys))}


def build_relief(char, name):
    C.reset_scene()
    char = _filter_paths(char, name)
    x0, y0, x1, y1 = char["bbox"]
    s = TARGET_HEIGHT / (y1 - y0)
    cx = (x0 + x1) / 2
    root = C.empty("Unico")
    meshes = []
    kept = 0
    for i, p in enumerate(char["paths"]):
        cu = bpy.data.curves.new(f"c{i}", "CURVE")
        cu.dimensions = "2D"
        cu.fill_mode = "BOTH"
        cu.extrude = DEPTH / 2
        if BEVEL > 0:
            cu.bevel_depth = BEVEL
            cu.bevel_resolution = 0
        cu.resolution_u = 1
        for sp in p["subpaths"]:
            spl = cu.splines.new("POLY")
            spl.points.add(len(sp) - 1)
            for k, (px, py) in enumerate(sp):
                spl.points[k].co = ((px - cx) * s, (y1 - py) * s, 0.0, 1.0)
            spl.use_cyclic_u = True
        hexcol = "#%02x%02x%02x" % tuple(int(round(c * 255)) for c in p["color"])
        mat = C.material("col" + hexcol, hexcol, roughness=0.9)
        ob = bpy.data.objects.new(f"piece{i}", cu)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(mat)
        # 커브 -> 메시
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        me.materials.append(mat)
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        mo = bpy.data.objects.new(f"piece{i}", me)
        bpy.context.scene.collection.objects.link(mo)
        # 로컬 XY 평면 -> 세워서(XZ) 정면이 -Y 를 보게. z-order 만큼 앞(-Y)으로.
        mo.rotation_euler = (math.pi / 2, 0, 0)
        mo.location = (0, -(kept * GAP), 0)
        meshes.append(mo)
        kept += 1
    body = C.join("UnicoRelief", meshes, parent=root)
    # 전체 두께 중앙 정렬
    total = kept * GAP + DEPTH
    body.location = (0, total / 2 - DEPTH / 2, 0)
    for pg in body.data.polygons:
        pg.use_smooth = False
    return root, kept


def main(src, poses):
    chars = {c["name"]: c for c in VE.extract_all(src)}
    out = os.path.join(os.path.dirname(HERE), "public", "models")
    blend = os.path.join(HERE, "blend")
    for pose in poses:
        key = POSES[pose]
        if key not in chars:
            print(f"[{pose}] 클러스터 {key} 없음 (사용 가능: {sorted(chars)})")
            continue
        root, kept = build_relief(chars[key], pose)
        st = C.stats()
        size = C.export_glb(os.path.join(out, f"unico_{pose}.glb"), normals=False)
        C.save_blend(os.path.join(blend, f"unico_{pose}.blend"))
        print(f"[unico_{pose:10s}] pieces={kept:3d} tris={st['tris']:6d} glb={size/1024:6.1f}KB", flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    src = args[0]
    poses = args[1:] or list(POSES)
    main(src, poses)

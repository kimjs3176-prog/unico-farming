"""
농장 / 목장 / 스마트팜 환경 에셋 (캐주얼 로우폴리)
각 함수는 빈 씬에 하나의 에셋을 만들고, build_all.py 가 GLB 로 내보냄.
애니메이션이 필요한 파트는 이름으로 구분: Wheel*, Rotor*, Blades, Door 등
전방은 Blender -Y (glTF +Z).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import common as C  # noqa: E402
from common import box, cone, cylinder, empty, join, material, plane, prism, segment, sphere, torus  # noqa: E402

F = -1


# ---------------------------------------------------------------- 자연물
def tree_round():
    C.reset_scene()
    root = empty("Tree")
    join("Trunk", [cylinder("t", material("wood_dark"), loc=(0, 0, 0.6), radius=0.16, depth=1.2, radius2=0.12, segments=10)], parent=root)
    g = material("grass_dark")
    g2 = material("grass")
    join("Canopy", [
        sphere("c1", g, loc=(0, 0, 1.75), radius=0.85, segments=14, rings=10),
        sphere("c2", g2, loc=(0.45, 0.2, 2.1), radius=0.6, segments=12, rings=8),
        sphere("c3", g2, loc=(-0.4, -0.25, 2.0), radius=0.55, segments=12, rings=8),
        sphere("c4", g, loc=(0.05, -0.1, 2.5), radius=0.5, segments=12, rings=8),
    ], parent=root)
    return root


def tree_pine():
    C.reset_scene()
    root = empty("Pine")
    join("Trunk", [cylinder("t", material("wood_dark"), loc=(0, 0, 0.5), radius=0.14, depth=1.0, segments=10)], parent=root)
    g = material("grass_dark")
    join("Canopy", [
        cone("a", g, loc=(0, 0, 1.3), radius=0.9, depth=1.2, segments=10),
        cone("b", g, loc=(0, 0, 2.0), radius=0.7, depth=1.1, segments=10),
        cone("c", g, loc=(0, 0, 2.65), radius=0.45, depth=0.9, segments=10),
    ], parent=root)
    return root


def bush():
    C.reset_scene()
    root = empty("Bush")
    g, g2 = material("grass_dark"), material("grass")
    join("BushMesh", [
        sphere("a", g, loc=(0, 0, 0.35), radius=0.45, segments=12, rings=8),
        sphere("b", g2, loc=(0.35, 0.1, 0.3), radius=0.32, segments=12, rings=8),
        sphere("c", g2, loc=(-0.3, -0.15, 0.28), radius=0.3, segments=12, rings=8),
    ], parent=root)
    return root


def rock():
    C.reset_scene()
    root = empty("Rock")
    s = material("stone")
    join("RockMesh", [
        sphere("a", s, loc=(0, 0, 0.25), radius=0.4, scale=(1.2, 0.9, 0.65), segments=8, rings=6, smooth=False),
        sphere("b", s, loc=(0.3, 0.2, 0.2), radius=0.25, scale=(1, 1, 0.7), segments=7, rings=5, smooth=False),
    ], parent=root)
    return root


def flower_patch():
    C.reset_scene()
    root = empty("Flowers")
    parts = []
    cols = ["tomato", "corn", "pink_deep", "white"]
    import random
    rnd = random.Random(7)
    for i in range(7):
        x, y = rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5)
        parts.append(segment("stem", material("leaf_dark"), (x, y, 0), (x, y, 0.3), 0.015, cap=False, segments=6))
        parts.append(sphere("bloom", material(cols[i % 4]), loc=(x, y, 0.33), radius=0.07, scale=(1, 1, 0.6), segments=8, rings=6))
    join("FlowerMesh", parts, parent=root)
    return root


def hay_bale():
    C.reset_scene()
    root = empty("HayBale")
    join("HayMesh", [
        cylinder("bale", material("hay"), loc=(0, 0, 0.45), radius=0.45, depth=0.8, rot=(90, 0, 0), segments=14),
        torus("ring1", material("hay_dark"), loc=(0, 0.2, 0.45), major=0.45, minor=0.025, rot=(90, 0, 0)),
        torus("ring2", material("hay_dark"), loc=(0, -0.2, 0.45), major=0.45, minor=0.025, rot=(90, 0, 0)),
    ], parent=root)
    return root


# ---------------------------------------------------------------- 건물/구조물
def fence():
    """1 유닛 길이(2m) 펜스. X 방향으로 이어 붙임."""
    C.reset_scene()
    root = empty("Fence")
    w = material("wood")
    parts = []
    for x in (-1.0, 1.0):
        parts.append(box("post", w, loc=(x, 0, 0.5), size=(0.14, 0.14, 1.0)))
        parts.append(cone("cap", w, loc=(x, 0, 1.06), radius=0.1, depth=0.12, segments=4, smooth=False))
    for z in (0.4, 0.8):
        parts.append(box("rail", material("wood_dark"), loc=(0, 0, z), size=(2.0, 0.08, 0.12)))
    join("FenceMesh", parts, parent=root)
    return root


def barn():
    C.reset_scene()
    root = empty("Barn")
    red, roof, cream, wd = material("barn_red"), material("barn_roof"), material("cream"), material("wood_dark")
    parts = [
        box("base", red, loc=(0, 0, 1.4), size=(5.0, 6.0, 2.8)),
        prism("roof", roof, loc=(0, 0, 2.8), width=5.6, depth=6.6, height=1.9),
        box("trim", cream, loc=(0, F * 3.0, 1.4), size=(5.2, 0.05, 0.12)),
        # 정면 X 자 문
        box("door", wd, loc=(0, F * 3.03, 1.0), size=(1.8, 0.1, 2.0)),
        box("door_x1", cream, loc=(0, F * 3.09, 1.0), size=(0.12, 0.04, 2.2), rot=(0, 0, 40)),
        box("door_x2", cream, loc=(0, F * 3.09, 1.0), size=(0.12, 0.04, 2.2), rot=(0, 0, -40)),
        box("loft", cream, loc=(0, F * 3.03, 3.3), size=(1.0, 0.1, 0.9)),
    ]
    for sx in (-1, 1):
        parts.append(box("window", cream, loc=(sx * 1.7, F * 3.03, 1.8), size=(0.8, 0.1, 0.8)))
        parts.append(box("window_glass", material("glass", alpha=0.7), loc=(sx * 1.7, F * 3.08, 1.8), size=(0.6, 0.04, 0.6)))
    join("BarnMesh", parts, parent=root)
    return root


def silo():
    C.reset_scene()
    root = empty("Silo")
    parts = [
        cylinder("body", material("cream"), loc=(0, 0, 2.0), radius=1.0, depth=4.0, segments=20),
        sphere("dome", material("barn_red"), loc=(0, 0, 4.0), radius=1.05, scale=(1, 1, 0.6), segments=20, rings=10),
        cylinder("band1", material("steel"), loc=(0, 0, 1.0), radius=1.03, depth=0.12, segments=20),
        cylinder("band2", material("steel"), loc=(0, 0, 2.5), radius=1.03, depth=0.12, segments=20),
        box("ladder", material("steel_dark"), loc=(0, 1.05, 2.0), size=(0.4, 0.06, 3.8)),
    ]
    join("SiloMesh", parts, parent=root)
    return root


def windmill():
    C.reset_scene()
    root = empty("Windmill")
    st, sd = material("steel"), material("steel_dark")
    parts = [cylinder("tower", st, loc=(0, 0, 3.0), radius=0.25, depth=6.0, radius2=0.12, segments=10)]
    for i in range(4):
        a = math.radians(90 * i)
        x, y = 0.55 * math.cos(a), 0.55 * math.sin(a)
        parts.append(segment("leg", sd, (x, y, 0), (x * 0.25, y * 0.25, 5.2), 0.05, cap=False, segments=6))
    join("Tower", parts, parent=root)
    hub = empty("Blades", loc=(0, F * 0.45, 6.0), parent=root)
    bl = [sphere("hub", sd, loc=(0, 0, 0), radius=0.22, segments=10, rings=8)]
    for i in range(8):
        a = math.radians(45 * i)
        bl.append(box("blade", material("cream"), loc=(1.0 * math.cos(a), 0, 1.0 * math.sin(a)), size=(1.6, 0.04, 0.3), rot=(0, -math.degrees(a), 0)))
    join("BladesMesh", bl, parent=hub)
    return root


def greenhouse():
    """비닐하우스 3동 (스마트팜) + 센서 폴 + 태양광 패널 + 급수탱크"""
    C.reset_scene()
    root = empty("SmartFarm")
    film = material("film", alpha=0.45, roughness=0.3)
    frame = material("steel")
    parts = []
    for i, y in enumerate((-3.2, 0.0, 3.2)):
        # 반원 터널: 스케일된 실린더(가로로 눕힘), 아래 절반은 지면 아래
        parts.append(cylinder(f"tunnel{i}", film, loc=(0, y, 0.0), radius=1.4, depth=8.0, rot=(0, 90, 0), scale=(1, 1.0, 1.0), segments=14))
        for x in (-3.9, -1.3, 1.3, 3.9):
            parts.append(torus(f"rib{i}", frame, loc=(x, y, 0), major=1.42, minor=0.04, rot=(0, 90, 0), segments=18, ring=6))
        parts.append(box("ridge", frame, loc=(0, y, 1.42), size=(8.0, 0.06, 0.06)))
        parts.append(box("door", material("steel_dark"), loc=(F * -4.0 * -1, y, 0.6), size=(0.05, 0.9, 1.2)))
    # 지면 아래 절반 제거 대신 바닥판으로 가림
    parts.append(box("floor", material("soil"), loc=(0, 0, -0.02), size=(8.4, 9.2, 0.04)))
    join("Greenhouses", parts, parent=root)
    # 센서 폴 (온습도 센서 + 안테나)
    sp = [
        cylinder("pole", frame, loc=(5.0, -4.5, 1.2), radius=0.05, depth=2.4, segments=8),
        box("sensor", material("white"), loc=(5.0, -4.5, 2.3), size=(0.3, 0.3, 0.4)),
        sphere("led", material("tomato", emission=2.0), loc=(5.0, -4.65, 2.3), radius=0.05, segments=8, rings=6),
        segment("antenna", material("steel_dark"), (5.0, -4.5, 2.5), (5.0, -4.5, 3.1), 0.015, cap=False, segments=6),
        sphere("ant_tip", material("tomato", emission=2.0), loc=(5.0, -4.5, 3.12), radius=0.04, segments=8, rings=6),
    ]
    join("SensorPole", sp, parent=root)
    # 태양광 패널
    solar = [
        box("stand", frame, loc=(5.5, 1.0, 0.5), size=(0.1, 0.1, 1.0)),
        box("panel", material("solar", roughness=0.25, metallic=0.3), loc=(5.5, 1.0, 1.1), size=(2.2, 1.4, 0.06), rot=(0, -30, 0)),
        box("grid", material("steel"), loc=(5.5, 1.0, 1.13), size=(2.25, 0.04, 0.02), rot=(0, -30, 0)),
    ]
    join("SolarPanel", solar, parent=root)
    # 급수 탱크
    tank = [
        cylinder("tank", material("water", alpha=0.85), loc=(5.5, 4.0, 1.0), radius=0.7, depth=1.6, segments=14),
        cylinder("lid", frame, loc=(5.5, 4.0, 1.82), radius=0.72, depth=0.08, segments=14),
        segment("pipe", frame, (4.9, 4.0, 0.3), (4.3, 3.2, 0.3), 0.05, cap=False, segments=6),
    ]
    join("WaterTank", tank, parent=root)
    return root


def market_stall():
    C.reset_scene()
    root = empty("Market")
    w, wd = material("wood"), material("wood_dark")
    parts = [
        box("counter", w, loc=(0, 0, 0.5), size=(3.0, 1.2, 1.0)),
        box("counter_top", wd, loc=(0, 0, 1.02), size=(3.2, 1.4, 0.06)),
    ]
    for x in (-1.4, 1.4):
        parts.append(box("pole", wd, loc=(x, 0.5, 1.4), size=(0.1, 0.1, 2.8)))
    # 줄무늬 차양
    for i in range(6):
        c = material("awning_red") if i % 2 == 0 else material("awning_white")
        parts.append(box("awning", c, loc=(-1.5 + 0.3 + i * 0.52, 0.0, 2.75), size=(0.52, 1.9, 0.06), rot=(12, 0, 0)))
    # 진열 상자 + 작물
    for i, col in enumerate(("tomato", "carrot", "corn", "cabbage")):
        x = -1.1 + i * 0.72
        parts.append(box("crate", wd, loc=(x, -0.2, 1.17), size=(0.6, 0.6, 0.25)))
        for j in range(3):
            parts.append(sphere("goods", material(col), loc=(x - 0.18 + j * 0.18, -0.2, 1.33), radius=0.1, segments=8, rings=6))
    parts.append(box("sign", material("cream"), loc=(0, 0.55, 2.2), size=(2.0, 0.06, 0.5)))
    join("MarketMesh", parts, parent=root)
    return root


def well():
    C.reset_scene()
    root = empty("Well")
    parts = [
        cylinder("wall", material("stone"), loc=(0, 0, 0.45), radius=0.7, depth=0.9, segments=14),
        cylinder("water", material("water"), loc=(0, 0, 0.6), radius=0.6, depth=0.1, segments=14),
        box("post1", material("wood"), loc=(-0.6, 0, 1.3), size=(0.12, 0.12, 1.6)),
        box("post2", material("wood"), loc=(0.6, 0, 1.3), size=(0.12, 0.12, 1.6)),
        prism("roof", material("barn_roof"), loc=(0, 0, 2.05), width=1.8, depth=1.6, height=0.5),
        cylinder("axle", material("wood_dark"), loc=(0, 0, 1.7), radius=0.06, depth=1.3, rot=(0, 90, 0), segments=8),
        cylinder("bucket", material("steel"), loc=(0, 0, 1.0), radius=0.15, depth=0.25, segments=10),
    ]
    join("WellMesh", parts, parent=root)
    return root


def sign_post():
    C.reset_scene()
    root = empty("Sign")
    join("SignMesh", [
        box("post", material("wood"), loc=(0, 0, 0.7), size=(0.12, 0.12, 1.4)),
        box("board", material("cream"), loc=(0, F * 0.08, 1.2), size=(1.2, 0.06, 0.5)),
        box("board2", material("hay"), loc=(0, F * 0.08, 0.75), size=(0.9, 0.06, 0.35), rot=(0, 0, -8)),
    ], parent=root)
    return root


def coop():
    """닭장"""
    C.reset_scene()
    root = empty("Coop")
    parts = [
        box("body", material("wood"), loc=(0, 0, 0.9), size=(1.8, 1.4, 1.2)),
        prism("roof", material("barn_roof"), loc=(0, 0, 1.5), width=2.1, depth=1.7, height=0.6),
        box("door", material("wood_dark"), loc=(0, F * 0.72, 0.6), size=(0.5, 0.05, 0.6)),
        box("ramp", material("wood_dark"), loc=(0, F * 1.1, 0.25), size=(0.5, 0.9, 0.05), rot=(F * 28, 0, 0)),
    ]
    for x in (-0.8, 0.8):
        parts.append(box("leg", material("wood_dark"), loc=(x, 0, 0.15), size=(0.12, 1.2, 0.3)))
    join("CoopMesh", parts, parent=root)
    return root


def trough():
    C.reset_scene()
    root = empty("Trough")
    join("TroughMesh", [
        box("base", material("wood_dark"), loc=(0, 0, 0.25), size=(1.6, 0.6, 0.5)),
        box("inner", material("hay"), loc=(0, 0, 0.47), size=(1.4, 0.45, 0.1)),
    ], parent=root)
    return root


# ---------------------------------------------------------------- 밭/작물
def soil_plot():
    """1 타일(2m x 2m) 경작지 - 이랑 4줄"""
    C.reset_scene()
    root = empty("Plot")
    parts = [box("base", material("soil_dark"), loc=(0, 0, 0.05), size=(2.0, 2.0, 0.1))]
    for i in range(4):
        parts.append(cylinder("ridge", material("soil"), loc=(-0.75 + i * 0.5, 0, 0.12), radius=0.2, depth=1.9, rot=(90, 0, 0), scale=(1, 1, 0.5), segments=8))
    join("PlotMesh", parts, parent=root)
    return root


def crops():
    """작물 5종 x 성장 3단계 (seed/sprout/mature) 를 한 파일에. 노드명: crop_<type>_<stage>"""
    C.reset_scene()
    root = empty("Crops")
    ld, lf = material("leaf_dark"), material("leaf")

    def sprout(n, parent, h=0.25):
        return join(n, [
            segment("stem", ld, (0, 0, 0), (0, 0, h), 0.02, cap=False, segments=6),
            sphere("l1", lf, loc=(-0.1, 0, h), radius=0.08, scale=(1.4, 0.4, 0.7), rot=(0, -30, 0), segments=10, rings=6),
            sphere("l2", lf, loc=(0.1, 0, h), radius=0.08, scale=(1.4, 0.4, 0.7), rot=(0, 30, 0), segments=10, rings=6),
        ], parent=parent)

    types = ["carrot", "tomato", "corn", "cabbage", "strawberry"]
    for ti, t in enumerate(types):
        for stage in range(3):
            node = empty(f"crop_{t}_{stage}", loc=(ti * 1.5, stage * 1.5, 0), parent=root)
            if stage == 0:
                sprout("m", node, 0.18)
                continue
            if stage == 1:
                sprout("m", node, 0.35)
                continue
            parts = []
            if t == "carrot":
                parts.append(cone("root", material("carrot"), loc=(0, 0, 0.08), radius=0.12, depth=0.3, rot=(180, 0, 0), segments=10))
                for a in range(5):
                    ang = math.radians(72 * a)
                    parts.append(segment("leaf", ld, (0, 0, 0.2), (0.18 * math.cos(ang), 0.18 * math.sin(ang), 0.55), 0.025, cap=False, segments=6))
            elif t == "tomato":
                parts.append(segment("stalk", ld, (0, 0, 0), (0, 0, 0.8), 0.03, cap=False, segments=6))
                parts.append(box("stake", material("wood"), loc=(0.08, 0, 0.45), size=(0.04, 0.04, 0.9)))
                for a in range(4):
                    ang = math.radians(90 * a + 30)
                    parts.append(sphere("leaf", lf, loc=(0.2 * math.cos(ang), 0.2 * math.sin(ang), 0.35 + a * 0.12), radius=0.12, scale=(1.4, 0.5, 0.6), rot=(0, 0, 90 * a), segments=10, rings=6))
                    parts.append(sphere("fruit", material("tomato"), loc=(0.17 * math.cos(ang + 0.8), 0.17 * math.sin(ang + 0.8), 0.3 + a * 0.13), radius=0.09, segments=10, rings=8))
            elif t == "corn":
                parts.append(segment("stalk", ld, (0, 0, 0), (0, 0, 1.4), 0.035, cap=False, segments=6))
                for a in range(4):
                    ang = math.radians(90 * a)
                    parts.append(sphere("leaf", lf, loc=(0.25 * math.cos(ang), 0.25 * math.sin(ang), 0.5 + a * 0.2), radius=0.3, scale=(1.3, 0.25, 0.3), rot=(0, 0, 90 * a), segments=10, rings=6))
                parts.append(sphere("cob", material("corn"), loc=(0.12, 0.05, 0.95), radius=0.09, scale=(1, 1, 2.2), segments=10, rings=8))
                parts.append(cone("tassel", material("hay"), loc=(0, 0, 1.5), radius=0.08, depth=0.3, segments=8))
            elif t == "cabbage":
                parts.append(sphere("head", material("cabbage"), loc=(0, 0, 0.28), radius=0.28, segments=14, rings=10))
                for a in range(6):
                    ang = math.radians(60 * a)
                    parts.append(sphere("leaf", material("cabbage_dark"), loc=(0.26 * math.cos(ang), 0.26 * math.sin(ang), 0.14), radius=0.2, scale=(1.3, 0.8, 0.45), rot=(0, 0, 60 * a), segments=10, rings=6))
            elif t == "strawberry":
                for a in range(5):
                    ang = math.radians(72 * a)
                    parts.append(sphere("leaf", lf, loc=(0.18 * math.cos(ang), 0.18 * math.sin(ang), 0.15), radius=0.14, scale=(1.3, 0.8, 0.4), rot=(0, 0, 72 * a), segments=10, rings=6))
                for a in range(4):
                    ang = math.radians(90 * a + 45)
                    parts.append(sphere("fruit", material("strawberry"), loc=(0.22 * math.cos(ang), 0.22 * math.sin(ang), 0.1), radius=0.08, scale=(1, 1, 1.3), segments=10, rings=8))
            join("m", parts, parent=node)
    return root


# ---------------------------------------------------------------- 동물
def cow():
    C.reset_scene()
    root = empty("Cow")
    w, spot, pink = material("white"), material("cow_spot"), material("udder")
    body = empty("Body", loc=(0, 0, 0.75), parent=root)
    join("BodyMesh", [
        sphere("torso", w, loc=(0, 0, 0), radius=0.55, scale=(1.0, 1.6, 0.9), segments=20, rings=14),
        sphere("spot1", spot, loc=(0.35, 0.3, 0.25), radius=0.3, scale=(1, 1.2, 0.8), segments=12, rings=8),
        sphere("spot2", spot, loc=(-0.3, -0.45, 0.15), radius=0.26, scale=(1, 1, 0.8), segments=12, rings=8),
        sphere("udder", pink, loc=(0, 0.35, -0.45), radius=0.22, scale=(1, 1.2, 0.7), segments=12, rings=8),
    ], parent=body)
    head = empty("Head", loc=(0, F * 0.9, 0.3), parent=body)
    join("HeadMesh", [
        sphere("skull", w, loc=(0, 0, 0), radius=0.32, scale=(1, 1.1, 0.95), segments=16, rings=12),
        sphere("snout", pink, loc=(0, F * 0.3, -0.1), radius=0.22, scale=(1.1, 0.7, 0.8), segments=14, rings=10),
        sphere("eyeL", material("eye"), loc=(-0.17, F * 0.26, 0.1), radius=0.05, segments=8, rings=6),
        sphere("eyeR", material("eye"), loc=(0.17, F * 0.26, 0.1), radius=0.05, segments=8, rings=6),
        sphere("earL", w, loc=(-0.38, 0, 0.12), radius=0.1, scale=(1.5, 0.6, 0.8), segments=10, rings=6),
        sphere("earR", w, loc=(0.38, 0, 0.12), radius=0.1, scale=(1.5, 0.6, 0.8), segments=10, rings=6),
        cone("hornL", material("hay"), loc=(-0.2, 0, 0.35), radius=0.05, depth=0.2, rot=(0, -30, 0), segments=8),
        cone("hornR", material("hay"), loc=(0.2, 0, 0.35), radius=0.05, depth=0.2, rot=(0, 30, 0), segments=8),
    ], parent=head)
    for n, (x, y) in {"LegFL": (-0.3, -0.5), "LegFR": (0.3, -0.5), "LegBL": (-0.3, 0.5), "LegBR": (0.3, 0.5)}.items():
        piv = empty(n, loc=(x, y, -0.35), parent=body)
        join(n + "Mesh", [
            segment("leg", w, (0, 0, 0), (0, 0, -0.35), 0.11),
            cylinder("hoof", spot, loc=(0, 0, -0.38), radius=0.12, depth=0.08, segments=10),
        ], parent=piv)
    join("TailMesh", [segment("tail", w, (0, 0.85, 0.3), (0, 1.1, -0.1), 0.03), sphere("tuft", spot, loc=(0, 1.12, -0.15), radius=0.07, segments=8, rings=6)], parent=body)
    return root


def chicken():
    C.reset_scene()
    root = empty("Chicken")
    w = material("white")
    body = empty("Body", loc=(0, 0, 0.3), parent=root)
    join("BodyMesh", [
        sphere("body", w, loc=(0, 0, 0), radius=0.25, scale=(1, 1.3, 1), segments=14, rings=10),
        sphere("tail", w, loc=(0, 0.3, 0.15), radius=0.12, scale=(0.6, 1, 1.4), rot=(30, 0, 0), segments=10, rings=6),
        sphere("wingL", material("shadow"), loc=(-0.22, 0, 0), radius=0.12, scale=(0.4, 1.2, 0.8), segments=10, rings=6),
        sphere("wingR", material("shadow"), loc=(0.22, 0, 0), radius=0.12, scale=(0.4, 1.2, 0.8), segments=10, rings=6),
    ], parent=body)
    head = empty("Head", loc=(0, F * 0.22, 0.3), parent=body)
    join("HeadMesh", [
        sphere("head", w, loc=(0, 0, 0), radius=0.15, segments=12, rings=8),
        cone("beak", material("beak"), loc=(0, F * 0.18, -0.02), radius=0.05, depth=0.12, rot=(F * -90, 0, 0), segments=8),
        sphere("comb", material("chicken_comb"), loc=(0, 0, 0.16), radius=0.06, scale=(0.5, 1.4, 1), segments=8, rings=6),
        sphere("wattle", material("chicken_comb"), loc=(0, F * 0.12, -0.12), radius=0.04, segments=8, rings=6),
        sphere("eyeL", material("eye"), loc=(-0.1, F * 0.1, 0.03), radius=0.025, segments=6, rings=5),
        sphere("eyeR", material("eye"), loc=(0.1, F * 0.1, 0.03), radius=0.025, segments=6, rings=5),
    ], parent=head)
    for n, x in (("LegL", -0.08), ("LegR", 0.08)):
        join(n, [segment("leg", material("beak"), (x, 0, -0.2), (x, 0, -0.32), 0.02, cap=False, segments=6), box("foot", material("beak"), loc=(x, F * 0.03, -0.32), size=(0.1, 0.14, 0.02))], parent=body)
    return root


def sheep():
    C.reset_scene()
    root = empty("Sheep")
    w, face = material("cream"), material("sheep_face")
    body = empty("Body", loc=(0, 0, 0.55), parent=root)
    parts = [sphere("wool", w, loc=(0, 0, 0), radius=0.42, scale=(1, 1.4, 0.95), segments=16, rings=12)]
    import random
    rnd = random.Random(3)
    for i in range(8):
        parts.append(sphere("puff", w, loc=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.45, 0.45), rnd.uniform(0.1, 0.35)), radius=rnd.uniform(0.18, 0.26), segments=10, rings=6))
    join("BodyMesh", parts, parent=body)
    head = empty("Head", loc=(0, F * 0.62, 0.15), parent=body)
    join("HeadMesh", [
        sphere("face", face, loc=(0, 0, 0), radius=0.2, scale=(0.9, 1.1, 1), segments=12, rings=8),
        sphere("top", w, loc=(0, 0.05, 0.16), radius=0.16, segments=10, rings=6),
        sphere("earL", face, loc=(-0.2, 0.02, 0.05), radius=0.07, scale=(1.6, 0.6, 0.7), segments=8, rings=6),
        sphere("earR", face, loc=(0.2, 0.02, 0.05), radius=0.07, scale=(1.6, 0.6, 0.7), segments=8, rings=6),
        sphere("eyeL", w, loc=(-0.09, F * 0.17, 0.04), radius=0.035, segments=6, rings=5),
        sphere("eyeR", w, loc=(0.09, F * 0.17, 0.04), radius=0.035, segments=6, rings=5),
    ], parent=head)
    for n, (x, y) in {"LegFL": (-0.2, -0.3), "LegFR": (0.2, -0.3), "LegBL": (-0.2, 0.3), "LegBR": (0.2, 0.3)}.items():
        piv = empty(n, loc=(x, y, -0.3), parent=body)
        join(n + "Mesh", [segment("leg", face, (0, 0, 0), (0, 0, -0.22), 0.06)], parent=piv)
    return root


# ---------------------------------------------------------------- 농기계
def tractor():
    """초록 트랙터 (마스코트 시트 참고). 바퀴 노드: WheelFL/FR/BL/BR, 조향 피벗: SteerL/SteerR"""
    C.reset_scene()
    root = empty("Tractor")
    g, gd, tire, hub, st, sd = material("tractor_green"), material("tractor_green_dark"), material("tire"), material("hub"), material("steel"), material("steel_dark")
    glass = material("glass", alpha=0.45, roughness=0.2)
    body = [
        box("hood", g, loc=(0, F * 0.9, 0.95), size=(1.1, 1.8, 0.8)),
        box("hood_top", gd, loc=(0, F * 0.9, 1.37), size=(0.9, 1.6, 0.06)),
        box("grill", sd, loc=(0, F * 1.82, 0.9), size=(0.9, 0.06, 0.6)),
        sphere("lampL", material("corn", emission=1.5), loc=(-0.35, F * 1.86, 1.1), radius=0.1, segments=8, rings=6),
        sphere("lampR", material("corn", emission=1.5), loc=(0.35, F * 1.86, 1.1), radius=0.1, segments=8, rings=6),
        box("chassis", sd, loc=(0, 0, 0.6), size=(1.0, 3.6, 0.4)),
        box("floor", gd, loc=(0, 0.5, 0.95), size=(1.3, 1.6, 0.1)),
        box("seat", sd, loc=(0, 0.75, 1.25), size=(0.6, 0.5, 0.5)),
        box("seat_back", sd, loc=(0, 1.0, 1.7), size=(0.6, 0.12, 0.6)),
        cylinder("exhaust", sd, loc=(0.45, F * 0.5, 1.9), radius=0.05, depth=1.2, segments=8),
        cylinder("exhaust_cap", st, loc=(0.45, F * 0.5, 2.5), radius=0.08, depth=0.08, segments=8),
        # 캐빈 프레임
        box("pillarFL", g, loc=(-0.6, F * 0.1, 1.75), size=(0.1, 0.1, 1.7)),
        box("pillarFR", g, loc=(0.6, F * 0.1, 1.75), size=(0.1, 0.1, 1.7)),
        box("pillarBL", g, loc=(-0.6, 1.2, 1.75), size=(0.1, 0.1, 1.7)),
        box("pillarBR", g, loc=(0.6, 1.2, 1.75), size=(0.1, 0.1, 1.7)),
        box("roof", g, loc=(0, 0.55, 2.62), size=(1.5, 1.6, 0.12)),
        box("windshield", glass, loc=(0, F * 0.1, 1.85), size=(1.1, 0.03, 1.3)),
        box("rear_glass", glass, loc=(0, 1.2, 1.85), size=(1.1, 0.03, 1.3)),
        # 핸들
        cylinder("column", sd, loc=(0, F * 0.0, 1.25), radius=0.03, depth=0.5, rot=(F * 30, 0, 0), segments=6),
        torus("wheel", sd, loc=(0, F * 0.12, 1.47), major=0.2, minor=0.025, rot=(F * 30, 0, 0)),
        # 뒤 쟁기 연결부
        box("hitch", sd, loc=(0, 1.95, 0.5), size=(0.3, 0.4, 0.15)),
    ]
    join("TractorBody", body, parent=root)

    def wheel(name, loc, r, w):
        piv = empty(name, loc=loc, parent=root)
        join(name + "Mesh", [
            cylinder("tire", tire, loc=(0, 0, 0), radius=r, depth=w, rot=(0, 90, 0), segments=16),
            cylinder("hub", hub, loc=(0, 0, 0), radius=r * 0.55, depth=w + 0.04, rot=(0, 90, 0), segments=12),
            cylinder("cap", gd, loc=(0, 0, 0), radius=r * 0.2, depth=w + 0.08, rot=(0, 90, 0), segments=8),
        ] + [box("tread", sd, loc=(0, r * 0.98 * math.cos(math.radians(a)), r * 0.98 * math.sin(math.radians(a))), size=(w + 0.02, 0.12, 0.12), rot=(a, 0, 0)) for a in range(0, 360, 30)], parent=piv)
        return piv

    for n, x in (("L", -0.75), ("R", 0.75)):
        steer = empty(f"Steer{n}", loc=(x, F * 1.25, 0.45), parent=root)
        wheel_piv = wheel(f"WheelF{n}", (0, 0, 0), 0.45, 0.3)
        wheel_piv.parent = steer
        wheel(f"WheelB{n}", (x * 1.1, 0.95, 0.75), 0.75, 0.45)
    # 쟁기 (뒤에 매달린 3날)
    plow = empty("Plow", loc=(0, 2.3, 0.5), parent=root)
    pp = [box("bar", sd, loc=(0, 0, 0), size=(1.8, 0.12, 0.12))]
    for x in (-0.6, 0.0, 0.6):
        pp.append(box("shank", sd, loc=(x, 0.1, -0.2), size=(0.08, 0.08, 0.5)))
        pp.append(box("blade", st, loc=(x, 0.15, -0.45), size=(0.3, 0.2, 0.15), rot=(30, 0, 0)))
    join("PlowMesh", pp, parent=plow)
    return root


def drone():
    C.reset_scene()
    root = empty("Drone")
    w, sd = material("white"), material("steel_dark")
    body = [sphere("body", w, loc=(0, 0, 0), radius=0.25, scale=(1, 1.2, 0.5), segments=14, rings=8),
            sphere("cam", material("eye"), loc=(0, F * 0.2, -0.1), radius=0.06, segments=8, rings=6),
            box("tank", material("water", alpha=0.8), loc=(0, 0.05, -0.18), size=(0.25, 0.3, 0.15))]
    for i, (x, y) in enumerate(((-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45))):
        body.append(segment("arm", sd, (0, 0, 0), (x, y, 0.02), 0.03, cap=False, segments=6))
        body.append(cylinder("motor", sd, loc=(x, y, 0.05), radius=0.06, depth=0.08, segments=8))
        rp = empty(f"Rotor{i+1}", loc=(x, y, 0.1), parent=root)
        join(f"Rotor{i+1}Mesh", [box("b1", material("shadow"), loc=(0, 0, 0), size=(0.5, 0.05, 0.01)), box("b2", material("shadow"), loc=(0, 0, 0), size=(0.05, 0.5, 0.01))], parent=rp)
    join("DroneBody", body, parent=root)
    return root


def wheelbarrow():
    C.reset_scene()
    root = empty("Wheelbarrow")
    join("WheelbarrowMesh", [
        box("tub", material("tractor_green"), loc=(0, 0, 0.45), size=(0.8, 1.0, 0.4)),
        box("tub_in", material("soil"), loc=(0, 0, 0.6), size=(0.7, 0.9, 0.1)),
        cylinder("wheel", material("tire"), loc=(0, F * 0.6, 0.25), radius=0.25, depth=0.1, rot=(0, 90, 0), segments=12),
        box("handleL", material("wood"), loc=(-0.3, 0.6, 0.5), size=(0.05, 0.9, 0.05)),
        box("handleR", material("wood"), loc=(0.3, 0.6, 0.5), size=(0.05, 0.9, 0.05)),
        box("legL", material("steel_dark"), loc=(-0.3, 0.3, 0.12), size=(0.05, 0.05, 0.25)),
        box("legR", material("steel_dark"), loc=(0.3, 0.3, 0.12), size=(0.05, 0.05, 0.25)),
    ], parent=root)
    return root


ASSETS = {
    "tree": tree_round, "pine": tree_pine, "bush": bush, "rock": rock, "flowers": flower_patch, "hay_bale": hay_bale,
    "fence": fence, "barn": barn, "silo": silo, "windmill": windmill, "smartfarm": greenhouse, "market": market_stall,
    "well": well, "sign": sign_post, "coop": coop, "trough": trough,
    "plot": soil_plot, "crops": crops,
    "cow": cow, "chicken": chicken, "sheep": sheep,
    "tractor": tractor, "drone": drone, "wheelbarrow": wheelbarrow,
}

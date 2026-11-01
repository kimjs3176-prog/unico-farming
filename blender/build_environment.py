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
from common import bevel, box, cone, cylinder, displace_noise, empty, join, material, organic, plane, prism, segment, shade_smooth, sphere, subdivide, torus  # noqa: E402

F = -1


# ---------------------------------------------------------------- 자연물
def tree_round():
    C.reset_scene()
    root = empty("Tree")
    trunk = join("Trunk", [
        cylinder("t", material("wood_dark"), loc=(0, 0, 0.7), radius=0.17, depth=1.4, radius2=0.11, segments=14),
        cylinder("root1", material("wood_dark"), loc=(0.12, 0.05, 0.08), radius=0.1, depth=0.25, rot=(0, 25, 0), segments=8),
        cylinder("root2", material("wood_dark"), loc=(-0.1, -0.1, 0.08), radius=0.09, depth=0.25, rot=(15, -25, 0), segments=8),
    ], parent=root)
    shade_smooth(trunk, 40)
    g = material("grass_dark", roughness=0.9)
    canopy = organic("Canopy", [
        sphere("c1", g, loc=(0, 0, 1.85), radius=0.9, segments=16, rings=12),
        sphere("c2", g, loc=(0.5, 0.25, 2.2), radius=0.65, segments=14, rings=10),
        sphere("c3", g, loc=(-0.45, -0.3, 2.1), radius=0.6, segments=14, rings=10),
        sphere("c4", g, loc=(0.05, -0.15, 2.65), radius=0.55, segments=14, rings=10),
        sphere("c5", g, loc=(-0.1, 0.5, 2.4), radius=0.5, segments=14, rings=10),
    ], g, voxel=0.09, smooth_iters=3, decimate=0.6, parent=root)
    displace_noise(canopy, strength=0.16, scale=0.8, seed=1)
    return root

def tree_pine():
    C.reset_scene()
    root = empty("Pine")
    trunk = join("Trunk", [cylinder("t", material("wood_dark"), loc=(0, 0, 0.6), radius=0.15, depth=1.2, radius2=0.1, segments=12)], parent=root)
    shade_smooth(trunk, 40)
    g = material("pine", "#4f9a4a", roughness=0.9)
    canopy = organic("Canopy", [
        cone("a", g, loc=(0, 0, 1.35), radius=0.95, depth=1.3, segments=14),
        cone("b", g, loc=(0, 0, 2.05), radius=0.72, depth=1.2, segments=14),
        cone("c", g, loc=(0, 0, 2.7), radius=0.48, depth=1.0, segments=14),
    ], g, voxel=0.07, smooth_iters=2, decimate=0.6, parent=root)
    displace_noise(canopy, strength=0.1, scale=0.5, seed=2)
    return root

def bush():
    C.reset_scene()
    root = empty("Bush")
    g = material("grass_dark", roughness=0.9)
    b = organic("BushMesh", [
        sphere("a", g, loc=(0, 0, 0.38), radius=0.48, segments=14, rings=10),
        sphere("b", g, loc=(0.38, 0.1, 0.3), radius=0.34, segments=12, rings=8),
        sphere("c", g, loc=(-0.32, -0.18, 0.28), radius=0.32, segments=12, rings=8),
        sphere("d", g, loc=(0.05, 0.35, 0.3), radius=0.3, segments=12, rings=8),
    ], g, voxel=0.05, smooth_iters=3, decimate=0.6, parent=root)
    displace_noise(b, strength=0.08, scale=0.4, seed=3)
    return root

def rock():
    C.reset_scene()
    root = empty("Rock")
    st = material("stone", roughness=0.95)
    r = organic("RockMesh", [
        sphere("a", st, loc=(0, 0, 0.28), radius=0.42, scale=(1.2, 0.9, 0.7), segments=12, rings=8),
        sphere("b", st, loc=(0.32, 0.2, 0.2), radius=0.26, scale=(1, 1, 0.75), segments=10, rings=6),
        sphere("c", st, loc=(-0.25, -0.15, 0.18), radius=0.22, segments=10, rings=6),
    ], st, voxel=0.05, smooth_iters=1, decimate=0.5, parent=root)
    displace_noise(r, strength=0.07, scale=0.35, seed=4)
    shade_smooth(r, angle_deg=35)
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
    w = material("wood", roughness=0.85)
    parts = []
    for x in (-1.0, 1.0):
        parts.append(box("post", w, loc=(x, 0, 0.5), size=(0.14, 0.14, 1.0)))
        parts.append(cone("cap", w, loc=(x, 0, 1.06), radius=0.1, depth=0.12, segments=4, smooth=False))
    for z in (0.4, 0.8):
        parts.append(box("rail", material("wood_dark", roughness=0.85), loc=(0, 0, z), size=(2.0, 0.08, 0.12)))
    f = join("FenceMesh", parts, parent=root)
    bevel(f, 0.015, 2)
    return root

def barn():
    C.reset_scene()
    root = empty("Barn")
    red, roof, cream, wd = material("barn_red", roughness=0.8), material("barn_roof", roughness=0.7), material("cream", roughness=0.8), material("wood_dark")
    body = [box("base", red, loc=(0, 0, 1.4), size=(5.0, 6.0, 2.8))]
    # 판자 홈 (정면/측면 얇은 어두운 줄)
    for i in range(1, 10):
        body.append(box("plank", material("barn_red_dark", "#b8433f"), loc=(-2.5 + i * 0.5, F * 3.001, 1.4), size=(0.03, 0.02, 2.8)))
    for sx in (-1, 1):
        for i in range(1, 12):
            body.append(box("plank_s", material("barn_red_dark", "#b8433f"), loc=(sx * 2.501, -3 + i * 0.5, 1.4), size=(0.02, 0.03, 2.8)))
    base = join("BarnBody", body, parent=root)
    bevel(base, 0.04, 2)
    roof_parts = [
        prism("roof", roof, loc=(0, 0, 2.8), width=5.8, depth=6.8, height=2.0),
        box("ridge", wd, loc=(0, 0, 4.8), size=(0.2, 7.0, 0.14)),
        box("vane_post", material("steel_dark"), loc=(0, -2.2, 5.3), size=(0.05, 0.05, 0.9)),
        cone("vane", material("steel_dark"), loc=(0.2, -2.2, 5.6), radius=0.12, depth=0.5, rot=(0, 90, 0), segments=4, smooth=False),
    ]
    rf = join("BarnRoof", roof_parts, parent=root)
    bevel(rf, 0.03, 2)
    detail = [
        box("trim", cream, loc=(0, F * 3.0, 0.1), size=(5.2, 0.08, 0.2)),
        box("door", wd, loc=(0, F * 3.05, 1.0), size=(1.9, 0.1, 2.0)),
        box("door_frame_l", cream, loc=(-1.0, F * 3.08, 1.0), size=(0.12, 0.08, 2.1)),
        box("door_frame_r", cream, loc=(1.0, F * 3.08, 1.0), size=(0.12, 0.08, 2.1)),
        box("door_frame_t", cream, loc=(0, F * 3.08, 2.05), size=(2.1, 0.08, 0.12)),
        box("door_x1", cream, loc=(0, F * 3.1, 1.0), size=(0.12, 0.04, 2.3), rot=(0, 0, 42)),
        box("door_x2", cream, loc=(0, F * 3.1, 1.0), size=(0.12, 0.04, 2.3), rot=(0, 0, -42)),
        box("loft", wd, loc=(0, F * 3.03, 3.3), size=(1.0, 0.1, 0.9)),
        box("loft_frame", cream, loc=(0, F * 3.06, 3.3), size=(1.15, 0.06, 1.05)),
        box("loft_in", wd, loc=(0, F * 3.09, 3.3), size=(0.95, 0.04, 0.85)),
    ]
    for sx in (-1, 1):
        detail.append(box("window", cream, loc=(sx * 1.7, F * 3.03, 1.8), size=(0.9, 0.1, 0.9)))
        detail.append(box("window_glass", material("glass", alpha=0.75, roughness=0.1), loc=(sx * 1.7, F * 3.09, 1.8), size=(0.7, 0.04, 0.7)))
        detail.append(box("window_x", cream, loc=(sx * 1.7, F * 3.11, 1.8), size=(0.05, 0.03, 0.75)))
        detail.append(box("window_y", cream, loc=(sx * 1.7, F * 3.11, 1.8), size=(0.75, 0.03, 0.05)))
    d = join("BarnDetail", detail, parent=root)
    bevel(d, 0.012, 1)
    return root

def silo():
    C.reset_scene()
    root = empty("Silo")
    parts = [
        cylinder("body", material("cream", roughness=0.6), loc=(0, 0, 2.0), radius=1.0, depth=4.0, segments=32),
        sphere("dome", material("barn_red", roughness=0.6), loc=(0, 0, 4.0), radius=1.05, scale=(1, 1, 0.6), segments=32, rings=14),
        cylinder("band1", material("steel", roughness=0.4, metallic=0.5), loc=(0, 0, 1.0), radius=1.03, depth=0.12, segments=32),
        cylinder("band2", material("steel", roughness=0.4, metallic=0.5), loc=(0, 0, 2.5), radius=1.03, depth=0.12, segments=32),
        cylinder("band3", material("steel", roughness=0.4, metallic=0.5), loc=(0, 0, 3.9), radius=1.03, depth=0.12, segments=32),
        cylinder("cap", material("steel_dark"), loc=(0, 0, 4.66), radius=0.18, depth=0.2, segments=12),
    ]
    for i in range(8):
        parts.append(box("rung", material("steel_dark"), loc=(0, 1.08, 0.5 + i * 0.5), size=(0.4, 0.05, 0.05)))
    parts.append(box("rail_l", material("steel_dark"), loc=(-0.2, 1.08, 2.2), size=(0.05, 0.05, 4.0)))
    parts.append(box("rail_r", material("steel_dark"), loc=(0.2, 1.08, 2.2), size=(0.05, 0.05, 4.0)))
    m = join("SiloMesh", parts, parent=root)
    bevel(m, 0.02, 2)
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
    film = material("film", alpha=0.42, roughness=0.15)
    frame = material("steel", roughness=0.35, metallic=0.5)
    parts = []
    for i, y in enumerate((-3.2, 0.0, 3.2)):
        parts.append(cylinder(f"tunnel{i}", film, loc=(0, y, 0.0), radius=1.4, depth=8.0, rot=(0, 90, 0), segments=24))
        for x in (-3.9, -2.6, -1.3, 0.0, 1.3, 2.6, 3.9):
            parts.append(torus(f"rib{i}", frame, loc=(x, y, 0), major=1.42, minor=0.035, rot=(0, 90, 0), segments=28, ring=8))
        parts.append(box("ridge", frame, loc=(0, y, 1.42), size=(8.0, 0.06, 0.06)))
        parts.append(box("side_a", frame, loc=(0, y - 1.3, 0.55), size=(8.0, 0.05, 0.05)))
        parts.append(box("side_b", frame, loc=(0, y + 1.3, 0.55), size=(8.0, 0.05, 0.05)))
        parts.append(box("door", material("steel_dark"), loc=(4.0, y, 0.6), size=(0.05, 0.9, 1.2)))
        parts.append(box("door_frame", frame, loc=(4.01, y, 0.6), size=(0.06, 1.0, 1.3)))
    parts.append(box("floor", material("soil"), loc=(0, 0, -0.02), size=(8.4, 9.2, 0.04)))
    # 내부 작물 베드 (초록 줄)
    for i, y in enumerate((-3.2, 0.0, 3.2)):
        for dy in (-0.6, 0.0, 0.6):
            parts.append(box("bed", material("leaf", roughness=0.9), loc=(0, y + dy, 0.18), size=(7.4, 0.35, 0.3)))
    join("Greenhouses", parts, parent=root)
    sp = [
        cylinder("pole", frame, loc=(5.0, -4.5, 1.2), radius=0.05, depth=2.4, segments=10),
        box("sensor", material("white", roughness=0.4), loc=(5.0, -4.5, 2.3), size=(0.3, 0.3, 0.4)),
        sphere("led", material("tomato", emission=2.0), loc=(5.0, -4.65, 2.3), radius=0.05, segments=10, rings=8),
        segment("antenna", material("steel_dark"), (5.0, -4.5, 2.5), (5.0, -4.5, 3.1), 0.015, cap=False, segments=8),
        sphere("ant_tip", material("tomato", emission=2.0), loc=(5.0, -4.5, 3.12), radius=0.04, segments=10, rings=8),
        box("panel", material("steel_dark"), loc=(5.16, -4.5, 1.5), size=(0.04, 0.3, 0.4)),
    ]
    sen = join("SensorPole", sp, parent=root)
    bevel(sen, 0.015, 2)
    solar = [
        box("stand", frame, loc=(5.5, 1.0, 0.5), size=(0.1, 0.1, 1.0)),
        box("panel", material("solar", roughness=0.15, metallic=0.4), loc=(5.5, 1.0, 1.1), size=(2.2, 1.4, 0.06), rot=(0, -30, 0)),
    ]
    for i in range(1, 4):
        solar.append(box("grid_x", material("steel"), loc=(5.5, 1.0 - 0.7 + i * 0.35, 1.135), size=(2.25, 0.02, 0.02), rot=(0, -30, 0)))
    for i in range(1, 6):
        solar.append(box("grid_y", material("steel"), loc=(5.5 - 1.1 + i * 0.366, 1.0, 1.135 + (1.1 - i * 0.366) * 0.0), size=(0.02, 1.45, 0.02), rot=(0, -30, 0)))
    so = join("SolarPanel", solar, parent=root)
    bevel(so, 0.01, 1)
    tank = [
        cylinder("tank", material("water_tank", "#5fb8e3", alpha=0.9, roughness=0.2), loc=(5.5, 4.0, 1.0), radius=0.7, depth=1.6, segments=28),
        cylinder("lid", frame, loc=(5.5, 4.0, 1.82), radius=0.72, depth=0.08, segments=28),
        segment("pipe", frame, (4.9, 4.0, 0.3), (4.3, 3.2, 0.3), 0.05, cap=False, segments=8),
        torus("band", frame, loc=(5.5, 4.0, 0.6), major=0.71, minor=0.025, segments=28),
    ]
    tk = join("WaterTank", tank, parent=root)
    bevel(tk, 0.02, 2)
    return root

def market_stall():
    C.reset_scene()
    root = empty("Market")
    w, wd = material("wood", roughness=0.8), material("wood_dark", roughness=0.8)
    parts = [
        box("counter", w, loc=(0, 0, 0.5), size=(3.0, 1.2, 1.0)),
        box("counter_top", wd, loc=(0, 0, 1.02), size=(3.2, 1.4, 0.08)),
        box("skirt", wd, loc=(0, F * 0.61, 0.5), size=(3.0, 0.02, 0.9)),
    ]
    for x in (-1.4, 1.4):
        parts.append(cylinder("pole", wd, loc=(x, 0.5, 1.4), radius=0.06, depth=2.8, segments=12))
    for i in range(6):
        c = material("awning_red", roughness=0.7) if i % 2 == 0 else material("awning_white", roughness=0.7)
        parts.append(box("awning", c, loc=(-1.5 + 0.3 + i * 0.52, 0.0, 2.75), size=(0.52, 1.9, 0.06), rot=(12, 0, 0)))
        parts.append(cylinder("scallop", c, loc=(-1.5 + 0.3 + i * 0.52, F * 0.93, 2.55), radius=0.26, depth=0.06, rot=(90, 0, 0), segments=16))
    for i, col in enumerate(("tomato", "carrot", "corn", "cabbage")):
        x = -1.1 + i * 0.72
        parts.append(box("crate", wd, loc=(x, -0.2, 1.17), size=(0.6, 0.6, 0.25)))
        for j in range(3):
            for k in range(2):
                parts.append(sphere("goods", material(col, roughness=0.5), loc=(x - 0.18 + j * 0.18, -0.32 + k * 0.24, 1.33), radius=0.1, segments=12, rings=8))
    parts.append(box("sign", material("cream"), loc=(0, 0.55, 2.2), size=(2.0, 0.06, 0.5)))
    parts.append(box("sign_frame", wd, loc=(0, 0.58, 2.2), size=(2.1, 0.04, 0.6)))
    m = join("MarketMesh", parts, parent=root)
    bevel(m, 0.02, 2)
    return root

def well():
    C.reset_scene()
    root = empty("Well")
    st = material("stone", roughness=0.95)
    parts = [cylinder("wall", st, loc=(0, 0, 0.45), radius=0.7, depth=0.9, segments=24)]
    for i in range(14):  # 돌 블록
        a = math.radians(i * 360 / 14)
        parts.append(sphere("stone", material("stone2", "#8f9194", roughness=0.95), loc=(math.cos(a) * 0.68, math.sin(a) * 0.68, 0.3 + (i % 2) * 0.35), radius=0.17, scale=(1, 1, 0.8), segments=10, rings=6))
    parts += [
        cylinder("water", material("water", roughness=0.1), loc=(0, 0, 0.6), radius=0.6, depth=0.1, segments=24),
        box("post1", material("wood"), loc=(-0.6, 0, 1.3), size=(0.12, 0.12, 1.6)),
        box("post2", material("wood"), loc=(0.6, 0, 1.3), size=(0.12, 0.12, 1.6)),
        prism("roof", material("barn_roof"), loc=(0, 0, 2.05), width=1.9, depth=1.7, height=0.55),
        cylinder("axle", material("wood_dark"), loc=(0, 0, 1.7), radius=0.06, depth=1.3, rot=(0, 90, 0), segments=10),
        cylinder("crank", material("steel_dark"), loc=(0.75, 0, 1.75), radius=0.03, depth=0.3, rot=(90, 0, 0), segments=8),
        cylinder("bucket", material("steel", metallic=0.4, roughness=0.4), loc=(0, 0, 1.0), radius=0.15, depth=0.25, segments=14),
        segment("rope", material("hay_dark"), (0, 0, 1.7), (0, 0, 1.12), 0.012, cap=False),
    ]
    m = join("WellMesh", parts, parent=root)
    bevel(m, 0.02, 2)
    return root

def sign_post():
    C.reset_scene()
    root = empty("Sign")
    m = join("SignMesh", [
        box("post", material("wood"), loc=(0, 0, 0.7), size=(0.12, 0.12, 1.4)),
        box("board", material("cream"), loc=(0, F * 0.08, 1.2), size=(1.2, 0.06, 0.5)),
        box("board2", material("hay"), loc=(0, F * 0.08, 0.75), size=(0.9, 0.06, 0.35), rot=(0, 0, -8)),
    ], parent=root)
    bevel(m, 0.02, 2)
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
    m = join("TroughMesh", [
        box("base", material("wood_dark"), loc=(0, 0, 0.25), size=(1.6, 0.6, 0.5)),
        box("inner", material("hay"), loc=(0, 0, 0.47), size=(1.4, 0.45, 0.1)),
    ], parent=root)
    bevel(m, 0.02, 2)
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
    subdivide(obj_by("BodyMesh"), 1)
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
    tb = join("TractorBody", body, parent=root)
    bevel(tb, 0.03, 2)

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
    m = join("WheelbarrowMesh", [
        box("tub", material("tractor_green"), loc=(0, 0, 0.45), size=(0.8, 1.0, 0.4)),
        box("tub_in", material("soil"), loc=(0, 0, 0.6), size=(0.7, 0.9, 0.1)),
        cylinder("wheel", material("tire"), loc=(0, F * 0.6, 0.25), radius=0.25, depth=0.1, rot=(0, 90, 0), segments=12),
        box("handleL", material("wood"), loc=(-0.3, 0.6, 0.5), size=(0.05, 0.9, 0.05)),
        box("handleR", material("wood"), loc=(0.3, 0.6, 0.5), size=(0.05, 0.9, 0.05)),
        box("legL", material("steel_dark"), loc=(-0.3, 0.3, 0.12), size=(0.05, 0.05, 0.25)),
        box("legR", material("steel_dark"), loc=(0.3, 0.3, 0.12), size=(0.05, 0.05, 0.25)),
    ], parent=root)
    bevel(m, 0.02, 2)
    return root


def obj_by(name):
    return bpy.context.scene.objects[name]


def grass_tuft():
    """잔디 포기 (게임에서 수천 개 인스턴싱)"""
    C.reset_scene()
    root = empty("Grass")
    import random
    rnd = random.Random(11)
    parts = []
    for i in range(6):
        a = rnd.uniform(0, 6.28)
        r = rnd.uniform(0.0, 0.12)
        h = rnd.uniform(0.28, 0.5)
        col = material("grass_blade", "#7fc84f", roughness=0.9) if i % 2 else material("grass_blade2", "#9ad95a", roughness=0.9)
        parts.append(cone("blade", col, loc=(math.cos(a) * r, math.sin(a) * r, h / 2), radius=0.035, depth=h, rot=(rnd.uniform(-25, 25), rnd.uniform(-25, 25), 0), segments=5, smooth=False))
    join("GrassMesh", parts, parent=root)
    return root


def cloud():
    C.reset_scene()
    root = empty("Cloud")
    w = material("cloud", "#ffffff", roughness=1.0, emission=0.15)
    c = organic("CloudMesh", [
        sphere("a", w, loc=(0, 0, 0), radius=1.2, scale=(1.3, 1, 0.8), segments=14, rings=10),
        sphere("b", w, loc=(1.3, 0.2, 0.2), radius=0.9, segments=12, rings=8),
        sphere("c", w, loc=(-1.2, -0.1, 0.1), radius=0.85, segments=12, rings=8),
        sphere("d", w, loc=(0.3, 0.1, 0.7), radius=0.8, segments=12, rings=8),
        sphere("e", w, loc=(2.2, 0, -0.1), radius=0.6, segments=12, rings=8),
    ], w, voxel=0.12, smooth_iters=4, decimate=0.5, parent=root)
    return root


def crate():
    C.reset_scene()
    root = empty("Crate")
    w, wd = material("wood", roughness=0.85), material("wood_dark", roughness=0.85)
    parts = [box("body", w, loc=(0, 0, 0.3), size=(0.6, 0.6, 0.6))]
    for z in (0.05, 0.55):
        for sx in (-1, 1):
            parts.append(box("rim_x", wd, loc=(0, sx * 0.31, z), size=(0.64, 0.04, 0.08)))
            parts.append(box("rim_y", wd, loc=(sx * 0.31, 0, z), size=(0.04, 0.64, 0.08)))
    parts.append(box("diag", wd, loc=(0, -0.315, 0.3), size=(0.06, 0.02, 0.78), rot=(0, 45, 0)))
    m = join("CrateMesh", parts, parent=root)
    bevel(m, 0.015, 2)
    return root


def barrel():
    C.reset_scene()
    root = empty("Barrel")
    from mathutils import Vector
    import bmesh as _bm
    parts = [cylinder("body", material("wood", roughness=0.8), loc=(0, 0, 0.42), radius=0.3, depth=0.84, segments=20)]
    # 배불뚝이: 가운데를 부풀림
    body = parts[0]
    for v in body.data.vertices:
        k = 1 + 0.12 * (1 - ((v.co.z - 0.42) / 0.42) ** 2)
        v.co.x *= k; v.co.y *= k
    for z in (0.12, 0.42, 0.72):
        r = 0.3 * (1 + 0.12 * (1 - ((z - 0.42) / 0.42) ** 2)) + 0.012
        parts.append(torus("hoop", material("steel_dark", roughness=0.5), loc=(0, 0, z), major=r, minor=0.018, segments=24, ring=6))
    parts.append(cylinder("lid", material("wood_dark"), loc=(0, 0, 0.845), radius=0.29, depth=0.02, segments=20))
    join("BarrelMesh", parts, parent=root)
    return root


def lamp_post():
    C.reset_scene()
    root = empty("Lamp")
    dark = material("lamp_iron", "#3b3f46", roughness=0.5, metallic=0.4)
    parts = [
        cylinder("base", dark, loc=(0, 0, 0.1), radius=0.16, depth=0.2, segments=12),
        cylinder("pole", dark, loc=(0, 0, 1.3), radius=0.05, depth=2.4, segments=10),
        segment("arm", dark, (0, 0, 2.3), (0, -0.35, 2.45), 0.03, cap=False, segments=8),
        cylinder("cap", dark, loc=(0, -0.38, 2.62), radius=0.2, depth=0.06, radius2=0.04, segments=12),
    ]
    join("LampPost", parts, parent=root)
    join("LampGlow", [sphere("bulb", material("lamp_glow", "#ffd77a", emission=1.0, roughness=0.3), loc=(0, -0.38, 2.45), radius=0.14, scale=(1, 1, 1.2), segments=14, rings=10)], parent=root)
    return root


def bench():
    C.reset_scene()
    root = empty("Bench")
    w, dark = material("wood", roughness=0.8), material("lamp_iron", "#3b3f46", roughness=0.5, metallic=0.4)
    parts = []
    for i in range(3):
        parts.append(box("seat", w, loc=(0, -0.12 + i * 0.13, 0.45), size=(1.4, 0.11, 0.05)))
    for i in range(2):
        parts.append(box("back", w, loc=(0, 0.2, 0.68 + i * 0.16), size=(1.4, 0.04, 0.11), rot=(-10, 0, 0)))
    for sx in (-1, 1):
        parts.append(box("leg", dark, loc=(sx * 0.6, 0.0, 0.22), size=(0.06, 0.4, 0.44)))
        parts.append(box("back_leg", dark, loc=(sx * 0.6, 0.21, 0.6), size=(0.05, 0.05, 0.5), rot=(-10, 0, 0)))
    m = join("BenchMesh", parts, parent=root)
    bevel(m, 0.012, 2)
    return root


def mailbox():
    C.reset_scene()
    root = empty("Mailbox")
    parts = [
        box("post", material("wood"), loc=(0, 0, 0.5), size=(0.1, 0.1, 1.0)),
        box("box", material("mail_red", "#e35d5d", roughness=0.5), loc=(0, -0.05, 1.08), size=(0.32, 0.5, 0.25)),
        cylinder("roof", material("mail_red", "#e35d5d", roughness=0.5), loc=(0, -0.05, 1.2), radius=0.16, depth=0.5, rot=(90, 0, 0), segments=16),
        box("flag", material("gold", roughness=0.4), loc=(0.18, 0.05, 1.25), size=(0.02, 0.12, 0.2)),
    ]
    m = join("MailboxMesh", parts, parent=root)
    bevel(m, 0.015, 2)
    return root


def scarecrow():
    """허수아비: 밀짚모자 + 체크 셔츠 + 짚 팔"""
    C.reset_scene()
    root = empty("Scarecrow")
    w, hay = material("wood"), material("hay", roughness=0.9)
    parts = [
        box("post", w, loc=(0, 0, 0.9), size=(0.1, 0.1, 1.8)),
        box("arm", w, loc=(0, 0, 1.35), size=(1.4, 0.08, 0.08)),
        sphere("head", material("burlap", "#d9c08a", roughness=0.95), loc=(0, 0, 1.75), radius=0.22, segments=16, rings=12),
        cylinder("brim", hay, loc=(0, 0, 1.92), radius=0.38, depth=0.03, segments=24),
        cylinder("crown", hay, loc=(0, 0, 2.02), radius=0.18, depth=0.18, segments=20),
        box("shirt", material("shirt", "#4a90d9", roughness=0.9), loc=(0, 0, 1.18), size=(0.5, 0.25, 0.5)),
        box("sleeve", material("shirt", "#4a90d9", roughness=0.9), loc=(0, 0, 1.35), size=(1.0, 0.18, 0.16)),
        box("patch", material("shirt2", "#e35d5d", roughness=0.9), loc=(0.1, -0.13, 1.1), size=(0.14, 0.02, 0.14)),
        sphere("eyeL", material("eye"), loc=(-0.08, -0.19, 1.78), radius=0.025, segments=8, rings=6),
        sphere("eyeR", material("eye"), loc=(0.08, -0.19, 1.78), radius=0.025, segments=8, rings=6),
    ]
    for sx in (-1, 1):
        parts.append(cone("straw", hay, loc=(sx * 0.75, 0, 1.35), radius=0.08, depth=0.2, rot=(0, sx * 90, 0), segments=8))
    m = join("ScarecrowMesh", parts, parent=root)
    bevel(m, 0.01, 1)
    return root


def thresher():
    """탈곡기 (발로 밟는 옛 탈곡기 느낌): 드럼 + 받침 + 짚더미"""
    C.reset_scene()
    root = empty("Thresher")
    w, wd, st = material("wood"), material("wood_dark"), material("steel", roughness=0.4, metallic=0.4)
    base = [
        box("frame", wd, loc=(0, 0, 0.35), size=(1.4, 0.8, 0.7)),
        box("hopper", w, loc=(0, -0.2, 0.8), size=(1.2, 0.5, 0.25), rot=(-20, 0, 0)),
        box("pedal", st, loc=(0.5, -0.55, 0.12), size=(0.3, 0.3, 0.05)),
        box("tray", w, loc=(0, 0.55, 0.25), size=(1.3, 0.4, 0.08)),
    ]
    b = join("ThresherBase", base, parent=root)
    bevel(b, 0.02, 2)
    drum = empty("Drum", loc=(0, -0.1, 0.78), parent=root)
    dp = [cylinder("drum", material("drum", "#c9a26b", roughness=0.7), loc=(0, 0, 0), radius=0.24, depth=1.1, rot=(0, 90, 0), segments=18)]
    for i in range(10):
        a = math.radians(i * 36)
        dp.append(box("tooth", st, loc=(0, math.cos(a) * 0.25, math.sin(a) * 0.25), size=(1.05, 0.03, 0.03), rot=(math.degrees(a), 0, 0)))
    join("DrumMesh", dp, parent=drum)
    hay = material("hay", roughness=0.9)
    pile = organic("StrawPile", [sphere("a", hay, loc=(-0.9, 0.5, 0.2), radius=0.35, scale=(1, 1, 0.6), segments=12, rings=8), sphere("b", hay, loc=(-1.2, 0.2, 0.15), radius=0.28, scale=(1, 1, 0.55), segments=12, rings=8)], hay, voxel=0.05, smooth_iters=2, decimate=0.6, parent=root)
    displace_noise(pile, 0.05, 0.2, seed=9)
    return root


def dock():
    """연못 낚시 데크"""
    C.reset_scene()
    root = empty("Dock")
    w, wd = material("wood", roughness=0.85), material("wood_dark", roughness=0.85)
    parts = []
    for i in range(7):
        parts.append(box("plank", w if i % 2 else material("wood2", "#c08a58", roughness=0.85), loc=(0, i * 0.36, 0.32), size=(1.6, 0.32, 0.06)))
    for x in (-0.75, 0.75):
        for y in (0.0, 1.2, 2.2):
            parts.append(cylinder("pile", wd, loc=(x, y, 0.05), radius=0.07, depth=0.7, segments=10))
    m = join("DockMesh", parts, parent=root)
    bevel(m, 0.012, 1)
    return root


def planter():
    C.reset_scene()
    root = empty("Planter")
    parts = [box("box", material("wood"), loc=(0, 0, 0.18), size=(1.0, 0.4, 0.36)), box("soil", material("soil"), loc=(0, 0, 0.35), size=(0.92, 0.32, 0.04))]
    import random
    rnd = random.Random(5)
    cols = ["tomato", "corn", "pink_deep", "white", "awning_red"]
    for i in range(9):
        x = -0.38 + i * 0.095
        parts.append(segment("stem", material("leaf_dark"), (x, 0, 0.35), (x, 0, 0.55 + rnd.random() * 0.12), 0.012, cap=False, segments=6))
        parts.append(sphere("bloom", material(cols[i % 5]), loc=(x, 0, 0.6 + rnd.random() * 0.1), radius=0.055, scale=(1, 1, 0.7), segments=10, rings=6))
    m = join("PlanterMesh", parts, parent=root)
    return root


def fruit_tree():
    """과일 나무 (열매는 게임에서 색을 입혀 붙임). 잎뭉치는 Canopy, 열매 소켓 Fruit0..5"""
    C.reset_scene()
    root = empty("FruitTree")
    trunk = join("Trunk", [
        cylinder("t", material("wood_dark"), loc=(0, 0, 0.6), radius=0.15, depth=1.2, radius2=0.1, segments=14),
        segment("b1", material("wood_dark"), (0, 0, 1.0), (0.4, 0.1, 1.5), 0.06, segments=8),
        segment("b2", material("wood_dark"), (0, 0, 1.0), (-0.35, -0.15, 1.45), 0.06, segments=8),
    ], parent=root)
    shade_smooth(trunk, 40)
    g = material("orchard_leaf", "#5fae4a", roughness=0.9)
    canopy = organic("Canopy", [
        sphere("c1", g, loc=(0, 0, 1.75), radius=0.8, scale=(1.15, 1.15, 0.85), segments=16, rings=12),
        sphere("c2", g, loc=(0.45, 0.2, 1.95), radius=0.55, segments=14, rings=10),
        sphere("c3", g, loc=(-0.45, -0.2, 1.9), radius=0.55, segments=14, rings=10),
    ], g, voxel=0.08, smooth_iters=3, decimate=0.6, parent=root)
    displace_noise(canopy, strength=0.12, scale=0.7, seed=6)
    sockets = [(0.75, -0.2, 1.6), (-0.7, 0.3, 1.65), (0.2, -0.78, 1.7), (-0.25, 0.75, 1.75), (0.55, 0.55, 1.95), (-0.5, -0.55, 2.0)]
    for i, p in enumerate(sockets):
        empty(f"Fruit{i}", loc=p, parent=root)
    return root


def koat_hq():
    """KOAT 본관 (기획운영본부·홍보관): 흰 벽 + 청록 유리 커튼월 + 캐노피 + 간판 자리(SignBoard)"""
    C.reset_scene()
    root = empty("KoatHQ")
    wall = material("hq_wall", "#f4f6f5", roughness=0.6)
    glass = material("hq_glass", "#7fd0d6", roughness=0.15, metallic=0.2)
    frame = material("hq_frame", "#2f6f6b", roughness=0.4, metallic=0.3)
    teal = material("teal", roughness=0.5)
    body = [
        box("main", wall, loc=(0, 0, 2.6), size=(11.0, 6.0, 5.2)),
        box("wing", wall, loc=(-4.2, 0.5, 1.6), size=(3.2, 5.2, 3.2)),
        box("roof", frame, loc=(0, 0, 5.3), size=(11.4, 6.4, 0.25)),
        box("roof_band", teal, loc=(0, F * 3.21, 5.0), size=(11.2, 0.05, 0.25)),
        box("plinth", material("stone", roughness=0.9), loc=(0, 0, 0.12), size=(11.6, 6.6, 0.24)),
    ]
    b = join("HQBody", body, parent=root)
    bevel(b, 0.04, 2)
    # 커튼월 유리 + 멀리언
    gl = [box("glass", glass, loc=(1.2, F * 3.02, 2.7), size=(7.6, 0.06, 4.2))]
    for i in range(9):
        gl.append(box("mullion", frame, loc=(1.2 - 3.8 + i * 0.95, F * 3.06, 2.7), size=(0.07, 0.06, 4.25)))
    for z in (1.3, 2.7, 4.1):
        gl.append(box("transom", frame, loc=(1.2, F * 3.06, z), size=(7.65, 0.06, 0.07)))
    join("CurtainWall", gl, parent=root)
    # 입구 캐노피 + 기둥 + 계단
    ent = [
        box("canopy", wall, loc=(1.2, F * 4.0, 3.1), size=(4.2, 2.2, 0.18)),
        box("canopy_edge", teal, loc=(1.2, F * 5.1, 3.1), size=(4.2, 0.06, 0.2)),
        cylinder("col1", frame, loc=(-0.6, F * 4.9, 1.55), radius=0.09, depth=3.1, segments=12),
        cylinder("col2", frame, loc=(3.0, F * 4.9, 1.55), radius=0.09, depth=3.1, segments=12),
        box("door", material("hq_door", "#3f8f8a", roughness=0.2, metallic=0.2), loc=(1.2, F * 3.05, 1.2), size=(2.0, 0.08, 2.4)),
        box("step1", material("stone", roughness=0.9), loc=(1.2, F * 3.6, 0.08), size=(4.4, 1.2, 0.16)),
    ]
    e = join("Entrance", ent, parent=root)
    bevel(e, 0.02, 2)
    # 간판 자리 (게임에서 글자 텍스처를 씌움)
    sign = box("SignBoard", material("hq_sign", "#ffffff", roughness=0.5), loc=(0, F * 3.08, 4.55), size=(6.0, 0.06, 0.7))
    sign.parent = root
    # 깃대 3개
    for i, x in enumerate((-5.0, -4.2, -3.4)):
        fp = [cylinder("pole", material("steel", roughness=0.3, metallic=0.6), loc=(x, F * 5.4, 3.0), radius=0.04, depth=6.0, segments=8),
              box("flag", material(["flag_a", "flag_b", "flag_c"][i], ["#30b6aa", "#ffffff", "#6dbb4f"][i], roughness=0.7), loc=(x + 0.45, F * 5.4, 5.4), size=(0.85, 0.02, 0.55))]
        join(f"Flag{i}", fp, parent=root)
    return root


def booth():
    """본부 체험 부스 (파빌리온): 지붕 색은 게임에서 본부별로 바꿈(RoofTint), 간판(SignBoard)"""
    C.reset_scene()
    root = empty("Booth")
    deck = material("booth_deck", "#d9c7a6", roughness=0.8)
    post = material("booth_post", "#fafafa", roughness=0.5)
    parts = [box("deck", deck, loc=(0, 0, 0.08), size=(4.2, 3.4, 0.16))]
    for x in (-1.9, 1.9):
        for y in (-1.5, 1.5):
            parts.append(cylinder("post", post, loc=(x, y, 1.45), radius=0.07, depth=2.7, segments=12))
    parts += [
        box("back", post, loc=(0, 1.6, 1.4), size=(3.9, 0.1, 2.6)),
        box("counter", material("wood", roughness=0.8), loc=(0, F * 0.9, 0.6), size=(2.6, 0.7, 0.9)),
        box("counter_top", post, loc=(0, F * 0.9, 1.07), size=(2.75, 0.85, 0.06)),
    ]
    b = join("BoothBase", parts, parent=root)
    bevel(b, 0.02, 2)
    roof = [prism("roof", material("booth_roof", "#ffffff", roughness=0.6), loc=(0, 0, 2.8), width=4.8, depth=3.9, height=0.8),
            box("trim", material("booth_roof", "#ffffff", roughness=0.6), loc=(0, F * 1.95, 2.75), size=(4.8, 0.06, 0.18))]
    r = join("RoofTint", roof, parent=root)
    bevel(r, 0.02, 1)
    sign = box("SignBoard", material("booth_sign", "#ffffff", roughness=0.5), loc=(0, F * 1.98, 2.35), size=(3.2, 0.05, 0.62))
    sign.parent = root
    return root


ASSETS = {
    "koat_hq": koat_hq, "booth": booth,
    "crate": crate, "barrel": barrel, "lamp": lamp_post, "bench": bench, "mailbox": mailbox, "scarecrow": scarecrow,
    "thresher": thresher, "dock": dock, "planter": planter, "fruit_tree": fruit_tree,
    "grass_tuft": grass_tuft, "cloud": cloud,
    "tree": tree_round, "pine": tree_pine, "bush": bush, "rock": rock, "flowers": flower_patch, "hay_bale": hay_bale,
    "fence": fence, "barn": barn, "silo": silo, "windmill": windmill, "smartfarm": greenhouse, "market": market_stall,
    "well": well, "sign": sign_post, "coop": coop, "trough": trough,
    "plot": soil_plot, "crops": crops,
    "cow": cow, "chicken": chicken, "sheep": sheep,
    "tractor": tractor, "drone": drone, "wheelbarrow": wheelbarrow,
}

"""
[실험용] 프리미티브 조합 로우폴리 유니코 - 원본과 인상이 달라 게임에는 사용하지 않음 (build_character_relief.py 가 기본)
유니코(UNICO) 캐릭터 - 한국농업기술진흥원 마스코트를 캐주얼 3D로 재구성
- 흰 몸통 + 청록(teal) 갈기/꼬리/발굽 + 금색 뿔 + 분홍 볼 + 새싹 잎
- 애니메이션용 피벗(Empty) 계층:
    Unico > Hips > Body, LegL, LegR, Tail
                 > Chest > Neck, Head, ArmL, ArmR
- 액세서리(Acc_*)는 게임에서 가시성 토글: 밀짚모자, 안전모, 안전조끼, 앞치마, 새싹잎, 물뿌리개, 괭이
전방은 Blender -Y (glTF 변환 후 +Z).  단위: m, 전체 키 약 2.0
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import common as C  # noqa: E402
from common import box, cone, cylinder, empty, join, material, segment, sphere, torus  # noqa: E402

F = -1  # 정면(-Y) 부호

# 월드 기준 주요 높이
HIP_Z = 0.55
CHEST_Z = 1.20
HEAD_Z = 1.75


def obj(name):
    return bpy.context.scene.objects[name]


def build_unico(with_accessories=True):
    C.reset_scene()
    white, muzzle, teal, teal_d = material("white"), material("muzzle"), material("teal"), material("teal_dark")
    pink, gold, orange, eye = material("pink"), material("gold"), material("orange"), material("eye")
    leaf, leaf_d = material("leaf"), material("leaf_dark")

    root = empty("Unico")
    hips = empty("Hips", loc=(0, 0, HIP_Z), parent=root)
    chest = empty("Chest", loc=(0, 0, CHEST_Z - HIP_Z), parent=hips)
    Z = lambda z: z - HIP_Z  # 월드 z -> hips 로컬
    ZC = lambda z: z - CHEST_Z  # 월드 z -> chest 로컬

    # ---------------- 몸통: 세로로 긴 콩 모양 (아랫배가 살짝 앞으로) ----------------
    join("Body", [
        sphere("torso", white, loc=(0, 0.0, Z(1.00)), radius=0.36, scale=(1.0, 0.90, 1.55), segments=26, rings=20),
        sphere("belly", white, loc=(0, F * 0.06, Z(0.78)), radius=0.35, scale=(1.02, 0.98, 1.05), segments=26, rings=18),
        sphere("belly_shade", muzzle, loc=(0, F * 0.20, Z(0.82)), radius=0.26, scale=(0.80, 0.55, 1.15), segments=20, rings=12),
    ], parent=hips)

    # ---------------- 다리: 짧고 통통, 청록 발굽 ----------------
    for side, sx in (("L", -1), ("R", 1)):
        piv = empty(f"Leg{side}", loc=(sx * 0.15, 0.0, 0.0), parent=hips)
        join(f"LegMesh{side}", [
            segment("leg", white, (0, 0, 0.04), (0, 0, Z(0.14)), 0.125),
            cylinder("hoof", teal, loc=(0, 0, Z(0.07)), radius=0.145, depth=0.14, scale=(1, 1.1, 1)),
        ], parent=piv)

    # ---------------- 목: 몸통에서 앞·위로 이어져 머리와 합쳐짐 ----------------
    segment("NeckMesh", white, (0, F * 0.02, ZC(1.25)), (0, F * 0.14, ZC(1.80)), 0.21, parent=chest)

    # ---------------- 팔: 가늘고 팔꿈치가 꺾임, 손(발굽)은 청록 ----------------
    for side, sx in (("L", -1), ("R", 1)):
        piv = empty(f"Arm{side}", loc=(sx * 0.27, F * 0.04, ZC(1.34)), parent=chest)
        elbow = (sx * 0.14, F * 0.06, -0.24)
        hand = (sx * 0.08, F * 0.30, -0.36)
        join(f"ArmMesh{side}", [
            sphere("shoulder", white, loc=(0, 0, 0), radius=0.10, segments=12, rings=8),
            segment("upper", white, (0, 0, 0), elbow, 0.085),
            sphere("elbow", white, loc=elbow, radius=0.085, segments=12, rings=8),
            segment("fore", white, elbow, hand, 0.08),
            sphere("hoof", teal, loc=(hand[0], hand[1] - F * -0.02, hand[2] - 0.01), radius=0.105, scale=(1, 1.1, 0.9), segments=14, rings=10),
        ], parent=piv)

    # ---------------- 머리: 말처럼 앞으로 길게 (두개골 + 주둥이 + 턱) ----------------
    head = empty("Head", loc=(0, F * 0.10, ZC(HEAD_Z)), parent=chest)
    H = lambda z: z - HEAD_Z
    p = []
    p.append(sphere("skull", white, loc=(0, 0.02, H(1.98)), radius=0.36, scale=(1.0, 1.04, 0.94), segments=30, rings=20))
    p.append(sphere("muzzle", white, loc=(0, F * 0.28, H(1.80)), radius=0.26, scale=(0.95, 1.05, 0.92), segments=24, rings=16))
    p.append(sphere("jaw", white, loc=(0, F * 0.18, H(1.70)), radius=0.26, scale=(1.0, 1.0, 0.80), segments=22, rings=14))
    p.append(sphere("muzzle_shade", pink, loc=(0, F * 0.40, H(1.77)), radius=0.21, scale=(0.9, 0.75, 0.85), segments=20, rings=12))
    for sx in (-1, 1):  # 콧구멍
        p.append(sphere("nostril", eye, loc=(sx * 0.07, F * 0.57, H(1.80)), radius=0.022, segments=8, rings=6))
    p.append(segment("mouth", eye, (-0.03, F * 0.55, H(1.68)), (0.08, F * 0.52, H(1.695)), 0.012))
    for sx in (-1, 1):  # 눈 (두개골 앞쪽, 주둥이 시작점 위)
        p.append(sphere("eye", eye, loc=(sx * 0.15, F * 0.29, H(1.97)), radius=0.06, segments=12, rings=8))
        p.append(sphere("eye_hl", white, loc=(sx * 0.15 + 0.022, F * 0.342, H(1.995)), radius=0.019, segments=8, rings=6))
    for sx in (-1, 1):  # 볼터치
        p.append(sphere("cheek", pink, loc=(sx * 0.28, F * 0.20, H(1.82)), radius=0.085, scale=(1, 0.5, 0.65), segments=12, rings=8))
    for sx in (-1, 1):  # 귀: 작고 둥근 잎 모양
        p.append(sphere("ear", white, loc=(sx * 0.22, 0.10, H(2.33)), radius=0.085, scale=(0.75, 0.6, 1.5), rot=(0, sx * 28, 0), segments=12, rings=8))
        p.append(sphere("ear_in", pink, loc=(sx * 0.215, 0.07, H(2.33)), radius=0.05, scale=(0.6, 0.5, 1.2), rot=(0, sx * 28, 0), segments=10, rings=6))
    # 뿔: 이마 위, 위·앞 방향 금색 원뿔 + 주황 띠
    p.append(cone("horn", gold, loc=(0, F * 0.20, H(2.42)), radius=0.08, depth=0.40, rot=(F * -18, 0, 0), segments=12))
    p.append(torus("horn_ring", orange, loc=(0, F * 0.21, H(2.35)), major=0.066, minor=0.013, rot=(F * -18, 0, 0)))
    # 갈기: 정수리에서 목 뒤로 흐르는 청록 스캘럽 (머리에 납작하게 붙임)
    mane = [
        ((0.0, F * -0.02, H(2.33)), 0.13), ((0.0, 0.16, H(2.30)), 0.14), ((0.0, 0.32, H(2.16)), 0.14),
        ((0.0, 0.40, H(1.98)), 0.135), ((0.0, 0.38, H(1.80)), 0.125), ((0.0, 0.30, H(1.64)), 0.115),
        ((0.0, 0.22, H(1.50)), 0.10),
    ]
    for i, (loc, r) in enumerate(mane):
        p.append(sphere("mane", teal if i % 2 == 0 else teal_d, loc=loc, radius=r, scale=(1.05, 0.85, 1.0), segments=14, rings=10))
    p.append(sphere("forelock", teal, loc=(0.10, F * 0.30, H(2.26)), radius=0.085, scale=(1, 0.8, 0.7), segments=12, rings=8))
    join("HeadMesh", p, parent=head)

    # ---------------- 꼬리: 엉덩이에서 뒤로 나가 위로 말리는 청록 뭉치 ----------------
    tail = empty("Tail", loc=(0, 0.30, Z(0.78)), parent=hips)
    tp = [((0, 0.12, -0.02), 0.16), ((0, 0.30, 0.06), 0.15), ((0, 0.42, 0.22), 0.13), ((0, 0.46, 0.40), 0.10)]
    join("TailMesh", [sphere("tail", teal if i % 2 == 0 else teal_d, loc=l, radius=r, scale=(0.55, 1.1, 1.0), segments=14, rings=10) for i, (l, r) in enumerate(tp)], parent=tail)

    if not with_accessories:
        return root

    # ---------------- 액세서리 ----------------
    hay, wood_d, vest, helmet, steel, steel_d, wood, apron = (
        material("hay"), material("wood_dark"), material("vest"), material("helmet"),
        material("steel"), material("steel_dark"), material("wood"), material("apron"),
    )
    join("Acc_StrawHat", [
        cylinder("brim", hay, loc=(0, 0.04, H(2.19)), radius=0.58, depth=0.04, segments=24),
        cylinder("crown", hay, loc=(0, 0.04, H(2.31)), radius=0.32, depth=0.24, segments=20),
        torus("band", wood_d, loc=(0, 0.04, H(2.25)), major=0.325, minor=0.03),
    ], parent=head)
    join("Acc_Helmet", [
        sphere("dome", helmet, loc=(0, 0.04, H(2.18)), radius=0.42, scale=(1.0, 1.0, 0.62), segments=24, rings=12),
        box("cross_a", vest, loc=(0, F * 0.36, H(2.24)), size=(0.14, 0.04, 0.04)),
        box("cross_b", vest, loc=(0, F * 0.36, H(2.24)), size=(0.04, 0.04, 0.14)),
        cylinder("peak", helmet, loc=(0, F * 0.40, H(2.10)), radius=0.24, depth=0.03, scale=(1, 0.5, 1), segments=16),
    ], parent=head)
    join("Acc_Vest", [
        sphere("vest", vest, loc=(0, 0, Z(1.02)), radius=0.385, scale=(1.0, 0.92, 1.05), segments=24, rings=14),
        torus("stripe", white, loc=(0, 0, Z(0.94)), major=0.37, minor=0.02, scale=(1.0, 0.92, 1)),
    ], parent=hips)
    join("Acc_Apron", [
        box("apron", apron, loc=(0, F * 0.32, Z(0.82)), size=(0.42, 0.05, 0.60)),
        box("strap", apron, loc=(0, F * 0.30, Z(1.22)), size=(0.16, 0.05, 0.22)),
    ], parent=hips)
    # 왼손 새싹 (손 위치: ArmL 로컬 (-0.08, -0.30, -0.36))
    join("Acc_Leaf", [
        segment("stem", leaf_d, (-0.08, F * 0.34, -0.34), (-0.10, F * 0.42, -0.08), 0.012, cap=False),
        sphere("leafA", leaf, loc=(-0.20, F * 0.44, -0.04), radius=0.09, scale=(1.4, 0.35, 0.8), rot=(0, -30, 20), segments=12, rings=8),
        sphere("leafB", leaf_d, loc=(-0.01, F * 0.43, -0.03), radius=0.08, scale=(1.3, 0.35, 0.8), rot=(0, 30, -20), segments=12, rings=8),
    ], parent=obj("ArmL"))
    # 오른손 물뿌리개 (손 위치: ArmR 로컬 (0.08, -0.30, -0.36))
    join("Acc_WateringCan", [
        cylinder("can", steel, loc=(0.16, F * 0.42, -0.46), radius=0.13, depth=0.24, segments=16),
        cylinder("spout", steel, loc=(0.16, F * 0.60, -0.40), radius=0.03, depth=0.32, rot=(F * -70, 0, 0), segments=8),
        cylinder("spout_head", steel_d, loc=(0.16, F * 0.75, -0.32), radius=0.06, depth=0.05, rot=(F * -70, 0, 0), segments=10),
        torus("handle", steel_d, loc=(0.16, F * 0.36, -0.33), major=0.10, minor=0.02, rot=(0, 90, 0)),
    ], parent=obj("ArmR"))
    join("Acc_Hoe", [
        segment("handle", wood, (0.10, F * 0.28, 0.02), (0.14, F * 0.62, -0.90), 0.025, cap=False),
        box("blade", steel_d, loc=(0.14, F * 0.68, -0.90), size=(0.20, 0.04, 0.12), rot=(F * -25, 0, 0)),
    ], parent=obj("ArmR"))
    return root


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "public", "models")
    build_unico()
    print("unico stats", C.stats())
    print("glb bytes", C.export_glb(os.path.join(out, "unico_lowpoly.glb")))

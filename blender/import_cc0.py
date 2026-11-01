"""
UNICO Farming - CC0 외부 에셋(Quaternius) FBX → GLB 묶음 변환 (bpy)

Quaternius(https://quaternius.com) 의 CC0 팩에서 받은 FBX 파일을 게임용 GLB 로 묶는다.
- 여러 FBX 를 한 GLB(팩)에 넣고, 각 변형은 최상위 노드 이름(예: tree_1)으로 구분
- 메시 결합 + 변환 적용 + 바닥(z=0) 정렬, 애니메이션 파트(풍차 날개 등)는 'Blades' 로 분리
- 색/재질 이름 정리와 압축은 scripts/optimize-cc0.mjs 가 담당

사용:  python3 -I blender/import_cc0.py <FBX 폴더> <출력 폴더>
FBX 폴더 구조: <폴더>/bld/*.fbx, <폴더>/nature/*.fbx (docs/ASSETS_CC0.md 참고)
"""
import os
import sys

import bpy
from mathutils import Matrix, Vector

# 팩 이름 → [(노드 이름, 원본 파일, 배율, 회전(z, 라디안))]
PACKS = {
    "q_farm": [
        ("barn", "bld/Barn.fbx", 0.78, 0),
        ("big_barn", "bld/BigBarn.fbx", 0.78, 0),
        ("small_barn", "bld/SmallBarn.fbx", 0.62, 0),
        ("open_barn", "bld/OpenBarn.fbx", 0.62, 0),
        ("silo", "bld/Silo_House.fbx", 0.6, 0),
        ("silo_single", "bld/Silo.fbx", 0.6, 0),
        ("coop", "bld/ChickenCoop.fbx", 1.0, 0),
        ("well", "bld/Well.fbx", 1.15, 0),
        ("water_tower", "bld/WaterTower.fbx", 0.75, 0),
        ("windmill", "bld/Windmill.fbx", 0.72, 0),
        ("tower_windmill", "bld/TowerWindmill.fbx", 0.62, 0),
        ("fence_q", "bld/Fence.fbx", 0.37, 0),
    ],
    "q_nature": [
        *[(f"tree_{i}", f"nature/CommonTree_{i}.fbx", 1.05, 0) for i in range(1, 6)],
        *[(f"autumn_{i}", f"nature/CommonTree_Autumn_{i}.fbx", 1.05, 0) for i in range(1, 4)],
        *[(f"snowtree_{i}", f"nature/CommonTree_Snow_{i}.fbx", 1.05, 0) for i in range(1, 4)],
        *[(f"pine_{i}", f"nature/PineTree_{i}.fbx", 1.1, 0) for i in range(1, 4)],
        *[(f"snowpine_{i}", f"nature/PineTree_Snow_{i}.fbx", 1.1, 0) for i in range(1, 4)],
        *[(f"birch_{i}", f"nature/BirchTree_{i}.fbx", 1.0, 0) for i in range(1, 4)],
        *[(f"willow_{i}", f"nature/Willow_{i}.fbx", 1.1, 0) for i in range(1, 3)],
        *[(f"bush_{i}", f"nature/Bush_{i}.fbx", 0.85, 0) for i in range(1, 3)],
        *[(f"berrybush_{i}", f"nature/BushBerries_{i}.fbx", 0.85, 0) for i in range(1, 3)],
        *[(f"rock_{i}", f"nature/Rock_{i}.fbx", 1.3, 0) for i in range(1, 5)],
        *[(f"mossrock_{i}", f"nature/Rock_Moss_{i}.fbx", 1.3, 0) for i in range(1, 5)],
        *[(f"plant_{i}", f"nature/Plant_{i}.fbx", 0.8, 0) for i in range(1, 6)],
        ("flowers_q", "nature/Flowers.fbx", 1.0, 0),
        ("stump", "nature/TreeStump.fbx", 0.8, 0),
        ("stump_moss", "nature/TreeStump_Moss.fbx", 0.8, 0),
        ("log", "nature/WoodLog.fbx", 0.8, 0),
        ("log_moss", "nature/WoodLog_Moss.fbx", 0.8, 0),
        ("lilypad", "nature/Lilypad.fbx", 0.7, 0),
        ("wheat", "nature/Wheat.fbx", 0.9, 0),
        ("corn_1", "nature/Corn_1.fbx", 0.9, 0),
        ("corn_2", "nature/Corn_2.fbx", 0.9, 0),
        ("grass_q", "nature/Grass.fbx", 0.8, 0),
        ("grass_q2", "nature/Grass_2.fbx", 0.8, 0),
        ("grass_short", "nature/Grass_Short.fbx", 0.8, 0),
    ],
}

# 회전·분리해서 남길 부품 (원본 오브젝트 이름 접미사 → 게임 노드 이름)
MOVING = {"_Blades": "Blades"}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def bake(objs, scale, rot):
    """변환 적용 + 배율. 결합 대상(정적)과 움직이는 부품을 분리"""
    M = Matrix.Rotation(rot, 4, "Z") @ Matrix.Scale(scale, 4)
    static, moving = [], []
    for o in objs:
        if o.type != "MESH":
            continue
        o.data = o.data.copy()
        o.data.transform(M @ o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
        tag = next((v for k, v in MOVING.items() if o.name.endswith(k)), None)
        (moving if tag else static).append((o, tag))
    for o in objs:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    return [o for o, _ in static], moving


def join(objs, name):
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = j.data.name = name
    return j


def main(src, out):
    os.makedirs(out, exist_ok=True)
    for pack, items in PACKS.items():
        reset()
        for node, rel, scale, rot in items:
            path = os.path.join(src, rel)
            if not os.path.exists(path):
                print("  없음, 건너뜀:", rel)
                continue
            objs = import_fbx(path)
            static, moving = bake(objs, scale, rot)
            root = bpy.data.objects.new(node, None)
            bpy.context.scene.collection.objects.link(root)
            body = join(static, node + "_mesh")
            zmin = min((body.matrix_world @ Vector(c)).z for c in body.bound_box) if body else 0
            if body:
                body.data.transform(Matrix.Translation((0, 0, -zmin)))
                body.parent = root
            for o, tag in moving:
                # 회전축 = 부품 경계상자 중심(허브)
                c = sum((Vector(v) for v in o.bound_box), Vector()) / 8
                o.data.transform(Matrix.Translation(-c))
                o.location = c - Vector((0, 0, zmin))
                o.name = o.data.name = tag
                o.parent = root
            print(f"  {pack}/{node} ← {rel}")
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out, pack + ".glb"), export_format="GLB", export_yup=True,
            export_apply=True, export_animations=False, export_skins=False, export_morph=False,
            export_lights=False, export_cameras=False, export_extras=False,
        )
        print("내보냄:", pack)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

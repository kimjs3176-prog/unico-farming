"""
UNICO Farming - Blender(bpy) 공통 헬퍼
- 캐주얼(로우폴리, 단색) 스타일 에셋을 프리미티브 조합으로 생성
- 메시 레벨 변환/결합(bmesh)을 사용해 백그라운드(bpy 모듈) 환경에서도 안정적으로 동작
- glTF(.glb) 내보내기 + .blend 저장

Blender 4.2 이상 / bpy 5.x 로 테스트.  사용법은 build_all.py 참고.
"""
import math
import os

import bpy  # bpy 를 먼저 임포트해야 bmesh 모듈이 등록됨
import bmesh
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------------------
# 마스코트 원본(한국농업기술진흥원 유니코) 팔레트 - AI 파일에서 추출
# ---------------------------------------------------------------------------
PALETTE = {
    "white": "#ffffff",
    "muzzle": "#fbf6f9",
    "outline": "#231916",
    "shadow": "#dcdddd",
    "teal": "#30b6aa",
    "teal_dark": "#299d93",
    "pink": "#f1deec",
    "pink_deep": "#f3b7cf",
    "leaf": "#a9d05f",
    "leaf_dark": "#6dbb4f",
    "gold": "#fac03e",
    "orange": "#e48e00",
    "eye": "#231916",
    # 환경
    "grass": "#8ccf5a",
    "grass_dark": "#6fb84a",
    "soil": "#8a5a3c",
    "soil_dark": "#6b4430",
    "wood": "#b07a4a",
    "wood_dark": "#7a5230",
    "barn_red": "#d9534f",
    "barn_roof": "#8c3b36",
    "cream": "#f5efe0",
    "steel": "#9aa3ad",
    "steel_dark": "#5a6470",
    "tractor_green": "#8ed26c",
    "tractor_green_dark": "#5ea33f",
    "tire": "#2f3a3a",
    "hub": "#d7dbe0",
    "glass": "#bfe8ff",
    "film": "#eaf7ff",
    "water": "#6fc3e8",
    "hay": "#e8c872",
    "hay_dark": "#c9a84f",
    "stone": "#a7a9ab",
    "sky": "#bfe4ff",
    "cow_spot": "#2b2b2b",
    "udder": "#f4b6c2",
    "chicken_comb": "#e04848",
    "beak": "#f2a33a",
    "sheep_face": "#3a3a3a",
    "tomato": "#e8463b",
    "carrot": "#f28c28",
    "corn": "#f5d54a",
    "cabbage": "#9ad36b",
    "cabbage_dark": "#5fa845",
    "strawberry": "#e23b5a",
    "solar": "#1f3b73",
    "vest": "#7ac943",
    "helmet": "#f8f8f8",
    "apron": "#8a6a4e",
    "awning_red": "#e35d5d",
    "awning_white": "#fdfdfd",
}


def hex_to_rgba(h, alpha=1.0):
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    # sRGB -> Linear (Blender 머티리얼은 선형 색상 사용)
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(r), lin(g), lin(b), alpha)


_MATERIALS = {}


def reset_scene():
    """빈 씬으로 초기화 (머티리얼 캐시도 비움)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATERIALS.clear()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def material(name, color=None, roughness=0.85, metallic=0.0, alpha=1.0, emission=0.0):
    """단색 Principled 머티리얼 (캐시됨). color는 '#rrggbb' 또는 PALETTE 키."""
    if name in _MATERIALS:
        return _MATERIALS[name]
    if color is None:
        color = PALETTE[name]
    if color in PALETTE:
        color = PALETTE[color]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    rgba = hex_to_rgba(color, alpha)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = rgba
    mat.roughness = roughness
    if alpha < 1.0:
        # Blender 4.2+: surface_render_method, 이전: blend_method
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        else:
            mat.blend_method = "BLEND"
    _MATERIALS[name] = mat
    return mat


# ---------------------------------------------------------------------------
# 프리미티브 생성 (bmesh 기반, 오브젝트 로컬 좌표에 직접 변환 적용)
# ---------------------------------------------------------------------------
def _new_object(name, bm, mat, smooth, parent=None):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        if isinstance(mat, str):
            mat = material(mat)
        obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    return obj


def _xform(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    m = (
        Matrix.Translation(Vector(loc))
        @ Euler(tuple(math.radians(a) for a in rot), "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((*scale, 1.0))
    )
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def sphere(name, mat, loc=(0, 0, 0), radius=1.0, scale=(1, 1, 1), rot=(0, 0, 0), segments=18, rings=12, parent=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    _xform(bm, loc, rot, scale)
    return _new_object(name, bm, mat, smooth, parent)


def box(name, mat, loc=(0, 0, 0), size=(1, 1, 1), rot=(0, 0, 0), parent=None, smooth=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    _xform(bm, loc, rot, size)
    return _new_object(name, bm, mat, smooth, parent)


def cylinder(name, mat, loc=(0, 0, 0), radius=0.5, depth=1.0, rot=(0, 0, 0), scale=(1, 1, 1), segments=16, parent=None, smooth=True, radius2=None):
    """depth 방향은 로컬 Z. radius2 를 주면 원뿔대."""
    bm = bmesh.new()
    r2 = radius if radius2 is None else radius2
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=r2, depth=depth)
    _xform(bm, loc, rot, scale)
    obj = _new_object(name, bm, mat, smooth, parent)
    if smooth:
        # 옆면만 스무스, 캡은 플랫하게
        for p in obj.data.polygons:
            if abs(p.normal.z) > 0.99:
                p.use_smooth = False
    return obj


def cone(name, mat, loc=(0, 0, 0), radius=0.5, depth=1.0, rot=(0, 0, 0), segments=16, parent=None, smooth=True):
    return cylinder(name, mat, loc, radius, depth, rot, segments=segments, parent=parent, smooth=smooth, radius2=0.0)


def capsule(name, mat, loc=(0, 0, 0), radius=0.2, length=1.0, rot=(0, 0, 0), parent=None, segments=14):
    """로컬 Z 축 방향 캡슐 (팔/다리용)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segments, radius1=radius, radius2=radius, depth=length)
    top = bmesh.new()
    bmesh.ops.create_uvsphere(top, u_segments=segments, v_segments=8, radius=radius)
    _xform(top, (0, 0, length / 2))
    bot = bmesh.new()
    bmesh.ops.create_uvsphere(bot, u_segments=segments, v_segments=8, radius=radius)
    _xform(bot, (0, 0, -length / 2))
    for part in (top, bot):
        m = bpy.data.meshes.new("_tmp")
        part.to_mesh(m)
        part.free()
        bm.from_mesh(m)
        bpy.data.meshes.remove(m)
    _xform(bm, loc, rot)
    return _new_object(name, bm, mat, True, parent)


def torus(name, mat, loc=(0, 0, 0), major=1.0, minor=0.2, rot=(0, 0, 0), scale=(1, 1, 1), segments=20, ring=10, parent=None):
    # bmesh에 torus 오퍼레이터가 없으므로 수동 생성
    bm = bmesh.new()
    verts = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ring_v = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            x = (major + minor * math.cos(b)) * math.cos(a)
            y = (major + minor * math.cos(b)) * math.sin(a)
            z = minor * math.sin(b)
            ring_v.append(bm.verts.new((x, y, z)))
        verts.append(ring_v)
    for i in range(segments):
        for j in range(ring):
            a, b = verts[i][j], verts[i][(j + 1) % ring]
            c, d = verts[(i + 1) % segments][(j + 1) % ring], verts[(i + 1) % segments][j]
            bm.faces.new((a, b, c, d))
    _xform(bm, loc, rot, scale)
    return _new_object(name, bm, mat, True, parent)


def prism(name, mat, loc=(0, 0, 0), width=1.0, depth=1.0, height=0.5, rot=(0, 0, 0), parent=None):
    """지붕용 삼각 프리즘 (X: width, Y: depth, 꼭짓선은 Y 방향)."""
    bm = bmesh.new()
    w, d, h = width / 2, depth / 2, height
    v = [bm.verts.new(p) for p in [(-w, -d, 0), (w, -d, 0), (w, d, 0), (-w, d, 0), (0, -d, h), (0, d, h)]]
    bm.faces.new((v[0], v[1], v[2], v[3]))
    bm.faces.new((v[0], v[4], v[5], v[3]))
    bm.faces.new((v[1], v[2], v[5], v[4]))
    bm.faces.new((v[0], v[1], v[4]))
    bm.faces.new((v[3], v[5], v[2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _xform(bm, loc, rot)
    return _new_object(name, bm, mat, False, parent)


def plane(name, mat, loc=(0, 0, 0), size=(1, 1), rot=(0, 0, 0), parent=None):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    _xform(bm, loc, rot, (size[0], size[1], 1))
    return _new_object(name, bm, mat, False, parent)


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    obj.location = loc
    obj.rotation_euler = Euler(tuple(math.radians(a) for a in rot), "XYZ")
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# 결합 / 정리
# ---------------------------------------------------------------------------
def join(name, objects, parent=None, keep_pivot=(0, 0, 0)):
    """여러 메시 오브젝트를 하나로 결합 (머티리얼 슬롯 유지). 입력 오브젝트는 삭제."""
    bm = bmesh.new()
    mats = []
    mesh = bpy.data.meshes.new(name)
    for ob in objects:
        if ob.type != "MESH":
            continue
        src = ob.data
        tmp = bmesh.new()
        tmp.from_mesh(src)
        # 오브젝트 로컬 변환 반영 (상위 부모는 무시: 동일 부모 기준이어야 함)
        bmesh.ops.transform(tmp, matrix=ob.matrix_local, verts=tmp.verts)
        # 머티리얼 인덱스 재매핑
        remap = []
        for m in src.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for f in tmp.faces:
            f.material_index = remap[f.material_index] if remap else 0
        # smooth 플래그를 보존하기 위해 임시 메시 경유
        tm = bpy.data.meshes.new("_j")
        tmp.to_mesh(tm)
        tmp.free()
        for p_src, p_dst in zip(src.polygons, tm.polygons):
            p_dst.use_smooth = p_src.use_smooth
        bm.from_mesh(tm)
        bpy.data.meshes.remove(tm)
        bpy.data.objects.remove(ob)
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = keep_pivot
    if parent is not None:
        obj.parent = parent
    return obj


def all_mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


# ---------------------------------------------------------------------------
# 내보내기
# ---------------------------------------------------------------------------
def export_glb(path, normals=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_extras=True,
        export_texcoords=False,
        export_normals=normals,
    )
    return os.path.getsize(path)


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    return os.path.getsize(path)


def stats():
    tris = 0
    for o in all_mesh_objects():
        for p in o.data.polygons:
            tris += len(p.vertices) - 2
    return {"objects": len(bpy.context.scene.objects), "tris": tris}


def segment(name, mat, p0, p1, radius, parent=None, segments=14, cap=True):
    """두 점 사이를 잇는 캡슐 (팔/다리/줄기용)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    length = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=not cap, segments=segments, radius1=radius, radius2=radius, depth=length)
    if cap:
        for zc in (length / 2, -length / 2):
            s = bmesh.new()
            bmesh.ops.create_uvsphere(s, u_segments=segments, v_segments=8, radius=radius)
            _xform(s, (0, 0, zc))
            m = bpy.data.meshes.new("_tmp")
            s.to_mesh(m)
            s.free()
            bm.from_mesh(m)
            bpy.data.meshes.remove(m)
    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    m = Matrix.Translation((p0 + p1) / 2) @ rot
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return _new_object(name, bm, mat, True, parent)


# ---------------------------------------------------------------------------
# 모디파이어 기반 고품질 조형 (헤드리스: evaluated mesh 로 적용)
# ---------------------------------------------------------------------------
def apply_modifiers(obj):
    """모디파이어를 모두 적용한 새 메시로 교체 (bpy.ops 없이)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    mats = list(old.materials)
    obj.modifiers.clear()
    obj.data = me
    if not me.materials:
        for m in mats:
            me.materials.append(m)
    bpy.data.meshes.remove(old)
    return obj


def shade_smooth(obj, angle_deg=None):
    for p in obj.data.polygons:
        p.use_smooth = True
    if angle_deg is not None and hasattr(obj.data, "set_sharp_from_angle"):
        obj.data.set_sharp_from_angle(angle=math.radians(angle_deg))


def organic(name, parts, mat, voxel=0.035, smooth_iters=6, smooth_factor=0.9, decimate=0.4, subsurf=0, parent=None):
    """여러 프리미티브를 복셀 리메시 + 스무딩으로 '점토처럼' 하나로 녹여 유기적인 메시 생성 (단일 머티리얼)."""
    obj = join(name, parts, parent=parent)
    obj.data.materials.clear()
    obj.data.materials.append(material(mat) if isinstance(mat, str) else mat)
    r = obj.modifiers.new("remesh", "REMESH")
    r.mode = "VOXEL"
    r.voxel_size = voxel
    r.use_smooth_shade = True
    s = obj.modifiers.new("smooth", "SMOOTH")
    s.factor = smooth_factor
    s.iterations = smooth_iters
    if decimate and decimate < 1:
        d = obj.modifiers.new("decimate", "DECIMATE")
        d.ratio = decimate
    if subsurf:
        ss = obj.modifiers.new("subsurf", "SUBSURF")
        ss.levels = subsurf
    apply_modifiers(obj)
    shade_smooth(obj)
    return obj


def bevel(obj, width=0.05, segments=3, angle_deg=30, smooth=True):
    """모서리 베벨 (상자형 건물/기계의 날카로운 모서리를 둥글게)."""
    b = obj.modifiers.new("bevel", "BEVEL")
    b.width = width
    b.segments = segments
    b.limit_method = "ANGLE"
    b.angle_limit = math.radians(angle_deg)
    b.harden_normals = False
    apply_modifiers(obj)
    if smooth:
        shade_smooth(obj, angle_deg=40)
    return obj


def subdivide(obj, levels=1, smooth=True):
    ss = obj.modifiers.new("subsurf", "SUBSURF")
    ss.levels = levels
    apply_modifiers(obj)
    if smooth:
        shade_smooth(obj)
    return obj


def displace_noise(obj, strength=0.08, scale=1.2, seed=0):
    """나무 잎뭉치 등에 울퉁불퉁한 유기적 표면."""
    tex = bpy.data.textures.new(f"noise{seed}", "CLOUDS")
    tex.noise_scale = scale
    tex.noise_depth = 2
    d = obj.modifiers.new("displace", "DISPLACE")
    d.texture = tex
    d.strength = strength
    d.mid_level = 0.5
    apply_modifiers(obj)
    shade_smooth(obj)
    return obj


def chain(name, mat, points, radii, segments=12):
    """구슬 체인 (organic() 으로 녹이면 매끈한 가닥이 됨). points: [(x,y,z)], radii: [r]"""
    parts = []
    for i, (p, r) in enumerate(zip(points, radii)):
        parts.append(sphere(f"{name}_{i}", mat, loc=p, radius=r, segments=segments, rings=8))
        if i > 0:
            parts.append(segment(f"{name}_s{i}", mat, points[i - 1], p, min(r, radii[i - 1]) * 0.95, segments=segments, cap=False))
    return parts


def twisted_cone(name, mat, loc=(0, 0, 0), radius=0.1, depth=0.5, twist_deg=270, rings=14, segments=12, rot=(0, 0, 0), parent=None, grooves=0.0):
    """나선 홈이 있는 뿔 (유니콘 뿔)."""
    bm = bmesh.new()
    verts_rings = []
    for i in range(rings + 1):
        t = i / rings
        r = radius * (1 - t) + 0.004
        z = depth * t
        a0 = math.radians(twist_deg) * t
        ring = []
        for j in range(segments):
            a = a0 + 2 * math.pi * j / segments
            rr = r * (1 + grooves * math.sin(3 * a + 3 * t * math.pi))
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        verts_rings.append(ring)
    for i in range(rings):
        for j in range(segments):
            a, b = verts_rings[i][j], verts_rings[i][(j + 1) % segments]
            c, d = verts_rings[i + 1][(j + 1) % segments], verts_rings[i + 1][j]
            bm.faces.new((a, b, c, d))
    bm.faces.new(tuple(reversed(verts_rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _xform(bm, loc, rot)
    return _new_object(name, bm, mat, True, parent)

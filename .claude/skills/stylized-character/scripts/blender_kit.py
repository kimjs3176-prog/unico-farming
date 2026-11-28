# Blender helpers for script-built stylised game characters.
# Usage in a character script:
#   import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from blender_kit import *; import blender_kit as bk
#   (helpers come from the star import; the collections and scene live on the module: bk.CHAR, bk.AUX, bk.sc)
#   OUT, PREVIEW = start()                      # factory scene, collections, argv after '--'
#   materials({'cloth': '#ecaf2a', 'void': '#17131f', ...})
#   ... build parts with mesh_obj(name, bm, mats, origin=<joint>) ...
#   preview_turns(OUT) if PREVIEW else (bake_ao(groups), export_model(OUT))
# Run: blender -b --factory-startup -P tools/blender/<name>.py -- assets/models/<name> [--preview]
# Coordinates are written in three.js axes (x right, y up, z towards the viewer) and converted with T().
import bpy, bmesh, math, sys, random, base64, json, os
from mathutils import Vector, Matrix, kdtree

sc = None; CHAR = None; AUX = None; MATS = {}


def start():
    """Fresh scene with the 'char' collection (exported) and 'aux' (helpers). Returns (out_path, preview)."""
    global sc, CHAR, AUX
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['out']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    CHAR = bpy.data.collections.new('char'); sc.collection.children.link(CHAR)
    AUX = bpy.data.collections.new('aux'); sc.collection.children.link(AUX)
    return argv[0], '--preview' in argv


def materials(palette):
    """One material per paint slot; the page repaints by name, colours here only show in the preview."""
    for k, v in palette.items():
        m = bpy.data.materials.new(k); m.diffuse_color = hexlin(v); MATS[k] = m
    return MATS


def T(x, y, z):
    return Vector((x, -z, y))


def to3(v):
    return Vector((v.x, v.z, -v.y))


def hexlin(h):
    h = h.lstrip('#')
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (1,)




def mesh_obj(name, bm, mats, origin=(0, 0, 0), coll=None, smooth=True):
    coll = coll or CHAR
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(MATS[m])
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    org = T(*origin); me.transform(Matrix.Translation(-org)); o.location = org
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return o


def bake(o):
    """Apply all modifiers (cloth included, at the current frame)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data; o.modifiers.clear(); o.data = me
    if old.users == 0: bpy.data.meshes.remove(old)
    return o


def subsurf(o, lv=2):
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = lv; m.render_levels = lv
    return m


def solidify(o, th, inner=1, rim=1):
    m = o.modifiers.new('sol', 'SOLIDIFY'); m.thickness = th; m.offset = -1; m.use_even_offset = True
    m.material_offset = inner; m.material_offset_rim = rim
    return m


def lathe(pts, seg=32, ps=0.0, pl=2 * math.pi, cap0=False, cap1=False, vert=None):
    """Surface of revolution in three.js axes; phi 0 is the front, growing towards +x. pts: (radius, y) bottom to top."""
    bm = bmesh.new(); closed = abs(pl - 2 * math.pi) < 1e-6; n = seg if closed else seg + 1; rings = []
    for i in range(n):
        ph = ps + pl * i / seg; ring = []
        for j, (r, y) in enumerate(pts):
            x, yy, z = math.sin(ph) * r, y, math.cos(ph) * r
            if vert: x, yy, z = vert(x, yy, z, ph, j)
            ring.append(bm.verts.new(T(x, yy, z)))
        rings.append(ring)
    lay = bm.loops.layers.uv.verify()
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(len(pts) - 1):
            f = bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
            for l, uv in zip(f.loops, ((i / seg, j / (len(pts) - 1)), ((i + 1) / seg, j / (len(pts) - 1)), ((i + 1) / seg, (j + 1) / (len(pts) - 1)), (i / seg, (j + 1) / (len(pts) - 1)))):
                l[lay].uv = uv
    for cap, j in ((cap0, 0), (cap1, len(pts) - 1)):
        if cap and closed:
            f = bm.faces.new([rings[i][j] for i in range(n)])
            if j == 0: f.normal_flip()
    bm.normal_update()
    return bm


def torus(R, r, seg=48, rseg=12, tube=None, xf=None):
    """Ring in the xz plane (three.js axes); tube(a, b) scales the tube radius (a around the ring, b around the tube)."""
    bm = bmesh.new(); rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg; k = tube(a, b) if tube else 1
            p = Vector((math.cos(a) * (R + r * k * math.cos(b)), r * k * math.sin(b), math.sin(a) * (R + r * k * math.cos(b))))
            if xf: p = xf @ p
            ring.append(bm.verts.new(T(*p)))
        rings.append(ring)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(rseg):
            bm.faces.new((a[j], a[(j + 1) % rseg], b[(j + 1) % rseg], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ellipsoid(c, r, seg=24, rings=16):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        p = Vector((v.co.x * r[0], v.co.z * r[1], -v.co.y * r[2]))
        v.co = T(c[0] + p.x, c[1] + p.y, c[2] + p.z)
    return bm


def join_bm(*bms):
    out = bmesh.new(); me = bpy.data.meshes.new('tmp')
    for bm in bms:
        bm.to_mesh(me); out.from_mesh(me); bm.free()
    bpy.data.meshes.remove(me)
    return out


def metaball(name, elems, res=0.012, threshold=0.6):
    """elems: (type, centre, radius, size xyz) in three.js axes -> polygonised blob mesh"""
    mb = bpy.data.metaballs.new(name); mb.resolution = res; mb.render_resolution = res; mb.threshold = threshold
    o = bpy.data.objects.new(name, mb); AUX.objects.link(o)
    for typ, c, rad, size in elems:
        e = mb.elements.new(type=typ); e.co = T(*c); e.radius = rad
        if size: e.size_x, e.size_y, e.size_z = size[0], size[2], size[1]
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bpy.data.objects.remove(o)
    return bm


def mat_all(bm, idx):
    for f in bm.faces: f.material_index = idx
    return bm


def curve_bm(pts, bevel, radii=None, res=3, smooth=True):
    """tube along a poly/bezier curve through pts (three axes)"""
    cu = bpy.data.curves.new('c', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = bevel; cu.bevel_resolution = res; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER' if smooth else 'POLY')
    if smooth:
        sp.bezier_points.add(len(pts) - 1)
        for i, (bp, p) in enumerate(zip(sp.bezier_points, pts)):
            bp.co = T(*p); bp.handle_left_type = bp.handle_right_type = 'AUTO'; bp.radius = radii[i] if radii else 1
    else:
        sp.points.add(len(pts) - 1)
        for i, (pt, p) in enumerate(zip(sp.points, pts)):
            pt.co = (*T(*p), 1); pt.radius = radii[i] if radii else 1
    o = bpy.data.objects.new('c', cu); AUX.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me); bpy.data.objects.remove(o)
    return bm


def surf(target, origin3, dir3, maxd=1.5):
    """first hit of a ray (three axes) on target: (point, normal) in three axes, or None"""
    mw = target.matrix_world; inv = mw.inverted()
    o = inv @ T(*origin3); d = (inv.to_3x3() @ T(*dir3)).normalized()
    ok, loc, nrm, _ = target.ray_cast(o, d, distance=maxd)
    if not ok: return None
    return to3(mw @ loc), to3((mw.to_3x3() @ nrm).normalized())


def dash(bm, c3, a3, b3, n3, size, mi, org):
    """small box: centre c3, long axis a3, then b3 and n3, all three axes; org is subtracted (object-local data)"""
    cols = [T(*(a3 * size[0])), T(*(b3 * size[1])), T(*(n3 * size[2]))]
    M = Matrix(((cols[0].x, cols[1].x, cols[2].x, 0), (cols[0].y, cols[1].y, cols[2].y, 0), (cols[0].z, cols[1].z, cols[2].z, 0), (0, 0, 0, 1)))
    M.translation = T(*c3) - org
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=M)
    for f in {f for v in res['verts'] for f in v.link_faces}: f.material_index = mi; f.smooth = False


def patch(bm, target, ctr, dirv, w, h, ang, mi_patch, mi_edge, mi_stitch, seed, out=0.0018, gap=0.03):
    """A cut cloth patch that hugs target's surface, with a dark rim and stitches over its border.
    The ray comes from ctr + dirv towards ctr; bm holds target's own mesh data (object-local)."""
    rnd = random.Random(seed); org = target.location.copy()
    ctr = Vector(ctr); dirv = Vector(dirv).normalized()
    p0, n0 = surf(target, ctr + dirv * 0.9, -dirv)
    t1 = Vector((0, 1, 0)).cross(n0)
    t1 = t1.normalized() if t1.length > 1e-4 else Vector((1, 0, 0))
    t2 = n0.cross(t1).normalized()
    ca, sa = math.cos(ang), math.sin(ang); t1, t2 = t1 * ca + t2 * sa, t2 * ca - t1 * sa
    cs = [Vector((-w / 2, -h / 2)), Vector((w / 2, -h / 2)), Vector((w / 2, h / 2)), Vector((-w / 2, h / 2))]
    cs = [c + Vector((rnd.uniform(-1, 1) * w * 0.09, rnd.uniform(-1, 1) * h * 0.09)) for c in cs]
    e = 0.0045
    us = [0, e / w] + [i / 8 for i in range(1, 8)] + [1 - e / w, 1]
    vs = [0, e / h] + [i / 8 for i in range(1, 8)] + [1 - e / h, 1]

    def onto(u, v, lift):
        q2 = cs[0] * (1 - u) * (1 - v) + cs[1] * u * (1 - v) + cs[2] * u * v + cs[3] * (1 - u) * v
        q = p0 + t1 * q2.x + t2 * q2.y
        hit = surf(target, q + n0 * 0.06, -n0, 0.25)
        return (hit[0] + hit[1] * lift, hit[1]) if hit else (q + n0 * lift, n0)

    grid = [[bm.verts.new(T(*onto(u, v, out)[0]) - org) for u in us] for v in vs]
    nu, nv = len(us), len(vs)
    for j in range(nv - 1):
        for i in range(nu - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.material_index = mi_patch; f.smooth = True
    # stitches: short slanted dashes across the border, sparse so they read at a distance
    for k in range(4):
        a, b = [(0, 0), (1, 0), (1, 1), (0, 1)][k], [(0, 0), (1, 0), (1, 1), (0, 1)][(k + 1) % 4]
        L = (cs[(k + 1) % 4] - cs[k]).length; n = max(2, int(L / gap))
        for s in range(n):
            t = (s + 0.5) / n; u, v = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            p, nn = onto(u, v, out + 0.0012)
            p2, _ = onto(a[0] + (b[0] - a[0]) * min(1, t + 0.01), a[1] + (b[1] - a[1]) * min(1, t + 0.01), out + 0.0012)
            tan = (p2 - p).normalized() if (p2 - p).length > 1e-6 else t1
            across = nn.cross(tan).normalized(); across = (across + tan * 0.35).normalized()
            dash(bm, p, across, tan, nn, (0.013, 0.0019, 0.0016), mi_stitch, org)


def box(c3, size3, bevel=0.0, seg=2):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(T(*c3)) @ Matrix.Diagonal((size3[0], size3[2], size3[1], 1)))
    return bevel_all(bm, bevel, seg) if bevel else bm


def bevel_all(bm, w, seg=2):
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=w, segments=seg, affect='EDGES', profile=0.5)
    return bm



# ---------------------------------------------------------------- deformation weights
def weights_to_uv(bm, name, weights_u, weights_v):
    """Store two per-vertex weights in a temporary UV set: it survives solidify, subsurf and bake."""
    wl = bm.loops.layers.uv.new(name)
    for f in bm.faces:
        for l in f.loops: l[wl].uv = (weights_u[l.vert.index], weights_v[l.vert.index])


def copy_weights_to_new_faces(bm, name, first_new_face, ref_bm=None):
    """New faces (patches, stitches) take the weights of the nearest original vertex."""
    wl = bm.loops.layers.uv[name]; ref = ref_bm or bm; wts = {}
    kd = kdtree.KDTree(len(ref.verts))
    for f in list(ref.faces)[:first_new_face]:
        for l in f.loops: wts[l.vert.index] = tuple(l[wl].uv)
    for v in ref.verts:
        if v.index in wts: kd.insert(v.co, v.index)
    kd.balance(); bm.faces.ensure_lookup_table()
    for f in list(bm.faces)[first_new_face:]:
        for l in f.loops: l[wl].uv = wts[kd.find(l.vert.co)[1]]


def weights_to_attributes(obj, uv_name, names=('_wob', '_sway')):
    """The glTF exporter only writes UV sets a material reads, so move the weights into named POINT attributes
    (exported with export_attributes=True; GLTFLoader exposes them as '_wob'/'_sway'). Values are clamped to [0, 1]."""
    me = obj.data; uvl = me.uv_layers[uv_name]; acc = [[0.0, 0.0, 0] for _ in range(len(me.vertices))]
    for lp in me.loops:
        u, v = uvl.data[lp.index].uv; a = acc[lp.vertex_index]; a[0] += u; a[1] += v; a[2] += 1
    for nm, k in zip(names, (0, 1)):
        at = me.attributes.new(nm, 'FLOAT', 'POINT')
        for i, a in enumerate(acc): at.data[i].value = min(1.0, max(0.0, a[k] / max(1, a[2])))
    me.uv_layers.remove(uvl)


# ---------------------------------------------------------------- ambient occlusion into vertex colours
def set_weight_attribute(obj, name, values):
    """Write one per-vertex weight (clamped to [0, 1]) as a POINT attribute, e.g. on an imported image-to-3D mesh that
    has no UV set to carry weights. Export with export_attributes=True; names must start with '_'."""
    me = obj.data; a = me.attributes.get(name) or me.attributes.new(name, 'FLOAT', 'POINT')
    for i, v in enumerate(values): a.data[i].value = min(1.0, max(0.0, float(v)))


def bake_ao(groups=(), samples=64, distance=0.25):
    """Cycles AO into the 'ao' vertex colour. groups: lists of object names that move against the rest (each arm, a held
    prop); each bakes without the others, so no shadow stays behind when a part moves. Everything else bakes together.
    Remap: gentle and warm, open cloth ~0.95, folds ~0.8, deepest contacts ~0.62."""
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    w = bpy.data.worlds.new('w'); sc.world = w; w.light_settings.distance = distance
    for o in AUX.objects: o.hide_render = True
    sc.render.bake.target = 'VERTEX_COLORS'
    groups = [[bpy.data.objects[n] for n in g] for g in groups]
    loose = {o.name for g in groups for o in g}
    groups.append([o for o in CHAR.objects if o.name not in loose])
    for g in groups:
        names = {o.name for o in g}
        for o in CHAR.objects: o.hide_render = o.name not in names
        for o in g:
            me = o.data; ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'POINT'); me.color_attributes.active_color = ca
            for x in bpy.context.view_layer.objects: x.select_set(False)
            o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.bake(type='AO')
            for d in ca.data:
                a = d.color[0]; k = 0.62 + 0.38 * a ** 0.8
                d.color = (k ** 0.9, k ** 1.0, k ** 1.2, 1.0)
    for o in CHAR.objects: o.hide_render = False


# ---------------------------------------------------------------- export and preview
def export_model(out, as_json=False):
    """GLB of the 'char' collection to <out>.glb. as_json=True also packs it as base64 into <out>.json and removes the
    .glb, only for hosting that won't serve .glb (the page then does fetch -> atob -> GLTFLoader.parseAsync(bytes))."""
    for o in bpy.data.objects: o.select_set(o.name in CHAR.objects)
    bpy.context.view_layer.objects.active = CHAR.objects[0]
    opts = dict(filepath=out + '.glb', export_format='GLB', use_selection=True, export_apply=True, export_texcoords=True,
                export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=True, export_attributes=True)
    try:
        bpy.ops.export_scene.gltf(**opts, export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**opts, export_colors=True)
    if as_json:
        with open(out + '.json', 'w') as f:
            json.dump({'format': 'glb-base64', 'glb': base64.b64encode(open(out + '.glb', 'rb').read()).decode()}, f)
        os.remove(out + '.glb')
    report()


def preview_turns(out, extra=(), angles=(0, 0.8, math.pi / 2, math.pi), height=0.6, scale=4.8, res=(1600, 560)):
    """<out>_preview.png: the character turned 0/45/90/180 degrees, orthographic, side by side, for comparing with the
    model sheet at the same angles. extra: collections to show too (stand-in eyes, a face void)."""
    view = bpy.data.collections.new('view'); sc.collection.children.link(view)
    for c in (CHAR, *extra):
        for o in c.objects: view.objects.link(o)
    for c in (CHAR, AUX, *extra):
        if c.name in sc.collection.children: sc.collection.children.unlink(c)
    n = len(angles); step = scale / n
    for i, ang in enumerate(angles):
        e = bpy.data.objects.new('turn%d' % i, None); e.instance_type = 'COLLECTION'; e.instance_collection = view
        e.location = ((i - (n - 1) / 2) * step, 0, 0); e.rotation_euler = (0, 0, ang); sc.collection.objects.link(e)
    sc.collection.children.unlink(view)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale; cam.location = (0, -6, height); cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x, sc.render.resolution_y = res
    sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_cavity = True; sh.show_object_outline = True
    sc.render.filepath = out + '_preview.png'; bpy.ops.render.render(write_still=True)
    report()


def report():
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in CHAR.objects if o.type == 'MESH')
    print('CHARACTER_DONE parts=%d tris=%d' % (len(CHAR.objects), tris))

// Secondary motion and gait for procedural three.js characters.
// Extracted from a working three.js character page: cloth chain, pendulum, liftForce, flare, gait. Every rule below
// was paid for with a round of fixes. Import what you need; adapt names to your rig.
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt)); // frame-rate independent approach
// Semi-implicit spring. Stable while sqrt(k)*dt and d*dt stay well under 1: substep stiff ones (k > ~400) or at 30 FPS.
export class Spr {
  constructor(k = 120, d = 12) { this.x = 0; this.v = 0; this.k = k; this.d = d; }
  step(dt, target = 0) { const n = Math.max(1, Math.ceil(dt * Math.max(Math.sqrt(this.k), this.d) / 0.25)), h = dt / n; for (let i = 0; i < n; i++) { this.v += ((target - this.x) * this.k - this.v * this.d) * h; this.x += this.v * h; } return this.x; }
}

// ---------------------------------------------------------------- simulation constants
// Fixed 1/120 s steps through an accumulator. Damping is per second, relative to the moving support (see verlet).
export const SIM_H = 1 / 120;
export const simDamp = (perSecond) => Math.exp(-perSecond * SIM_H);
export const SIM_AIR = simDamp(0.2); // a breeze, not a gale: world-velocity drag pins cloth back when running
export const SIM_SOFT = 1 - simDamp(3); // extra damping inside the soft zone of a bend limit

const _vv = new THREE.Vector3(), _vw = new THREE.Vector3(), _vd = new THREE.Vector3();
const _lb1 = new THREE.Vector3(), _lb2 = new THREE.Vector3(), _lbq = new THREE.Quaternion(), _lbI = new THREE.Quaternion();

// How a dangling sim feels its support going up and down. Carry the sim vertically with the support (add the
// support's vertical displacement to x and o each substep) and feed only this force: the support's vertical
// acceleration from a smoothed velocity, so an impulse (take-off, landing) is spread over ~0.1 s but keeps its size.
// Raw, a jump impulse, strong game gravity (~3 g) and a kinematic step bob yank and fling dangles. Never use a
// lagging follower with a reset threshold instead: every reset is a visible snap.
export function liftForce(st, y, dt, scale) {
  dt = Math.max(dt, 1e-4);
  if (st.ly === undefined || Math.abs(y - st.ly) > 0.5) { st.ly = y; st.lv = 0; st.la = 0; return 0; }
  const fv = damp(st.lv, (y - st.ly) / dt, 10, dt); st.ly = y;
  st.la = clamp((fv - st.lv) / dt, -150, 150); st.lv = fv; return -st.la * scale;
}

// One Verlet step pulled towards a target (an angular spring once the length constraint is applied). dv is how far the
// support moved this step (horizontal only when the sim is carried vertically): damping eats only the velocity relative
// to it, and air the small share of the world velocity.
export function verlet(x, o, target, k, dmp, g, h, dv, air = SIM_AIR) {
  _vw.copy(target).sub(x).multiplyScalar(k).add(g);
  _vv.copy(x).sub(o).sub(dv).multiplyScalar(dmp).add(dv).multiplyScalar(air); o.copy(x); x.add(_vv).addScaledVector(_vw, h * h);
}

// Keep a segment within max radians of its rest direction: past 70% of the range it is eased back progressively with a
// little extra damping (a soft stop, not a wall); at max it is clamped and loses its velocity relative to the support.
export function limitBend(p, rest, x, o, L, max, dv) {
  const r = _lb1.copy(rest).normalize(), c = _lb2.copy(x).sub(p).normalize(), ang = Math.acos(clamp(r.dot(c), -1, 1)), soft = max * 0.7;
  if (ang <= soft) return;
  const t = Math.min(ang, max), target = ang > max ? max : soft + (t - soft) * (1 - 0.25 * ((t - soft) / (max - soft)));
  _lbq.setFromUnitVectors(r, c).slerp(_lbI, 1 - target / ang);
  x.copy(r.applyQuaternion(_lbq)).multiplyScalar(L).add(p); o.lerp(_vd.copy(x).sub(dv), ang > max ? 0.6 : SIM_SOFT);
}

// Push a node out of a sphere (head, body) and drop the velocity that drove it in (relative to the support).
const _cs = new THREE.Vector3();
export function collideSphere(x, o, c, r, dv) {
  const d = _cs.copy(x).sub(c), l = d.length(); if (l >= r || l < 1e-6) return false;
  x.copy(c).addScaledVector(d, r / l); o.lerp(_vd.copy(x).sub(dv), 0.5); return true;
}

// A sound tied to motion (a bell on a tail tip): call every frame with the node's world position; rings when its speed
// relative to the support jumps past a threshold, with a cooldown. play(strength 0..1) is yours (WebAudio etc).
export function makeJingle(o = {}) { return { th: o.threshold ?? 1.2, cool: o.cooldown ?? 0.18, t: 0, p: null, v: 0 }; }
export function stepJingle(J, worldPos, supportVel, dt, play) {
  J.t -= dt; if (!J.p) { J.p = worldPos.clone(); return; }
  const v = _cs.copy(worldPos).sub(J.p).divideScalar(Math.max(dt, 1e-4)).sub(supportVel).length(); J.p.copy(worldPos);
  if (Math.abs(v - J.v) > J.th && J.t <= 0) { play(clamp(Math.abs(v - J.v) / (J.th * 4), 0.15, 1)); J.t = J.cool; }
  J.v = damp(J.v, v, 20, dt);
}

// ---------------------------------------------------------------- cloth bend in the vertex shader
// Whole-piece sway (rotation uRh about pivot uPn, weight aSway) plus a two-joint point (uR0 about uP0, then uR1 about
// the moved middle joint, weighted along the point by aWob). Weights come from Blender as the vertex attributes
// _wob/_sway; copy them into aWob/aSway (clamped to [0, 1]: a weight of 1.0000001 in pow() gives NaN and holes).
export const CLOTH_BEND = `attribute float aWob; attribute float aSway; uniform mat3 uRh, uR0, uR1; uniform vec3 uPn, uP0, uP1;
float clothF() { return pow(max(aWob, 0.0), 0.8333); }
vec3 clothBend(vec3 p) {
  float f = clothF(); vec3 q = mix(p, uRh * (p - uPn) + uPn, aSway);
  q = mix(q, uR0 * (q - uP0) + uP0, smoothstep(0.03, 0.4, f));
  vec3 m1 = uR0 * (uP1 - uP0) + uP0; return mix(q, uR1 * (q - m1) + m1, smoothstep(0.4, 0.92, f));
}
vec3 clothBendN(vec3 n) {
  float f = clothF(); n = mix(n, uRh * n, aSway); n = mix(n, uR0 * n, smoothstep(0.03, 0.4, f));
  return normalize(mix(n, uR1 * n, smoothstep(0.4, 0.92, f)));
}
`;
export function clothUniforms(pivot) {
  return { uRh: { value: new THREE.Matrix3() }, uR0: { value: new THREE.Matrix3() }, uR1: { value: new THREE.Matrix3() }, uPn: { value: pivot.clone() }, uP0: { value: new THREE.Vector3() }, uP1: { value: new THREE.Vector3() } };
}
// Inject into every pass that draws the mesh: main material, outline hull, normal/ink pass, customDepthMaterial.
export function injectClothBend(m, u, extra = '') {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = CLOTH_BEND + s.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = clothBendN(vec3(normal));\n#ifdef USE_TANGENT\n\tvec3 objectTangent = vec3(tangent.xyz);\n#endif')
      .replace('#include <begin_vertex>', `vec3 transformed = clothBend(vec3(position)${extra});`);
  };
  m.customProgramCacheKey = () => 'cloth' + extra;
}
// Copy (and optionally lift) the baked weights. lift > 0 widens the swaying band when the bake fades in too slowly:
// sway = 1 - (1 - w)^lift, e.g. 2.5 lets the sides swing, not just the top.
// Throws if a required weight is missing, non-finite or all zero: a silent zero means cloth that never moves.
export function prepareClothGeometry(geo, lift = 0, required = { wob: true, sway: true }) {
  const aw = geo.attributes._wob, as = geo.attributes._sway, n = geo.attributes.position.count, w = new Float32Array(n), sw = new Float32Array(n);
  const check = (a, name, need) => {
    if (!a) { if (need) throw new Error(`cloth weights: attribute ${name} missing (exported with export_attributes=True?)`); return; }
    let mx = 0; for (let i = 0; i < a.count; i++) { const v = a.getX(i); if (!Number.isFinite(v)) throw new Error(`cloth weights: ${name}[${i}] is ${v}`); mx = Math.max(mx, v); }
    if (need && mx <= 0) throw new Error(`cloth weights: ${name} is all zero`);
  };
  check(aw, '_wob', required.wob); check(as, '_sway', required.sway);
  for (let i = 0; i < n; i++) { w[i] = aw ? clamp(aw.getX(i), 0, 1) : 0; const s = as ? clamp(as.getX(i), 0, 1) : 0; sw[i] = lift ? 1 - Math.pow(1 - s, lift) : s; }
  geo.setAttribute('aWob', new THREE.BufferAttribute(w, 1)); geo.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
}
// The shader's bend on the CPU, for measuring real deformation of real vertices (p in the mesh's local space).
const _cb = new THREE.Vector3(), _cm = new THREE.Vector3(), _sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function clothBendCPU(p, sway, wob, u, out = new THREE.Vector3()) {
  const f = Math.pow(Math.max(wob, 0), 0.8333), U = u;
  out.copy(p).sub(U.uPn.value).applyMatrix3(U.uRh.value).add(U.uPn.value).lerp(p, 1 - sway);
  _cb.copy(out).sub(U.uP0.value).applyMatrix3(U.uR0.value).add(U.uP0.value); out.lerp(_cb, _sstep(0.03, 0.4, f));
  _cm.copy(U.uP1.value).sub(U.uP0.value).applyMatrix3(U.uR0.value).add(U.uP0.value);
  _cb.copy(out).sub(_cm).applyMatrix3(U.uR1.value).add(_cm); return out.lerp(_cb, _sstep(0.4, 0.92, f));
}
// The point's joints measured on the mesh from its bend weights: root ring, middle ring, tip.
export function makeClothChain(mesh, u, o = {}) {
  const pa = mesh.geometry.attributes.position, aw = mesh.geometry.attributes.aWob, as = mesh.geometry.attributes.aSway;
  if (!aw || !as) throw new Error('cloth chain: run prepareClothGeometry first');
  const ring = (lo, hi) => { const c = new THREE.Vector3(); let n = 0; for (let i = 0; i < pa.count; i++) { const f = Math.pow(aw.getX(i), 1 / 1.2); if (f >= lo && f <= hi) { c.x += pa.getX(i); c.y += pa.getY(i); c.z += pa.getZ(i); n++; } } if (!n) throw new Error(`cloth chain: no vertices with point weight in [${lo}, ${hi}]`); return c.divideScalar(n); };
  let s0 = 0, ns = 0; for (let i = 0; i < pa.count; i++) if (aw.getX(i) > 0.25) { s0 += as.getX(i); ns++; }
  const P0 = ring(0.03, 0.12), P1 = ring(0.42, 0.55), P2 = ring(0.88, 1.0), V = () => new THREE.Vector3();
  if (P1.distanceTo(P0) < 1e-4 || P2.distanceTo(P1) < 1e-4) throw new Error('cloth chain: zero-length segment, check the point weights');
  return {
    u, P0, P1, P2, Pn: u.uPn.value.clone(), s0: ns ? s0 / ns : 1, L1: P1.distanceTo(P0), L2: P2.distanceTo(P1),
    // Defaults fit a short stiff point (~1.9 / 1.5 Hz, zeta ~0.55, limits 0.4/0.65 rad); they are a starting point, not a rule.
    // Derive your own from the wanted frequency: k = (2 pi f)^2, damping = 2 zeta sqrt(k).
    // Lean inputs: accGain (per m/s^2), rotGain (per rad/s of head+body), yawGain, leanClamp/yawClamp (rad), maxLean (rad, all axes).
    // A hanging tail with a heavy end (a bell): hang: true (full gravity, no cancellation), ~1 Hz (k ~40/30), zeta 0.4-0.5.
    // colliders: [{ bone, center: Vector3 in bone space, r }] keep both nodes outside spheres (head, body).
    k1: o.k1 ?? 140, k2: o.k2 ?? 85, d1: simDamp(o.d1 ?? 13), d2: simDamp(o.d2 ?? 10), lim1: o.lim1 ?? 0.4, lim2: o.lim2 ?? 0.65, g: o.g ?? 7, lift: o.lift ?? 0.08,
    accGain: o.accGain ?? 0.008, rotGain: o.rotGain ?? 0.1, yawGain: o.yawGain ?? 0.08, leanClamp: o.leanClamp ?? 0.16, yawClamp: o.yawClamp ?? 0.15, maxLean: o.maxLean ?? 0.2,
    hang: !!o.hang, colliders: o.colliders || [],
    l0: V(), l1: V(), l2: V(), x1: V(), o1: V(), x2: V(), o2: V(), piv: V(), init: false, lean: [new Spr(90, 12), new Spr(90, 12), new Spr(90, 12)], prev: null,
  };
}
const _hv = Array.from({ length: 17 }, () => new THREE.Vector3()), _hq = new THREE.Quaternion(), _hq2 = new THREE.Quaternion(), _hm4 = new THREE.Matrix4(), _heu = new THREE.Euler();
// Step the cloth: whole-piece lean springs (pitch, roll from local acceleration aL and head+body rotation rate; yaw lags
// head and body turns) and the two-segment world-space Verlet point. root: the character root (updateMatrixWorld);
// H: the bone the cloth is parented to; body: the bone under it; yawRate: body yaw rate (rad/s).
export function stepClothChain(C, H, body, root, dt, aL, yawRate = 0) {
  const U = C.u, hd = H.rotation, bd = body.rotation, inv = 1 / Math.max(dt, 1e-3), rot = [hd.x + bd.x, hd.z + bd.z, hd.y + bd.y], pr = C.prev || rot; C.prev = rot;
  const lc = C.leanClamp, yc = C.yawClamp;
  let pitch = C.lean[0].step(dt, clamp(-aL.z * C.accGain - (rot[0] - pr[0]) * inv * C.rotGain, -lc, lc));
  let roll = C.lean[1].step(dt, clamp(aL.x * C.accGain - (rot[1] - pr[1]) * inv * C.rotGain, -lc, lc));
  let yaw = C.lean[2].step(dt, clamp(-((rot[2] - pr[2]) * inv + yawRate) * C.yawGain, -yc, yc));
  const lm = Math.hypot(pitch, roll, yaw), ml = C.maxLean; if (lm > ml) { pitch *= ml / lm; roll *= ml / lm; yaw *= ml / lm; }
  U.uRh.value.setFromMatrix4(_hm4.makeRotationFromEuler(_heu.set(pitch, yaw, roll)));
  const lean = (p, out) => out.copy(p).sub(C.Pn).applyMatrix3(U.uRh.value).add(C.Pn).lerp(p, 1 - C.s0);
  lean(C.P0, C.l0); lean(C.P1, C.l1); lean(C.P2, C.l2); // the point hangs off the already-swayed anchors (no feedback loop)
  root.updateMatrixWorld(true);
  const p0 = H.localToWorld(_hv[0].copy(C.l0)), r1 = H.localToWorld(_hv[1].copy(C.l1)), seg2 = H.localToWorld(_hv[2].copy(C.l2)).sub(r1), rest1 = _hv[3].copy(r1).sub(p0);
  if (!C.init || p0.distanceTo(C.piv) > 0.5) { C.x1.copy(r1); C.o1.copy(r1); C.x2.copy(r1).add(seg2); C.o2.copy(C.x2); C.piv.copy(p0); C.acc = 0; C.init = true; }
  // gravity is cancelled along the bone's rest pose, so the point only droops further when the head tilts
  const up = _hv[4].set(0, 1, 0).transformDirection(H.matrixWorld), gn = _hv[5].set(0, -C.g, 0);
  if (!C.hang) gn.addScaledVector(up, C.g); // a sticking-out point holds its shape; a hanging tail feels full gravity
  const cols = C.colliders.map((c) => ({ p: c.bone.localToWorld(c.center.clone()), r: c.r }));
  gn.y += liftForce(C, p0.y, dt, C.lift);
  C.acc = Math.min(C.acc + dt, 8 * SIM_H); const n = Math.floor(C.acc / SIM_H); C.acc -= n * SIM_H; // capped: after a hitch, no fast-forward
  const dv0 = _hv[15].copy(p0).sub(C.piv).divideScalar(Math.max(n, 1)), dv1 = _hv[16], sy = dv0.y; dv0.y = 0;
  for (let s = 1; s <= n; s++) {
    const pv = _hv[6].copy(C.piv).lerp(p0, s / n);
    C.x1.y += sy; C.o1.y += sy; C.x2.y += sy; C.o2.y += sy; // carried up and down with the bone
    dv1.copy(C.x1);
    verlet(C.x1, C.o1, _hv[7].copy(pv).add(rest1), C.k1, C.d1, gn, SIM_H, dv0);
    C.x1.sub(pv).setLength(C.L1).add(pv); limitBend(pv, rest1, C.x1, C.o1, C.L1, C.lim1, dv0);
    for (const c of cols) collideSphere(C.x1, C.o1, c.p, c.r, dv0);
    dv1.subVectors(C.x1, dv1);
    _hq.setFromUnitVectors(_hv[8].copy(rest1).normalize(), _hv[9].copy(C.x1).sub(pv).normalize());
    const rest2 = _hv[10].copy(seg2).applyQuaternion(_hq); // the tip's rest follows the root segment
    verlet(C.x2, C.o2, _hv[11].copy(rest2).add(C.x1), C.k2, C.d2, gn, SIM_H, dv1);
    C.x2.sub(C.x1).setLength(C.L2).add(C.x1); limitBend(C.x1, rest2, C.x2, C.o2, C.L2, C.lim2, dv1);
    for (const c of cols) { collideSphere(C.x2, C.o2, c.p, c.r, dv1); C.x2.sub(C.x1).setLength(C.L2).add(C.x1); }
  }
  if (n) C.piv.copy(p0);
  const a = H.worldToLocal(_hv[12].copy(C.x1)), b = H.worldToLocal(_hv[13].copy(C.x2));
  _hq.setFromUnitVectors(_hv[8].copy(C.l1).sub(C.l0).normalize(), _hv[9].copy(a).sub(C.l0).normalize());
  U.uR0.value.setFromMatrix4(_hm4.makeRotationFromQuaternion(_hq));
  _hq2.setFromUnitVectors(_hv[14].copy(C.l2).sub(C.l1).applyQuaternion(_hq).normalize(), _hv[9].copy(b).sub(a).normalize());
  U.uR1.value.setFromMatrix4(_hm4.makeRotationFromQuaternion(_hq2));
  U.uP0.value.copy(C.l0); U.uP1.value.copy(C.l1);
}

// ---------------------------------------------------------------- hanging things: world-space pendulums
// obj hangs from its origin; -Y is pointed at the bob. Options: damp (per s, relative to the pivot), cone (rad from
// straight down), plane [nz, ny, d] in parent space (keep in front of a chest), lift scale. Step parents before
// children (a key on a padlock), after the rig's final pose: root.updateMatrixWorld(true) first.
// Typical ranges: damp 1.8-2.4, cone 0.95-1.0 rad; heavier or shorter things want more damping.
export function makePendulum(obj, o = {}) { return { obj, damp: o.damp ?? 2.0, cone: o.cone ?? 1.0, plane: o.plane || null, lift: o.lift ?? 0.15 }; }
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3(), _pd = new THREE.Vector3(), _pe = new THREE.Vector3(), _pf = new THREE.Vector3(), _negY = new THREE.Vector3(0, -1, 0);
export function stepPendulum(j, dt) {
  const o = j.obj, par = o.parent;
  if (j.L === undefined) { // pivot to the heavy part: biased to the bottom, so a long cord doesn't count as mass
    o.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(o, true); let lo = Infinity, hi = -Infinity;
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const yl = o.worldToLocal(_pa.set(x, y, z)).y; lo = Math.min(lo, yl); hi = Math.max(hi, yl); }
    j.L = Math.max(0.03, -(lo * 0.75 + Math.min(hi, 0) * 0.25));
  }
  const piv = par.localToWorld(_pb.copy(o.position)), lift = liftForce(j, piv.y, dt, j.lift);
  if (!j.b || piv.distanceTo(j.pv) > 0.5) { j.b = piv.clone(); j.b.y -= j.L; j.bo = j.b.clone(); j.pv = piv.clone(); j.acc = 0; }
  j.acc = Math.min(j.acc + dt, 8 * SIM_H); const n = Math.floor(j.acc / SIM_H); j.acc -= n * SIM_H;
  const dmp = simDamp(j.damp), air = simDamp(0.3), cc = Math.cos(j.cone), sc = Math.sin(j.cone), dv = _pf.copy(piv).sub(j.pv).divideScalar(Math.max(n, 1)), sy = dv.y; dv.y = 0;
  for (let s = 1; s <= n; s++) {
    const pv = _pc.copy(j.pv).lerp(piv, s / n);
    j.b.y += sy; j.bo.y += sy;
    _pd.copy(j.b).sub(j.bo).sub(dv).multiplyScalar(dmp).add(dv).multiplyScalar(air); j.bo.copy(j.b); j.b.add(_pd); j.b.y += (lift - 9.8) * SIM_H * SIM_H;
    for (let it = 0; it < (j.plane ? 3 : 1); it++) {
      _pd.copy(j.b).sub(pv).normalize();
      if (_pd.y > -cc) { const hz = Math.hypot(_pd.x, _pd.z) || 1; _pd.set((_pd.x / hz) * sc, -cc, (_pd.z / hz) * sc); if (!it) j.bo.lerp(_pe.copy(j.b).sub(dv), 0.5); }
      j.b.copy(pv).addScaledVector(_pd, j.L);
      if (j.plane) {
        const bl = par.worldToLocal(_pe.copy(j.b)), d = bl.z * j.plane[0] + bl.y * j.plane[1] - j.plane[2];
        if (d < 0) { bl.z -= d * j.plane[0]; bl.y -= d * j.plane[1]; j.b.copy(par.localToWorld(bl)); if (!it) j.bo.lerp(_pe.copy(j.b).sub(dv), 0.6); }
      }
    }
  }
  if (n) j.pv.copy(piv);
  o.quaternion.setFromUnitVectors(_negY, par.worldToLocal(_pe.copy(j.b)).sub(o.position).normalize()); o.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- cloak / skirt: trail and twist below a height
export const FLARE_GLSL = 'float fk = max(0.0, uTop - position.y), fk2 = fk * fk, tw = uTw * fk2; transformed.xz = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * transformed.xz + uFlare * fk2;';
export function flareUniforms(top) { return { uFlare: { value: new THREE.Vector2() }, uTw: { value: 0 }, uTop: { value: top } }; }
export function injectFlare(m, u, extra = '') {
  m.onBeforeCompile = (s) => {
    s.uniforms.uFlare = u.uFlare; s.uniforms.uTw = u.uTw; s.uniforms.uTop = u.uTop;
    s.vertexShader = 'uniform vec2 uFlare; uniform float uTw, uTop;\n' + s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position)${extra}; ${FLARE_GLSL}`);
  };
  m.customProgramCacheKey = () => 'flare' + extra;
}
// Drive: springs k30 d4.5 (heavier swish). Targets: trail -vLocal * (0.05 x, 0.08 z); swing out of turns
// -yawRate*speed*0.016 (centripetal is along local +x for yawRate > 0, so the hem goes outward); twist -yawRate*0.12;
// kicks -aL*0.012 per 60 Hz frame. Aim for 4-7 cm hem travel at an ordinary run.
export function makeFlareDrive() { return { fx: new Spr(30, 4.5), fz: new Spr(30, 4.5), tw: new Spr(30, 4.5) }; }
export function stepFlare(F, u, dt, { aL, vLocalX = 0, vLocalZ = 0, yawRate = 0, speed = 0, waddle = 0 }) {
  const f60 = dt * 60; F.fx.v += -aL.x * 0.012 * f60; F.fz.v += -aL.z * 0.012 * f60;
  const fx = F.fx.step(dt, clamp(-vLocalX * 0.05 - yawRate * speed * 0.016, -0.3, 0.3)), fz = F.fz.step(dt, clamp(-vLocalZ * 0.08, -0.4, 0.25));
  u.uFlare.value.set(clamp(fx + waddle, -0.5, 0.5), clamp(fz, -0.6, 0.4)); u.uTw.value = F.tw.step(dt, clamp(-yawRate * 0.12, -1, 1));
}

// ---------------------------------------------------------------- gait
// cps: foot contacts per second; a foot is planted 42% of its cycle (0.84/cps s) and slides 2S back under the body, so
// S = 0.42 v / cps keeps it still on the ground. Hips lowest mid-stance; quick squash spring (k1400 d50, substep x4)
// kicked at heel strike (-(3 + 0.6 spr) k) gives 4-5% in ~40 ms; waddle roll 0.04 rad; lean 0.12-0.16 rad + accel;
// bank -yawRate*speed*0.04; head leads turns by clamp(0.6*lead, +-0.26) via damp 30/s.
export const cadence = (v) => clamp(2.6 + 0.6 * v, 2.6, 5.4);
export const strideHalf = (v, cps) => Math.min(0.355, (0.42 * v) / cps);
// u in [0,1): foot cycle phase. Returns {z, y, pitch} in root space (x is the foot's lateral offset).
export function footPose(u, S, lift, k) {
  if (u < 0.42) { const t = u / 0.42; return { z: S * (1 - 2 * t), y: 0, pitch: lerp(-0.25, 0.35, t) * k }; }
  const t = (u - 0.42) / 0.58, e = t * t * (3 - 2 * t); return { z: -S + 2 * S * e, y: Math.sin(Math.PI * t) * lift, pitch: lerp(0.35, -0.25, t) * k };
}
export const hipLift = (u2, spr, k) => (0.5 - 0.5 * Math.cos(2 * Math.PI * (u2 - 0.35))) * lerp(0.04, 0.045, spr) * k; // u2: phase within one contact

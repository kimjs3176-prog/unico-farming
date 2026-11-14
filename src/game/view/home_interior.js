import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 유니코 집 실내 (단면 인형집 방식: 앞벽·천장 없이 위·앞에서 내려다보는 방)
 *  - 맵 바깥 땅속 깊은 곳(IO, 200m 아래)에 방을 지어 두고, 문으로 들어오면 그 방으로 옮김
 *    → 바깥 물체·언덕에 가려지지 않고, 위쪽 세상은 실내 안개(34m) 너머라 보이지 않음
 *  - 집 단계마다 방이 넓어지고 가구가 늘어남 (오두막 → 아늑한 집: 부엌·화분 → 2층 집: 벽난로·계단)
 *  - 가구와 상호작용: 🛏️ 침대(잠자기) · 👗 옷장(옷 갈아입기) · 📚 책장(도감) · 📅 달력(퀘스트) · 📒 책상(집 넓히기) · 🚪 문(나가기)
 * 모두 코드로 만든 저폴리 (게임 팔레트)
 */
export const IO = { x: 0, y: -200, z: 150 };
export const ROOM = [{ w: 7, d: 5.6 }, { w: 8.6, d: 6.4 }, { w: 10, d: 7.4 }];

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const MAT = {
  floor: M(0xc99a63), floorB: M(0xb8875a), wall: M(0xfff1dc), wallB: M(0xf6dcc0), base: M(0xa8784a), wood: M(0xa8784a), woodD: M(0x7a5232),
  white: M(0xffffff), sheet: M(0xf4f8ff), blanket: M(0x30b6aa), pillow: M(0xfff6e8), rug: M(0xe8a0a8), rugB: M(0xf6d28a),
  red: M(0xe35d5d), teal: M(0x2fa89c), yellow: M(0xfac03e), green: M(0x6dbb4f), leaf: M(0x58a33c), pot: M(0xd9784a), gray: M(0x9aa3ab),
  book: [M(0xe35d5d), M(0x4a90d9), M(0x6dbb4f), M(0xfac03e), M(0x9b7fd1)], stone: M(0xcfc4b2), dark: M(0x3b3532),
};
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r1, r2, h, m, x, y, z, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); return o; };
const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m); o.position.set(x, y, z); return o; };

/**
 * 움직이지 않는 메시를 재질·가구 자리(userData.spot)별로 하나씩 합침 → 그리기 호출(그림자 포함) 줄이기
 * 가구 자리 표시는 합친 메시에도 그대로 (누르면 그 가구). 합친 메시의 userData.mids 는 조각마다 [끝 삼각형 번호, 가운데 x, z]
 * → 누른 곳이 어느 조각인지(맞힌 삼각형)로 예전처럼 그 조각의 가운데를 씀 (pointer.js pickInside)
 * userData.keep 인 메시(일렁이는 불꽃)는 그대로 둠
 */
export function mergeRoomMeshes(g) {
  const sets = new Map();
  for (const o of g.children) {
    if (!o.isMesh || o.userData.keep || Array.isArray(o.material)) continue;
    const k = `${o.material.uuid}|${o.userData.spot || ''}`;
    if (!sets.has(k)) sets.set(k, []);
    sets.get(k).push(o);
  }
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => { o.updateMatrix(); return o.geometry.clone().applyMatrix4(o.matrix); });
    const geo = mergeGeometries(geos, false);
    for (const x of geos) x.dispose();
    if (!geo) continue; // 속성이 달라 못 합치면 그대로
    const m = new THREE.Mesh(geo, list[0].material);
    let tri = 0;
    m.userData.mids = list.map((o) => { tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; return [tri, o.position.x, o.position.z]; });
    if (list[0].userData.spot) m.userData.spot = list[0].userData.spot;
    for (const o of list) { g.remove(o); o.geometry.dispose(); }
    g.add(m);
  }
  return g;
}

/** 방 하나 만들기 → { group, solids: [{x0,z0,x1,z1}], spots: [{key, x, z, label}], entry: {x,z}, door: {x,z}, glass, lampMat, fire } */
export function buildRoom(level, mats) {
  const { w: W, d: D } = ROOM[level];
  const g = new THREE.Group(), solids = [], spots = [];
  // 가구 메시에 자리 표시: 누르면 겹쳐 보이는 옆 가구가 아니라 그 가구로 (pointer.js pickInside)
  const tag = (from, key) => { for (const o of g.children.slice(from)) o.userData.spot = key; };
  let m0 = 0;
  const solid = (x, z, w, d) => solids.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  const H = 3.0;
  // 바닥 (널빤지 줄무늬) + 걸레받이
  for (let i = 0, n = Math.ceil(W / 0.7); i < n; i++) g.add(box(Math.min(0.7, W - i * 0.7) - 0.02, 0.1, D, i % 2 ? MAT.floor : MAT.floorB, -W / 2 + i * 0.7 + Math.min(0.7, W - i * 0.7) / 2, -0.05, 0));
  // 뒤·옆 벽 (앞은 열려 있음), 위쪽 띠
  g.add(box(W + 0.3, H, 0.15, MAT.wall, 0, H / 2, -D / 2 - 0.075));
  for (const s of [-1, 1]) g.add(box(0.15, H, D, MAT.wall, s * (W / 2 + 0.075), H / 2, 0));
  g.add(box(W, 0.9, 0.02, MAT.wallB, 0, 0.45, -D / 2 + 0.01));                          // 뒤 벽 아랫단 색
  g.add(box(W, 0.1, 0.06, MAT.base, 0, 0.05, -D / 2 + 0.03));
  for (const s of [-1, 1]) { g.add(box(0.02, 0.9, D, MAT.wallB, s * (W / 2 - 0.01), 0.45, 0)); g.add(box(0.06, 0.1, D, MAT.base, s * (W / 2 - 0.03), 0.05, 0)); }
  // 창문 (뒤 벽): 바깥 하늘빛(낮)·밤하늘 → mats.glass
  const wx = -W / 2 + 2.6;
  g.add(box(1.3, 1.1, 0.06, MAT.white, wx, 1.75, -D / 2 + 0.04), box(1.15, 0.95, 0.07, mats.glass, wx, 1.75, -D / 2 + 0.05));
  g.add(box(0.05, 0.95, 0.08, MAT.white, wx, 1.75, -D / 2 + 0.07), box(1.15, 0.05, 0.08, MAT.white, wx, 1.75, -D / 2 + 0.07));
  g.add(box(1.5, 0.08, 0.2, MAT.wood, wx, 1.2, -D / 2 + 0.12));
  // 🛏️ 침대 (왼쪽 뒤)
  const bx = -W / 2 + 1.0, bz = -D / 2 + 1.25;
  m0 = g.children.length;
  g.add(box(1.5, 0.35, 2.3, MAT.wood, bx, 0.25, bz), box(1.4, 0.18, 2.15, MAT.sheet, bx, 0.5, bz), box(1.42, 0.12, 1.4, MAT.blanket, bx, 0.6, bz + 0.38));
  g.add(box(1.5, 0.9, 0.12, MAT.woodD, bx, 0.55, bz - 1.15), box(0.9, 0.18, 0.4, MAT.pillow, bx, 0.66, bz - 0.78));
  tag(m0, 'bed');
  solid(bx, bz, 1.55, 2.35);
  spots.push({ key: 'bed', x: bx + 1.1, z: bz + 0.3, label: '🛏️ 침대 · 잠자기' });
  // 📅 달력 (뒤 벽, 창문 오른쪽)
  const cx = wx + 1.5;
  m0 = g.children.length;
  g.add(box(0.6, 0.75, 0.04, MAT.white, cx, 1.85, -D / 2 + 0.04), box(0.6, 0.18, 0.05, MAT.red, cx, 2.15, -D / 2 + 0.05));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.add(box(0.1, 0.08, 0.05, (r * 4 + c) % 5 ? MAT.gray : MAT.teal, cx - 0.2 + c * 0.13, 1.95 - r * 0.15, -D / 2 + 0.055));
  tag(m0, 'calendar');
  // 📒 책상 + 의자 + 일기장
  const dx = cx + 1.1, dz = -D / 2 + 0.5;
  m0 = g.children.length;
  g.add(box(1.3, 0.08, 0.65, MAT.wood, dx, 0.78, dz));
  for (const sx of [-1, 1]) g.add(box(0.07, 0.75, 0.6, MAT.woodD, dx + sx * 0.58, 0.38, dz));
  g.add(box(0.4, 0.05, 0.3, MAT.blanket, dx - 0.2, 0.84, dz), box(0.28, 0.32, 0.06, MAT.yellow, dx + 0.35, 0.98, dz - 0.15)); // 공책·작은 액자
  g.add(box(0.5, 0.06, 0.5, MAT.woodD, dx, 0.48, dz + 0.65), box(0.5, 0.55, 0.06, MAT.woodD, dx, 0.75, dz + 0.9)); // 의자
  tag(m0, 'desk');
  solid(dx, dz, 1.35, 0.7);
  spots.push({ key: 'calendar', x: cx, z: -D / 2 + 1.0, label: '📅 달력 · 퀘스트 보기' });
  spots.push({ key: 'desk', x: dx, z: dz + 1.15, label: '📒 책상 · 집 일기 (집 넓히기)' });
  // 👗 옷장 (오른쪽 뒤)
  const ox = W / 2 - 0.75, oz = -D / 2 + 0.45;
  m0 = g.children.length;
  g.add(box(1.3, 2.2, 0.75, MAT.wood, ox, 1.1, oz), box(0.03, 2.0, 0.05, MAT.woodD, ox, 1.1, oz + 0.38));
  g.add(ball(0.05, MAT.yellow, ox - 0.1, 1.1, oz + 0.4), ball(0.05, MAT.yellow, ox + 0.1, 1.1, oz + 0.4), box(1.36, 0.1, 0.8, MAT.woodD, ox, 2.25, oz));
  tag(m0, 'wardrobe');
  solid(ox, oz, 1.3, 0.8);
  spots.push({ key: 'wardrobe', x: ox, z: oz + 1.05, label: '👗 옷장 · 옷 갈아입기' });
  // 📚 책장 (왼쪽 벽 가운데)
  const kx = -W / 2 + 0.33, kz = 0.9;
  m0 = g.children.length;
  g.add(box(0.5, 2.0, 1.5, MAT.woodD, kx, 1.0, kz));
  for (let sh = 0; sh < 4; sh++) {
    g.add(box(0.46, 0.05, 1.42, MAT.wood, kx + 0.02, 0.25 + sh * 0.48, kz));
    for (let b = 0; b < 6; b++) g.add(box(0.3, 0.32 - (b % 3) * 0.04, 0.16, MAT.book[(b + sh) % 5], kx + 0.06, 0.44 + sh * 0.48 - (b % 3) * 0.02, kz - 0.55 + b * 0.22));
  }
  tag(m0, 'books');
  solid(kx, kz, 0.55, 1.55);
  spots.push({ key: 'books', x: kx + 0.95, z: kz, label: '📚 책장 · 유니코 도감' });
  // 탁자 + 의자 둘 + 깔개 (가운데) — 꾸밈
  const tx = 0.6, tz = 0.9;
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.35, 28), MAT.rug); rug.rotation.x = -Math.PI / 2; rug.position.set(tx, 0.012, tz); g.add(rug);
  const rr = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.18, 28), MAT.rugB); rr.rotation.x = -Math.PI / 2; rr.position.set(tx, 0.016, tz); g.add(rr);
  g.add(cyl(0.6, 0.6, 0.07, MAT.wood, tx, 0.72, tz), cyl(0.08, 0.12, 0.7, MAT.woodD, tx, 0.36, tz));
  g.add(cyl(0.12, 0.1, 0.14, MAT.white, tx + 0.15, 0.83, tz - 0.1), ball(0.1, MAT.red, tx - 0.18, 0.84, tz + 0.1)); // 컵·사과
  for (const sx of [-1, 1]) g.add(box(0.42, 0.06, 0.42, MAT.wood, tx + sx * 0.95, 0.45, tz), box(0.06, 0.45, 0.42, MAT.woodD, tx + sx * 1.15, 0.68, tz));
  solid(tx, tz, 1.25, 1.25);
  // 스탠드 조명 (밤에 켜짐)
  const lx = W / 2 - 0.5, lz = 0.6;
  g.add(cyl(0.18, 0.22, 0.06, MAT.woodD, lx, 0.03, lz), cyl(0.03, 0.03, 1.4, MAT.woodD, lx, 0.72, lz), cyl(0.18, 0.28, 0.3, mats.lampMat, lx, 1.5, lz));
  solid(lx, lz, 0.4, 0.4);
  // 단계별 추가
  let fire = null;
  if (level >= 1) {
    // 부엌 (왼쪽 앞): 조리대·화덕·냄비 + 화분
    const ux = -W / 2 + 0.45, uz = D / 2 - 1.3;
    g.add(box(0.75, 0.9, 1.6, MAT.wood, ux, 0.45, uz), box(0.8, 0.06, 1.65, MAT.stone, ux, 0.93, uz));
    g.add(cyl(0.2, 0.2, 0.22, MAT.gray, ux, 1.08, uz - 0.35), box(0.05, 0.6, 0.3, MAT.dark, ux - 0.36, 1.25, uz + 0.4));
    solid(ux, uz, 0.8, 1.65);
    for (const [px, pz] of [[W / 2 - 0.45, D / 2 - 0.5], [-W / 2 + 1.2, -D / 2 + 0.35]]) { g.add(cyl(0.18, 0.14, 0.3, MAT.pot, px, 0.15, pz), ball(0.26, MAT.leaf, px, 0.48, pz), ball(0.17, MAT.green, px + 0.1, 0.66, pz)); solid(px, pz, 0.4, 0.4); }
    // 벽 액자 (KOAT 색 무늬)
    g.add(box(0.8, 0.55, 0.04, MAT.woodD, -W / 2 + 0.02, 1.9, -0.6)); g.children[g.children.length - 1].rotation.y = Math.PI / 2;
    g.add(box(0.02, 0.42, 0.66, MAT.teal, -W / 2 + 0.05, 1.9, -0.6));
  }
  if (level >= 2) {
    // 벽난로 (뒤 벽 오른쪽, 불꽃이 일렁임) + 계단(오른쪽 앞, 2층으로 가는 듯)
    const fx = W / 2 - 2.3, fz = -D / 2 + 0.35;
    g.add(box(1.4, 1.2, 0.6, MAT.stone, fx, 0.6, fz), box(1.6, 0.12, 0.7, MAT.woodD, fx, 1.25, fz), box(0.8, 0.55, 0.1, MAT.dark, fx, 0.4, fz + 0.26));
    fire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xffa340, emissive: 0xff7a1a, emissiveIntensity: 1.6 }));
    fire.position.set(fx, 0.34, fz + 0.37); fire.userData.keep = true; g.add(fire); // 화덕 입구 바로 앞 (돌 안쪽이면 가려짐)
    g.add(box(0.5, 0.08, 0.14, MAT.woodD, fx, 0.1, fz + 0.38)); // 장작
    solid(fx, fz, 1.45, 0.65);
    for (let k = 0; k < 6; k++) g.add(box(0.9, 0.18, 0.4, MAT.wood, W / 2 - 0.55, 0.09 + k * 0.36, D / 2 - 0.6 - k * 0.38));
    solid(W / 2 - 0.55, D / 2 - 1.55, 0.95, 2.4);
  }
  // 🚪 문 (오른쪽 벽 앞쪽) — 나가기
  const doz = D / 2 - (level >= 2 ? 3.3 : 1.1);
  m0 = g.children.length;
  g.add(box(0.1, 2.1, 1.0, MAT.wood, W / 2 - 0.02, 1.05, doz), box(0.12, 2.2, 1.12, MAT.woodD, W / 2 - 0.01, 1.1, doz));
  g.add(box(0.1, 2.0, 0.9, M(0xe58a3a), W / 2 - 0.05, 1.0, doz), ball(0.05, MAT.yellow, W / 2 - 0.12, 1.0, doz - 0.3));
  tag(m0, 'door');
  g.add(box(0.7, 0.02, 1.0, MAT.rugB, W / 2 - 0.5, 0.012, doz)); // 현관 매트 (바닥처럼: 문 자리 바로 위를 눌렀을 때만 나감)
  spots.push({ key: 'door', x: W / 2 - 0.7, z: doz, label: '🚪 문 · 밖으로 나가기' });
  mergeRoomMeshes(g); // 약 110개 → 40개 안팎 (실내 그림자도 그리므로 두 배로 줄어듦)
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, solids, spots, entry: { x: W / 2 - 1.2, z: doz }, W, D, fire };
}

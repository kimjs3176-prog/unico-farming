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
// 가구 색: 되도록 방 팔레트(MAT)를 같이 써서 합칠 때 그리기 호출이 늘지 않게. 새 재질은 금·하늘·유리·등갓·금붕어만
const FMAT = {
  frame: MAT.wood, gold: M(0xf2c14e, { roughness: 0.35, metalness: 0.55, emissive: 0x3a2a00 }), sky: M(0x9fd4f0), hill: MAT.green, sun: MAT.yellow,
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }),
  fish: M(0xff8a3d), curtain: MAT.rug, flag: [MAT.red, MAT.yellow, MAT.green, MAT.teal, MAT.rug], shade: M(0xfff1c4, { emissive: 0xffd88a, emissiveIntensity: 0.35 }),
  radio: MAT.woodD, cord: MAT.woodD, rug: MAT.rug, rugB: MAT.teal, bear: MAT.wood, bearL: MAT.pillow, petal: MAT.rug, stone: MAT.stone,
};

/** 벽지·바닥 색 바꾸기 (재질 색만 → 방을 다시 짓지 않아도 됨, 그리기 호출 그대로) */
export function applyRoomStyle(c) {
  if (!c) return;
  for (const k of ['wall', 'wallB', 'floor', 'floorB']) if (Number.isFinite(c[k])) MAT[k].color.setHex(c[k]);
}

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

/** 트로피 선반 자리 순서 (도감 탭) */
export const TROPHY_CATS = ['fish', 'bug', 'fruit', 'ship'];

/**
 * 책장 위(높이 y) 트로피 넷: 방 팔레트(MAT)만 써서 합치면 그리기 호출이 늘지 않음
 * 방 안쪽(+x)을 보게 세움. 아직 못 채운 탭은 빈 받침 + 빈 액자
 */
function addTrophies(g, kx, y, kz, won) {
  const x0 = kx - 0.06; // 벽 쪽
  TROPHY_CATS.forEach((cat, i) => {
    const z = kz - 0.54 + i * 0.36, from = g.children.length;
    addTrophy(g, cat, kx, x0, y, z, won);
    // 방 전체가 보이는 거리에서도 알아보게 받침 가운데 아래를 기준으로 키움
    for (const o of g.children.slice(from)) { o.position.set(kx + (o.position.x - kx) * TROPHY_K, y + (o.position.y - y) * TROPHY_K, z + (o.position.z - z) * TROPHY_K); o.scale.multiplyScalar(TROPHY_K); }
  });
}
const TROPHY_K = 1.3; // 트로피 크기 배수 (받침 0.27 × 1.3 ≈ 0.35 < 자리 간격 0.36: 이웃과 닿지 않음)

function addTrophy(g, cat, kx, x0, y, z, won) {
  g.add(box(0.27, 0.04, 0.27, MAT.woodD, kx, y + 0.02, z)); // 받침
  if (!won.has(cat)) { // 빈 자리: 흐린 빈 액자
    g.add(box(0.03, 0.26, 0.24, MAT.wood, x0, y + 0.17, z), box(0.035, 0.2, 0.18, MAT.wallB, x0 + 0.004, y + 0.17, z));
    return;
  }
  if (cat === 'fish') { // 나무 액자에 붙인 주황 물고기
    g.add(box(0.04, 0.3, 0.32, MAT.wood, x0, y + 0.19, z), box(0.045, 0.24, 0.26, MAT.white, x0 + 0.003, y + 0.19, z));
    const f = ball(0.075, MAT.pot, x0 + 0.04, y + 0.19, z - 0.02); f.scale.set(0.45, 0.7, 1.45); g.add(f);
    const t = box(0.03, 0.09, 0.07, MAT.pot, x0 + 0.04, y + 0.19, z + 0.11); t.rotation.x = 0.6; g.add(t);
    g.add(ball(0.012, MAT.woodD, x0 + 0.07, y + 0.21, z - 0.11), box(0.02, 0.035, 0.12, MAT.woodD, x0 + 0.03, y + 0.06, z)); // 눈 · 이름표
  } else if (cat === 'bug') { // 표본 상자: 액자 안 흰 바탕에 곤충 셋
    g.add(box(0.05, 0.28, 0.32, MAT.woodD, x0, y + 0.18, z), box(0.055, 0.22, 0.26, MAT.white, x0 + 0.003, y + 0.18, z));
    for (const [dz, dy, m] of [[-0.07, 0.05, MAT.red], [0.06, 0.06, MAT.teal], [0, -0.05, MAT.green]]) {
      g.add(ball(0.022, m, x0 + 0.04, y + 0.18 + dy, z + dz));
      for (const s of [-1, 1]) { const w = box(0.01, 0.03, 0.04, m === MAT.red ? MAT.yellow : m, x0 + 0.035, y + 0.18 + dy + 0.01, z + dz + s * 0.035); w.rotation.x = s * 0.5; g.add(w); }
    }
  } else if (cat === 'fruit') { // 과일 바구니
    g.add(cyl(0.13, 0.1, 0.1, MAT.wood, kx, y + 0.09, z, 10), cyl(0.135, 0.135, 0.02, MAT.woodD, kx, y + 0.14, z, 10));
    for (const [dx, dz, m] of [[-0.05, -0.04, MAT.red], [0.04, -0.05, MAT.pot], [0.0, 0.05, MAT.yellow], [0.05, 0.04, MAT.rug]]) g.add(ball(0.055, m, kx + dx, y + 0.18, z + dz));
    g.add(ball(0.05, MAT.red, kx, y + 0.24, z));
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 5, 12, Math.PI), MAT.woodD); hd.position.set(kx, y + 0.15, z); hd.rotation.y = Math.PI / 2; g.add(hd);
  } else { // 황금 벼 다발 (출하 도감)
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, r = 0.035;
      const st = cyl(0.008, 0.01, 0.3, MAT.yellow, kx + Math.cos(a) * r, y + 0.19, z + Math.sin(a) * r, 5); st.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); g.add(st);
      g.add(ball(0.022, MAT.yellow, kx + Math.cos(a) * r * 2.6, y + 0.35, z + Math.sin(a) * r * 2.6));
    }
    g.add(cyl(0.045, 0.045, 0.04, MAT.red, kx, y + 0.15, z, 10)); // 묶은 끈
  }
}

/** 방 하나 만들기 → { group, solids: [{x0,z0,x1,z1}], spots: [{key, x, z, label}], entry: {x,z}, door: {x,z}, glass, lampMat, fire, furnAt: {가구 id: {x,y,z}} } */
export function buildRoom(level, mats, opts = {}) {
  applyRoomStyle(opts.colors);
  const own = new Set(opts.furniture || []);
  const furnAt = {}; // 산 가구 자리 (방 기준) → 산 뒤 반짝임 (home_view)
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
  // 🏆 책장 위 트로피 선반: 도감 탭을 다 채우면 하나씩 (물고기 액자 · 곤충 표본 상자 · 과일 바구니 · 황금 벼 다발), 빈 자리는 빈 받침
  tag(m0, 'books');
  const won = new Set(opts.trophies || []);
  addTrophies(g, kx, 2.0, kz, won); // 자리 표시 없이 → 방의 같은 재질 메시와 합쳐짐
  solid(kx, kz, 0.55, 1.55);
  const tn = TROPHY_CATS.filter((c) => won.has(c)).length;
  spots.push({ key: 'books', x: kx + 0.95, z: kz, label: `📚 책장 · 유니코 도감 (🏆 트로피 ${tn}/${TROPHY_CATS.length})` });
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
  // 산 가구 (꾸밈만: 벽에 걸거나 가구 위에 올려 길을 막지 않음)
  if (own.has('painting')) { // 침대 위 벽: 들판 그림
    g.add(box(1.1, 0.75, 0.05, FMAT.frame, bx, 1.9, -D / 2 + 0.04), box(0.96, 0.6, 0.06, FMAT.sky, bx, 1.9, -D / 2 + 0.05));
    g.add(box(0.96, 0.24, 0.07, FMAT.hill, bx, 1.72, -D / 2 + 0.06), ball(0.08, FMAT.sun, bx + 0.28, 2.03, -D / 2 + 0.08));
    furnAt.painting = { x: bx, y: 1.9, z: -D / 2 + 0.2 };
  }
  if (own.has('clock')) { // 책상 위 벽
    const c = cyl(0.26, 0.26, 0.06, FMAT.frame, dx, 2.0, -D / 2 + 0.05, 20); c.rotation.x = Math.PI / 2; g.add(c);
    const f = cyl(0.21, 0.21, 0.07, MAT.white, dx, 2.0, -D / 2 + 0.06, 20); f.rotation.x = Math.PI / 2; g.add(f);
    g.add(box(0.03, 0.15, 0.02, MAT.dark, dx, 2.06, -D / 2 + 0.1), box(0.11, 0.03, 0.02, MAT.dark, dx + 0.05, 2.0, -D / 2 + 0.1));
    furnAt.clock = { x: dx, y: 2.0, z: -D / 2 + 0.2 };
  }
  if (own.has('teddy')) { // 베개 옆
    const tx0 = bx + 0.45, tz0 = bz - 0.72, k = 1.3, y0 = 0.62; // 1.3배: 방 전체가 보이는 거리에서도 알아보게
    const at = (dx0, dy, dz0) => [tx0 + dx0 * k, y0 + dy * k, tz0 + dz0 * k];
    g.add(ball(0.17 * k, FMAT.bear, ...at(0, 0.16, 0)), ball(0.13 * k, FMAT.bear, ...at(0, 0.41, 0.02)), ball(0.05 * k, FMAT.bear, ...at(-0.1, 0.52, 0)), ball(0.05 * k, FMAT.bear, ...at(0.1, 0.52, 0)));
    g.add(ball(0.06 * k, FMAT.bearL, ...at(0, 0.38, 0.12)), ball(0.08 * k, FMAT.bearL, ...at(0, 0.16, 0.12)));
    furnAt.teddy = { x: tx0, y: 1.0, z: tz0 };
  }
  if (own.has('sillflower')) furnAt.sillflower = { x: wx, y: 1.4, z: -D / 2 + 0.2 };
  if (own.has('sillflower')) for (let k = -1; k <= 1; k++) { // 창틀 위 화분 셋
    g.add(cyl(0.08, 0.06, 0.12, MAT.pot, wx + k * 0.4, 1.3, -D / 2 + 0.13, 10), ball(0.09, k ? FMAT.petal : MAT.yellow, wx + k * 0.4, 1.44, -D / 2 + 0.13));
  }
  if (own.has('fishbowl')) { // 가운데 탁자 위 (컵·사과 사이 뒤쪽)
    g.add(ball(0.26, FMAT.glass, tx, 1.0, tz - 0.25), ball(0.07, FMAT.fish, tx + 0.05, 0.97, tz - 0.25)); // 1.3배
    furnAt.fishbowl = { x: tx, y: 1.0, z: tz - 0.25 };
    g.children[g.children.length - 2].userData.keep = true; // 투명 유리는 따로 (합치면 그리는 순서가 섞임)
  }
  if (own.has('curtain')) furnAt.curtain = { x: wx, y: 1.7, z: -D / 2 + 0.2 };
  if (own.has('curtain')) for (const s of [-1, 1]) g.add(box(0.32, 1.3, 0.05, FMAT.curtain, wx + s * 0.82, 1.7, -D / 2 + 0.09));
  if (own.has('garland')) for (let k = 0; k < 11; k++) { // 뒤 벽 위 깃발 줄
    const x = -W / 2 + 0.6 + k * ((W - 1.2) / 10), y = 2.45 - Math.sin((k / 10) * Math.PI) * 0.18; // 잘린 벽 위 끝 아래로
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 3), FMAT.flag[k % 5]); f.rotation.z = Math.PI; f.position.set(x, y, -D / 2 + 0.06); g.add(f);
  }
  if (own.has('garland')) furnAt.garland = { x: 0, y: 2.35, z: -D / 2 + 0.2 };
  // 펜던트: 가늘고 따뜻한 갈색 줄, 탁자 바로 위까지만 (방 가운데를 길게 가르지 않게)
  if (own.has('pendant')) { g.add(cyl(0.008, 0.008, 0.55, FMAT.cord, tx, 2.08, tz, 5), cyl(0.12, 0.34, 0.26, FMAT.shade, tx, 1.68, tz, 16)); furnAt.pendant = { x: tx, y: 1.7, z: tz }; }
  if (own.has('radio')) furnAt.radio = { x: dx - 0.18, y: 1.0, z: dz + 0.05 };
  if (own.has('radio')) g.add(box(0.36, 0.22, 0.16, FMAT.radio, dx - 0.18, 0.93, dz + 0.05), cyl(0.06, 0.06, 0.02, MAT.yellow, dx - 0.26, 0.93, dz + 0.14, 12), box(0.01, 0.2, 0.01, MAT.dark, dx - 0.04, 1.12, dz));
  if (own.has('bigrug')) { // 앞쪽 바닥 (밟고 지나감)
    furnAt.bigrug = { x: -1.5, y: 0.3, z: D / 2 - 1.0 };
    const r1 = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), FMAT.rug); r1.rotation.x = -Math.PI / 2; r1.position.set(-1.5, 0.011, D / 2 - 1.0); g.add(r1);
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 24), FMAT.rugB); r2.rotation.x = -Math.PI / 2; r2.position.set(-1.5, 0.014, D / 2 - 1.0); g.add(r2);
  }
  if (own.has('statue')) { // 침대와 창문 사이 받침대
    const sx = bx + 1.05, sz = -D / 2 + 0.35;
    g.add(cyl(0.22, 0.26, 0.6, FMAT.stone, sx, 0.3, sz, 12), ball(0.16, FMAT.gold, sx, 0.78, sz), ball(0.1, FMAT.gold, sx, 1.0, sz + 0.08));
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 8), FMAT.gold); horn.position.set(sx, 1.12, sz + 0.12); horn.rotation.x = 0.5; g.add(horn);
    solid(sx, sz, 0.5, 0.5);
    furnAt.statue = { x: sx, y: 1.0, z: sz };
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
  return { group: g, solids, spots, entry: { x: W / 2 - 1.2, z: doz }, W, D, fire, furnAt };
}

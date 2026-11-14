import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from 'three';

// 브라우저 없이: 모델은 디스크에서, 캔버스(그림자·이름표·몸빼 무늬)는 빈 흉내
globalThis.fetch = async (url) => {
  const b = readFileSync(new URL(`../public/models/${url}`, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
// 캔버스 2D 흉내: 쓰는 메서드가 늘어도(이름표 다시 그리기의 clearRect 등) 깨지지 않게 모르는 메서드는 빈 함수
const ctx2d = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 60 }) }, { get: (t, k) => (k in t ? t[k] : () => {}) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

const { buildUnicoGeometry, parseUnicoBin, unicoDecoderReady, SLOTS } = await import('../src/game/unico_mesh.js');
const { Unico, loadUnicoMesh, prebuildTemplates } = await import('../src/game/unico.js');
const { SPECIES, SPECIES_IDS, VILLAGER_SPECIES, villagerName } = await import('../src/game/species.js');
const { shapeHash, speciesShape } = await import('../scripts/lib/species_shapes.mjs');
const { smin } = await import('../src/game/sdf.js');
const { VILLAGERS } = await import('../src/game/sim/villagers.js');
const { josa } = await import('../src/game/sim/josa.js');
await unicoDecoderReady;

const raw = (f) => readFileSync(new URL(`../public/models/${f}`, import.meta.url));
const load = (f) => { const b = raw(f); return parseUnicoBin(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const BIN = {};
for (const sp of SPECIES_IDS) BIN[sp] = { full: load(`villager_${sp}.bin`), lod: load(`villager_${sp}_lod.bin`) };

/** 정점 통계: 키·뒤 끝·폭·머리 반폭, 주 슬롯 %, 뼈별 가중치>0.5 정점 */
function stats(r) {
  const g = r.geometry, P = g.attributes.position.array, n = P.length / 3, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, W = r.slotWeights;
  const bones = r.meta.bones.map((b) => b[0]);
  const s = { n, top: -9, minZ: 9, minX: 9, maxX: -9, headHalfW: 0, slot: [0, 0, 0, 0, 0], own: {}, pts: {} };
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    s.top = Math.max(s.top, y); s.minZ = Math.min(s.minZ, z); s.minX = Math.min(s.minX, x); s.maxX = Math.max(s.maxX, x);
    if (y > 1.05 && y < 1.6) s.headHalfW = Math.max(s.headHalfW, Math.abs(x));
    let b = 0;
    for (let k = 1; k < 5; k++) if (W[i * 5 + k] > W[i * 5 + b]) b = k;
    s.slot[b]++;
    if (SW[i * 4] > 127) { const bn = bones[SI[i * 4]]; s.own[bn] = (s.own[bn] || 0) + 1; (s.pts[bn] ||= []).push([x, y, z]); }
  }
  s.pct = (slot) => (100 * s.slot[SLOTS.indexOf(slot)]) / n;
  return s;
}
const ST = Object.fromEntries(SPECIES_IDS.map((sp) => [sp, { full: stats(BIN[sp].full), lod: stats(BIN[sp].lod) }]));

test('주민 bin 12개: 원본·LOD 뼈대 같음, 헤더 모양 해시 = 지금 모양 (모양만 고치고 안 구우면 실패), 배율 = species.js', () => {
  for (const sp of SPECIES_IDS) {
    const { full, lod } = BIN[sp];
    assert.ok(full.meta && lod.meta, sp);
    assert.deepEqual(lod.meta.bones, full.meta.bones, `${sp} 뼈 이름·위치`);
    assert.deepEqual(lod.meta.anchors, full.meta.anchors, `${sp} 앵커 (원본·LOD 같은 meta)`);
    assert.equal(full.shapeHash, shapeHash(sp), `${sp}: npm run models:unico 로 다시 굽기`);
    assert.equal(lod.shapeHash, shapeHash(sp));
    assert.equal(full.lod, false); assert.equal(lod.lod, true);
    assert.equal(full.meta.scale, SPECIES[sp].scale, sp);
    assert.equal(full.meta.species, sp);
  }
});

test('실루엣 (원본, 스케일 전): 종마다 히어로 특징이 크게', () => {
  const f = (sp) => ST[sp].full;
  assert.ok(f('fox').top >= 1.95 && f('fox').minZ <= -0.9, '여우: 큰 귀·큰 꼬리');
  assert.ok(f('raccoon').headHalfW >= 0.46, '너구리: 볼 털로 넓은 머리');
  assert.ok(f('puppy').headHalfW >= 0.58, '강아지: 늘어진 귀로 가장 넓은 머리');
  assert.ok(f('bear').maxX - f('bear').minX >= 1.04, '곰: 가장 큰 몸');
  assert.ok(f('cat').top >= 1.8 && f('cat').minZ <= -0.7, '고양이: 뾰족 귀·물음표 꼬리');
  assert.ok(f('rabbit').top >= 2.25 && f('rabbit').top * SPECIES.rabbit.scale >= 1.91, '토끼: 아주 긴 귀');
});

test('뿔 방지: 여우·고양이 귀의 70% 높이 측면(z) 폭 0.09m 이상, 토끼 선 귀(두 마디) 0.08m 이상', () => {
  const width = (pts) => {
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1])), yc = y0 + 0.7 * (y1 - y0);
    const zs = pts.filter((p) => Math.abs(p[1] - yc) < 0.03).map((p) => p[2]);
    return Math.max(...zs) - Math.min(...zs);
  };
  for (const sp of ['fox', 'cat']) for (const ear of ['earL', 'earR']) {
    const w = width(ST[sp].full.pts[ear]);
    assert.ok(w >= 0.09, `${sp} ${ear}: ${w.toFixed(3)}`);
  }
  const w = width([...ST.rabbit.full.pts.earR, ...ST.rabbit.full.pts.earR2]);
  assert.ok(w >= 0.08, `토끼 선 귀 옆 폭 ${w.toFixed(3)} (얇은 판이면 옆에서 뿔·부리처럼 보임)`);
});

test('LOD 생존: 키·꼬리 끝이 원본과 3cm 안, 귀 뼈마다 정점 20개 이상', () => {
  for (const sp of SPECIES_IDS) {
    const { full, lod } = ST[sp];
    assert.ok(Math.abs(lod.top - full.top) <= 0.03, `${sp} top`);
    assert.ok(Math.abs(lod.minZ - full.minZ) <= 0.03, `${sp} minZ`);
    for (const ear of ['earL', 'earR']) assert.ok((lod.own[ear] || 0) >= 20, `${sp} ${ear} ${lod.own[ear]}`);
  }
});

test('귀 소유: 귀 뼈마다 정점 60개 이상, 좌우 차 3% 이하 (토끼는 접힌 귀라 10%)', () => {
  for (const sp of SPECIES_IDS) {
    const o = ST[sp].full.own;
    for (const ear of ['earL', 'earR']) assert.ok((o[ear] || 0) >= 60, `${sp} ${ear} ${o[ear]}`);
    const diff = Math.abs(o.earL - o.earR) / Math.max(o.earL, o.earR);
    assert.ok(diff <= (sp === 'rabbit' ? 0.1 : 0.03), `${sp} 좌우 ${o.earL}/${o.earR}`);
  }
  for (const ear of ['earL2', 'earR2']) assert.ok((ST.rabbit.full.own[ear] || 0) >= 60, `토끼 ${ear}`);
});

test('색 슬롯 비율: 표식이 실제로 칠해짐 (가면·반달·줄무늬·귀 안)', () => {
  const p = (sp, slot) => ST[sp].full.pct(slot);
  assert.ok(p('fox', 'maneD') >= 0.8 && p('fox', 'mane') >= 1.5, '여우 귀 끝·꼬리 끝');
  assert.ok(p('raccoon', 'maneD') >= 4, '너구리 가면·고리');
  assert.ok(p('puppy', 'maneD') >= 8, '강아지 귀·눈 얼룩');
  assert.ok(p('bear', 'mane') >= 0.95 && p('bear', 'maneD') >= 1, '곰 반달(앞면만 가는 초승달)·눈가 패치');
  assert.ok(p('cat', 'maneD') >= 3 && p('cat', 'mane') >= 0.5, '고양이 줄무늬·귀 안');
  assert.ok(p('rabbit', 'mane') >= 1 && p('rabbit', 'maneD') >= 1, '토끼 귀 안·귀 끝');
});

test('앵커: 모두 유한, 눈은 머리 중심 0.6m 안·앞쪽, 좌우 대칭', () => {
  const finite = (v) => { if (Array.isArray(v)) v.forEach(finite); else if (v && typeof v === 'object') Object.values(v).forEach(finite); else if (typeof v === 'number') assert.ok(Number.isFinite(v)); };
  for (const sp of SPECIES_IDS) {
    const m = BIN[sp].full.meta;
    finite(m.anchors); finite(m.lines); finite(m.rings); finite(m.patches); finite(m.paths);
    const L = m.anchors.eyeL.p, R = m.anchors.eyeR.p;
    for (const e of [L, R]) { assert.ok(Math.hypot(...e) < 0.6, sp); assert.ok(e[2] > 0.2, sp); }
    assert.ok(Math.abs(Math.abs(L[0]) - Math.abs(R[0])) < 0.01 && Math.abs(L[1] - R[1]) < 0.01, `${sp} 눈 대칭`);
    assert.ok(L[0] < 0 && R[0] > 0);
    assert.ok(m.anchors.nose.p[2] > 0.3, `${sp} 코는 앞`);
    assert.ok(m.lines.mouth.length >= 1 && m.lines.mouth.every((l) => l.length >= 2));
    assert.ok(m.top > 1.5);
  }
});

// ---- 런타임 (Unico) ----
await loadUnicoMesh('unico_body_lod.bin', 'quad_lod'); // 네 발 원본(unico_body.bin)은 나중 받기 — 아래 KOAT 테스트에서
for (const sp of SPECIES_IDS) await loadUnicoMesh(`villager_${sp}_lod.bin`, `v_${sp}_lod`);
const camAt = (d) => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 1.4, d); return c; };

test('생성: LOD 만 있어도 바로 보임 → 원본이 오면 화면 밖·LOD 일 때 지오메트리만 교체 (같은 뼈대). 메시가 없으면 유니콘 대체', async () => {
  const u = new Unico(null, { species: 'fox' });
  assert.equal(u.species.id, 'fox');
  assert.equal(u.rig, 'v_fox');
  assert.equal(u.skin.geometry.attributes.position, u.skinLod.geometry.attributes.position, '원본 전에는 같은 LOD 몸');
  assert.ok(u.skin.visible);
  assert.equal(u.root.scale.x, SPECIES.fox.scale);
  const sk = u.skeleton, nb = sk.bones.length, g0 = u.skin.geometry;
  await loadUnicoMesh('villager_fox.bin', 'v_fox');
  u.update(1 / 60, camAt(5));
  assert.equal(u.skin.geometry, g0, '가까이 보이는 동안은 바꾸지 않음 (깜빡임 방지)');
  u.update(1 / 60, camAt(30)); // 멀어서 LOD 로 보이는 동안 → 교체
  assert.notEqual(u.skin.geometry, g0);
  assert.notEqual(u.skin.geometry.attributes.position, u.skinLod.geometry.attributes.position);
  assert.equal(u.skin.skeleton, sk);
  assert.equal(u.skeleton.bones.length, nb);
  assert.equal(u.skin.geometry.attributes.skinIndex.count, u.skin.geometry.attributes.position.count);
  // 원본이 먼저 와 있으면 처음부터 원본
  const u2 = new Unico(null, { species: 'fox' });
  assert.equal(u2.skin.geometry, u.skin.geometry);
  // 받지 못한 종 → 예전 유니콘 주민 (예외 없음)
  SPECIES.ghost = { ...SPECIES.fox, id: 'ghost' };
  const warn = console.warn;
  try {
    console.warn = () => {};
    const f = new Unico(null, { species: 'ghost', palette: 'merchant' });
    assert.equal(f.species, null);
    assert.equal(f.rig, 'quad');
    assert.equal(f.biped, false);
  } finally { console.warn = warn; delete SPECIES.ghost; }
  for (const sp of SPECIES_IDS) await loadUnicoMesh(`villager_${sp}.bin`, `v_${sp}`);
});

test('KOAT 네 발 유니콘: 원본이 늦게 와도 저해상도로 시작 (생성은 늘 동기) → 오면 같은 뼈대에 원본으로', async () => {
  const u = new Unico(null, { palette: 'koat_desk' });
  assert.equal(u.rig, 'quad');
  assert.ok(u._wantFull, '원본 전에는 저해상도로 시작하고 원본을 기다림');
  assert.equal(u.skin.geometry.attributes.position, u.skinLod.geometry.attributes.position, '원본 전에는 같은 저해상도 몸');
  assert.ok(u.skin.visible);
  const sk = u.skeleton, nLod = u.skinLod.geometry.attributes.position.count;
  await loadUnicoMesh('unico_body.bin', 'quad');
  u.update(1 / 60, camAt(5));
  assert.ok(u._wantFull, '가까이 보이는 동안은 그대로');
  u.update(1 / 60, camAt(30)); // 멀어서 저해상도로 보이는 동안 교체
  assert.equal(u.isLod, true);
  assert.ok(!u._wantFull);
  assert.ok(u.skin.geometry.attributes.position.count > nLod, '원본 몸');
  assert.equal(u.skin.skeleton, sk);
  assert.equal(u.skinLod.geometry.attributes.position.count, nLod, '저해상도 몸은 그대로');
  const u2 = new Unico(null, { palette: 'merchant' });
  assert.ok(!u2._wantFull, '원본이 있으면 바로 원본');
});

test('스프링: 무작위 dt(1/60~0.5)·방향·모든 동작 10초 → 귀·꼬리 회전 유한, 1.3rad 안', () => {
  const acts = ['count', 'earflick', 'rub', 'goggle', 'tilt', 'wag', 'backpat', 'nod', 'groom', 'stretch', 'hop', 'nose', 'startle', 'cheer', 'wave', 'talk', 'think', 'present', 'lab', 'megaphone', 'net', 'fishwait', 'reel', 'heart'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const sp of SPECIES_IDS) {
    const u = new Unico(null, { species: sp });
    u.labelAlways = true; // 매 프레임 계산
    let t = 0, k = 0;
    while (t < 10) {
      const dt = 1 / 60 + rnd() * (0.5 - 1 / 60);
      t += dt;
      if (rnd() < 0.15) u.playAction(acts[k++ % acts.length], 0.5 + rnd() * 2);
      if (rnd() < 0.3) u.facing = rnd() * 6.2 - 3.1;
      u.moving = rnd() < 0.5;
      if (u.moving) u.group.position.x += dt * 3;
      u.attention = rnd(); u.hearts = Math.floor(rnd() * 6); u.attnYaw = rnd() - 0.5;
      u.update(dt, camAt(6));
      for (const b of [...u.earChain.flat(), ...u.tailChain]) for (const ax of ['x', 'y', 'z']) {
        const v = b.rotation[ax];
        assert.ok(Number.isFinite(v) && Math.abs(v) < 1.3, `${sp} ${b.name}.${ax} = ${v}`);
      }
      assert.ok(Number.isFinite(u.bodyG.position.y));
    }
  }
});

test('표정·말하기: 행복이면 ^^ 눈, 말하는 동안 입이 열렸다 닫힘, 곰은 대기 중 자주 ^^', () => {
  const u = new Unico(null, { species: 'puppy' });
  u.playAction('heart', 1);
  u.update(1 / 60, camAt(5));
  assert.equal(u.eyesHappy.visible, true);
  assert.equal(u.eyesG.visible, false);
  assert.equal(u.mouthOpenNow, true, '하트: 웃으며 입 벌림');
  assert.equal(u.faceM.geometry, u._faceGeo[1]);
  u.clearAction();
  u.speak(2);
  const seen = new Set(), geos = new Set();
  for (let i = 0; i < 30; i++) { u.update(1 / 60, camAt(5)); seen.add(u.mouthOpenNow); geos.add(u.faceM.geometry); }
  assert.deepEqual([...seen].sort(), [false, true], '8Hz 로 열고 닫음');
  assert.equal(geos.size, 2, '입은 얼굴 메시의 지오메트리(그릴 범위)만 바꿈 — 그리기 수 그대로');
  // 두 입 지오메트리는 같은 버퍼: 닫힌 입 = [닫힌 선 + 얼굴], 벌린 입 = [얼굴 + 벌린 입] (닫힌 선은 안 그림)
  const [shut, wide] = u._faceGeo;
  assert.equal(shut.attributes.position, wide.attributes.position);
  assert.equal(shut.index, wide.index);
  assert.ok(wide.drawRange.start > 0 && shut.drawRange.start === 0);
  assert.ok(wide.drawRange.start < shut.drawRange.count, '얼굴 부분은 두 범위가 함께 그림');
  assert.equal(wide.drawRange.start + wide.drawRange.count, shut.index.count, '벌린 입은 버퍼 끝까지');
});

test('곰 할머니 대기: 대부분 ^^ 눈웃음이지만 입은 다묾 (말할 때만 입이 움직이고 눈은 뜸)', () => {
  // 눈웃음은 3~6초마다 70% 확률로 다시 뽑음 → 60초(약 13번)면 우연히 절반 밑일 수 있어 난수를 고정 (테스트가 가끔 실패하지 않게)
  const rnd = Math.random;
  let seed = 12345;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bear = new Unico(null, { species: 'bear' });
  let happy = 0, mouth = 0;
  try { for (let i = 0; i < 1200; i++) { bear.update(1 / 20, camAt(5)); if (bear.eyesHappy.visible) happy++; if (bear.mouthOpenNow) mouth++; } } finally { Math.random = rnd; }
  assert.ok(happy > 600, `곰 ^^ ${happy}/1200`);
  assert.equal(mouth, 0, `대기 중 입 벌림 ${mouth}/1200`);
  bear.speak(3);
  let open = 0, eyes = 0;
  for (let i = 0; i < 40; i++) { bear.update(1 / 60, camAt(5)); if (bear.mouthOpenNow) open++; if (bear.eyesG.visible) eyes++; }
  assert.ok(open > 5 && open < 35, `말하기 ${open}/40`);
  assert.equal(eyes, 40, '말할 때는 눈을 뜸');
  bear.speak(0); // 말 끝
  bear.playAction('backpat', 2);
  bear.update(1 / 60, camAt(5));
  assert.equal(bear.eyesHappy.visible, true);
  assert.equal(bear.mouthOpenNow, false, '허리 두드리기: 눈웃음 + 다문 입');
});

test('그리기 수: 가까운(5m) 높음 품질 동물 주민의 보이는 (메시 × 재질 그룹) 12 이하', () => {
  Unico.setQuality('high');
  try {
    for (const sp of SPECIES_IDS) {
      const u = new Unico(null, { species: sp, name: '이름' });
      u.update(1 / 60, camAt(5));
      let draws = 0;
      u.group.traverseVisible((o) => { if (o.isMesh || o.isSprite) draws += Array.isArray(o.material) ? o.geometry.groups.length : 1; });
      assert.ok(draws <= 12, `${sp}: ${draws}`);
    }
  } finally { Unico.setQuality(null); }
});

test('이름표 높이: 종은 키에 맞춰 (최소 2.0), 유니콘은 예전 값', () => {
  for (const sp of SPECIES_IDS) {
    const u = new Unico(null, { species: sp, name: 'x' });
    assert.ok(u.labelY >= 2 && u.labelY <= 2.6, `${sp} ${u.labelY}`);
    assert.equal(u.label.position.y, u.labelY);
    assert.ok(Math.abs(u.emoteY - u.labelY - 0.3) < 1e-9 && Math.abs(u.bubbleY - u.labelY - 0.7) < 1e-9);
  }
  assert.equal(new Unico(null, { palette: 'merchant', name: 'x' }).label.position.y, 2.55);
});

test('데이터: 3D 이름·종 매핑, 도트판 이름은 그대로(유니코), 조사', async () => {
  const NAMES = { merchant: '장터 여우', researcher: '연구원 너구리', guide: '안내 강아지', granny: '곰 할머니', fisher: '낚시꾼 고양이', kid: '꼬마 토끼' };
  const { PALETTES } = await import('../src/game/unico.js');
  for (const [id, name] of Object.entries(NAMES)) {
    assert.equal(villagerName(id), name);
    assert.ok(SPECIES[VILLAGER_SPECIES[id]], id);
    assert.ok(PALETTES[id], `${id}: 대체 유니콘 팔레트`);
    assert.ok(VILLAGERS[id].name.endsWith('유니코'), `${id}: 도트판 이름은 바꾸지 않음`);
    assert.equal(josa(name, '와/과'), '와');
  }
  assert.equal(new Set(Object.values(VILLAGER_SPECIES)).size, 6, '6명 모두 다른 종');
  // 3D 배치(LAYOUT)에 종·이름을 적었다면 species.js 와 같아야 함 (예전 유니코 이름이면 아직 안 옮긴 것)
  const { LAYOUT } = await import('../src/game/world.js');
  for (const [id, n] of Object.entries(LAYOUT.npcs)) {
    assert.ok(VILLAGER_SPECIES[id], id);
    if (n.species) assert.equal(n.species, VILLAGER_SPECIES[id], id);
    if (!n.name.endsWith('유니코')) assert.equal(n.name, villagerName(id), id);
  }
});

// 상한은 지금 굽기(주민 532KB · 첫 화면 캐릭터 456KB · 캐릭터 전체 802KB)의 약 +5% — 몰래 커지면 바로 잡힘
test('예산 (gzip 9, 배포 precompress 와 같은 방법)', () => {
  const gz = (f) => gzipSync(raw(f), { level: 9 }).length;
  const v = SPECIES_IDS.flatMap((sp) => [`villager_${sp}.bin`, `villager_${sp}_lod.bin`]);
  const vill = v.reduce((a, f) => a + gz(f), 0);
  assert.ok(vill <= 560e3, `주민 12개 ${vill}`);
  const first = ['unico_biped.bin', 'unico_biped_lod.bin', 'unico_body_lod.bin', ...SPECIES_IDS.map((sp) => `villager_${sp}_lod.bin`), 'villager_puppy.bin', 'villager_rabbit.bin'];
  const fs = first.reduce((a, f) => a + gz(f), 0);
  assert.ok(fs <= 480e3, `첫 화면 캐릭터 ${fs}`);
  const all = vill + ['unico_body.bin', 'unico_biped.bin', 'unico_body_lod.bin', 'unico_biped_lod.bin'].reduce((a, f) => a + gz(f), 0);
  assert.ok(all <= 840e3, `캐릭터 전체 ${all}`);
});

test('클라이언트 격리: src/ 는 굽기 전용 모양 모듈(species_shapes)을 import 하지 않음', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(m?js|html)$/.test(f) ? [p] : []; });
  const root = new URL('../src', import.meta.url).pathname;
  for (const f of walk(root)) assert.ok(!/(import\s[^;]*|import\(\s*)['"][^'"]*species_shapes/.test(readFileSync(f, 'utf8')), f);
});

test('유니콘 회귀: sdf.js 로 옮겨도 네 발 몸 굽기 결과가 바이트 그대로', () => {
  const r = buildUnicoGeometry(0.06, 'quad');
  const h = createHash('sha256'), g = r.geometry;
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) h.update(Buffer.from(g.attributes[k].array.buffer));
  h.update(Buffer.from(new Uint32Array(g.index.array).buffer));
  h.update(Buffer.from(r.slotWeights.buffer));
  assert.equal(h.digest('hex'), 'dd2bf824d8a6076a423d1c1eb7bc9c6bf7863e8eedd0d6e4e6b50cc002c8270e');
});

test('옷 고리: 꼬리·팔을 감싸지 않고 몸에 붙음 (허리띠·몸빼·스카프·머리띠)', () => {
  for (const sp of SPECIES_IDS) for (const [k, r] of Object.entries(BIN[sp].full.meta.rings)) {
    for (const p of r.pts ?? r.loops.flat()) assert.ok(Math.hypot(p[0], p[2]) < 0.6, `${sp} ${k}: ${p}`);
  }
});

test('몸빼 바지: 곰 할머니 바짓가랑이는 다리 뼈를 따라 걸음 (같은 뼈대, 그리기 1번)', () => {
  const u = new Unico(null, { species: 'bear' });
  assert.ok(u.momppe?.isSkinnedMesh);
  assert.equal(u.momppe.skeleton, u.skeleton);
  const names = u.skeleton.bones.map((b) => b.name), si = u.momppe.geometry.attributes.skinIndex.array, used = new Set();
  for (let i = 0; i < si.length; i += 4) used.add(names[si[i]]);
  assert.deepEqual([...used].sort(), ['body', 'legL', 'legR']);
  // 다리를 앞으로 차면 그 다리 쪽 바짓가랑이 아래 끝이 앞으로 감
  const P = u.momppe.geometry.attributes.position, v = new THREE.Vector3();
  const hemR = [];
  for (let i = 0; i < P.count; i++) if (names[si[i * 4]] === 'legR' && P.getY(i) < 0.11) hemR.push(i);
  assert.ok(hemR.length >= 16);
  const meanZ = () => hemR.reduce((a, i) => a + u.momppe.getVertexPosition(i, v).z, 0) / hemR.length;
  u.root.updateMatrixWorld(true); u.skeleton.update();
  const z0 = meanZ();
  u.boneMap.legR.rotation.x = -0.6;
  u.root.updateMatrixWorld(true); u.skeleton.update();
  assert.ok(Math.abs(meanZ() - z0) > 0.05, `${z0} → ${meanZ()}`);
  for (const sp of ['fox', 'cat', 'rabbit']) assert.equal(new Unico(null, { species: sp }).momppe, undefined);
});

test('초상화: 6종 × 감정 6개 → 말할 때 입(p2-mo), 행복이 아니면 깜빡이는 눈(p2-eye), 곰은 기본 ^^', async () => {
  const { speciesSVG, moodOf, PORTRAIT_SPECIES } = await import('../src/ui/portrait_species.js');
  assert.deepEqual([...PORTRAIT_SPECIES].sort(), [...SPECIES_IDS].sort());
  for (const sp of SPECIES_IDS) for (const e of [undefined, 'talk', 'heart', 'think', 'startle', 'wave']) {
    const s = speciesSVG(sp, '#f28c28', e, 't_');
    assert.ok(s.includes('p2-mo') && s.includes('p2-mc'), `${sp} ${e}: 말하는 입`);
    assert.ok(!/NaN|undefined/.test(s), `${sp} ${e}`);
    assert.ok(s.includes('url(#t_sh)') && s.includes('url(#t_bg)'), 'id 접두어');
    if (moodOf(sp, e) === 'happy') assert.ok(s.includes('p2-hp') && !s.includes('p2-eye'), `${sp} ${e}: ^^`);
    else assert.ok(s.includes('p2-eye'), `${sp} ${e}: 깜빡이는 눈`);
    assert.ok(s.length < 9000, `${sp} ${e}: ${s.length}B`);
  }
  assert.equal(moodOf('bear', undefined), 'happy', '곰 할머니 기본 ^^');
  assert.equal(moodOf('bear', 'talk'), 'happy');
  assert.equal(moodOf('bear', 'startle'), 'startle');
  assert.equal(moodOf('fox', undefined), 'normal');
  assert.equal(moodOf('puppy', 'heart'), 'happy');
  assert.ok(speciesSVG('rabbit', '#f28bb0', undefined, 'r_').includes('p2-nose'), '토끼 코 씰룩');
  assert.ok(speciesSVG('cat', '#3a7bd5', undefined, 'c_').includes('p2-ear'), '귀 움직임');
  assert.equal(speciesSVG('ghost', '#000000', undefined), '');
});

await loadUnicoMesh('unico_biped_lod.bin', 'biped_lod'); // 아래 유니코(두 발) 비교용

test('발 그림자: 종 배율(토끼 0.85)이 두 번 곱해지지 않고 발 밑에 (루트 좌표 = 다리 뼈 x)', () => {
  for (const sp of SPECIES_IDS) {
    const u = new Unico(null, { species: sp });
    u.legs.forEach((leg, i) => {
      const want = leg.position.x + u.bodyG.position.x;
      assert.ok(Math.abs(u.footShadows[i].position.x - want) < 1e-6, `${sp} ${leg.name}: ${u.footShadows[i].position.x} != ${want}`);
    });
  }
  const p = new Unico(null, { rig: 'biped' }); // 유니코(배율 1)는 예전과 같은 자리
  p.legs.forEach((leg, i) => assert.ok(Math.abs(p.footShadows[i].position.x - (leg.position.x + p.bodyG.position.x)) < 1e-6));
});

test('색 경계 또렷하게: 주민만 슬롯 가중치를 2.2 제곱 → 섞인 정점이 주 색 쪽으로, 유니콘(ao 없음)은 예전 색 그대로', async () => {
  const { colorAttribute } = await import('../src/game/unico_mesh.js');
  const w = new Uint8Array([153, 102, 0, 0, 0]); // 0.6 / 0.4
  const pal = { body: 0xff0000, snout: 0x0000ff, mane: 0, maneD: 0, hoof: 0 };
  const soft = colorAttribute(w, pal).array, sharp = colorAttribute(w, pal, { sharp: true }).array;
  assert.ok(sharp[0] > soft[0] && sharp[2] < soft[2], `빨강 ${soft[0]}→${sharp[0]}, 파랑 ${soft[2]}→${sharp[2]}`);
  const one = new Uint8Array([255, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(colorAttribute(one, pal, { sharp: true }).array), Array.from(colorAttribute(one, pal).array), '한 색뿐이면 같음');
});

test('몸빼: 바짓가랑이 바깥쪽·엉덩이 고리가 몸(팔 빼고) 표면 밖 — 털이 바지를 뚫고 나오지 않음', () => {
  const S = speciesShape('bear'), P = S.P.filter((q) => !/^(arm|ear|tail)/.test(q.bone));
  const sdf = (x, y, z) => { let d = P[0].f(x, y, z); for (let i = 1; i < P.length; i++) d = smin(d, P[i].f(x, y, z), P[i].k); return d; };
  const u = new Unico(null, { species: 'bear' });
  const M = u.momppe.geometry.attributes.position, SI = u.momppe.geometry.attributes.skinIndex, names = u.skeleton.bones.map((b) => b.name);
  const fit = BIN.bear.full.meta.limbs.leg.fit;
  assert.ok(fit && fit.r.length === fit.ys.length && fit.r.every((r) => r.length === 16), '구운 바짓가랑이 맞춤');
  const cnt = { hip: [0, 0], leg: [0, 0] };
  const nHip = BIN.bear.full.meta.rings.momppe.loops.length * 17; // 엉덩이 고리 (16점 + 이음매) — 맨 앞
  for (let i = 0; i < M.count; i++) {
    const x = M.getX(i), y = M.getY(i), z = M.getZ(i), b = names[SI.getX(i)];
    const k = i < nHip ? 'hip' : b !== 'body' && Math.abs(x) >= 0.14 && y > 0.16 ? 'leg' : null;
    if (!k) continue;
    cnt[k][0]++; if (sdf(x, y, z) > 0) cnt[k][1]++;
  }
  for (const [k, [n, out]] of Object.entries(cnt)) assert.ok(out / n >= 0.95, `${k}: ${out}/${n} 밖`);
});

test('만세: 주민은 손이 머리 타원 밖 옆으로 (V 실루엣, 머리를 뚫지 않음)', () => {
  const cam = camAt(6), hc = new THREE.Vector3(), h = new THREE.Vector3();
  for (const sp of SPECIES_IDS) {
    const u = new Unico(null, { species: sp });
    u.playAction('cheer', 3);
    for (let t = 0; t < 1.05; t += 1 / 30) u.update(1 / 30, cam);
    u.root.updateMatrixWorld(true);
    const R = BIN[sp].full.meta.head, k = u.scale;
    u.headG.getWorldPosition(hc).add(new THREE.Vector3(...R.c).multiplyScalar(k));
    for (const [arm, sx] of [[u.arms[0], -1], [u.arms[1], 1]]) {
      arm.localToWorld(h.set(sx * 0.16, -0.34, 0.045));
      const e = Math.hypot((h.x - hc.x) / (R.r[0] * k), (h.y - hc.y) / (R.r[1] * k), (h.z - hc.z) / (R.r[2] * k));
      assert.ok(e > 1.25, `${sp}: 손이 머리 가까이 (${e.toFixed(2)})`);
      assert.ok(Math.abs(h.x) > 0.45 * k + 0.02, `${sp}: 손이 옆으로 (${h.x.toFixed(2)})`);
    }
  }
});

test('템플릿 미리 만들기: 닉네임 고르는 동안 한 번에 하나씩 (한가할 때), 두 번째는 할 일 없음', async () => {
  let n = 0;
  await prebuildTemplates(async () => { n++; });
  let m = 0;
  await prebuildTemplates(async () => { m++; });
  assert.equal(m, 0, '이미 만든 템플릿은 건너뜀');
  for (const sp of SPECIES_IDS) assert.ok(new Unico(null, { species: sp }).faceM, sp);
  assert.ok(n >= 0);
});

test('고양이 눈: 호박색 홍채는 눈 안 (검은 눈보다 작게, 앞에) + 세로 동공 — 눈 밖 금테처럼 안 보이게', () => {
  const F = SPECIES.cat.face;
  assert.ok(F.irisR < F.eye.r * 0.9 && F.irisR > F.eye.r * 0.75, '테두리 1cm 안팎');
  assert.ok(F.pupil && F.pupil.s[0] < F.pupil.s[1], '세로로 긴 동공');
});

test('대화 구도: 다른 캐릭터·건물이 카메라→시선 선을 가리면 옆 구도로, 얼굴이 대화창 위(화면 위 30%)에, 카메라 가까운 캐릭터는 이름표 숨김', async () => {
  const { NPCs } = await import('../src/game/view/npcs.js');
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  camera.position.set(0, 4, 14);
  const mk = (x, z) => { const u = new Unico(null, { species: 'cat' }); u.group.position.set(x, 0, z); return u; };
  const speaker = { u: mk(1.2, 0) }, a = { x: -0.6, z: 0 }, b = { x: 1.2, z: 0 };
  const self = Object.assign(Object.create(NPCs.prototype), { game: { camera }, list: [speaker] });
  const free = self.talkCamera(a, b, speaker);
  // 가로 화면: 두 사람 얼굴 가운데(1.3m)가 화면 위 30% 안, 머리 끝(2m)은 위 HUD(8%) 아래 — 선택지 6개 대화창(아래 64%)에 안 가림
  const cam2 = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  cam2.position.set(...free.pos); cam2.lookAt(...free.look); cam2.updateMatrixWorld();
  for (const p of [a, b]) {
    const face = (1 - new THREE.Vector3(p.x, 1.3, p.z).project(cam2).y) / 2, top = (1 - new THREE.Vector3(p.x, 2.0, p.z).project(cam2).y) / 2;
    assert.ok(face < 0.3 && top > 0.08, `얼굴 ${face.toFixed(2)} · 머리 끝 ${top.toFixed(2)} (화면 위에서)`);
  }
  assert.ok(free.clear === Infinity);
  // 기본 구도 카메라와 두 사람 사이에 KOAT 담당이 서 있음 → 다른 구도
  const mid = new THREE.Vector3((free.pos[0] + free.look[0]) / 2, 0, (free.pos[2] + free.look[2]) / 2);
  const block = mk(mid.x, mid.z);
  self.game.koat = { booths: [{ npc: block }], desk: null };
  const s2 = self.talkCamera(a, b, speaker);
  assert.ok(s2.clear >= 1.2, `가리지 않는 구도 (${s2.clear.toFixed(2)})`);
  assert.notDeepEqual(s2.pos, free.pos);
  assert.ok(s2.near.includes(block) || Math.hypot(block.group.position.x - s2.pos[0], block.group.position.z - s2.pos[2]) >= 6, '카메라 6m 안이면 이름표 숨김 목록에');
  // 건물(상자)이 기본 구도 카메라 앞을 막으면 다른 구도
  self.game.koat = null;
  const p0 = free.pos, q = { x0: (p0[0] + mid.x) / 2 - 0.6, x1: (p0[0] + mid.x) / 2 + 0.6, z0: (p0[2] + mid.z) / 2 - 0.6, z1: (p0[2] + mid.z) / 2 + 0.6 };
  self.game.world = { obstacles: [], boxes: [q] };
  const s3 = self.talkCamera(a, b, speaker);
  assert.equal(s3.block, 0, '건물을 지나지 않는 구도');
  assert.notDeepEqual(s3.pos, free.pos);
});

test('내 이름표: 바로 뒤에 선 주민(5m 안, 12° 안)을 가리면 흐리게, 비키면 다시 또렷하게', async () => {
  const { NPCs } = await import('../src/game/view/npcs.js');
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  const player = new Unico(null, { rig: 'biped', name: '나' });
  player.labelAlways = true;
  const npc = new Unico(null, { species: 'fox' });
  const self = Object.assign(Object.create(NPCs.prototype), { game: { player: { unico: player }, followCam: { camera } }, list: [{ u: npc }] });
  player.group.position.set(0, 0, 0); camera.position.set(0, 4.5, 8); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  npc.group.position.set(0, 0, -3); // 카메라→나 연장선 위, 내 뒤
  for (let i = 0; i < 60; i++) self._fadePlayerLabel(1 / 30, player.group.position);
  assert.ok(Math.abs(player.label.material.opacity - 0.35) < 0.02, `흐리게 ${player.label.material.opacity}`);
  npc.group.position.set(1.6, 0, -2); // 옆으로 비킴 (12° 안이지만 화면에서 얼굴·이름표가 내 이름표에 안 겹침)
  for (let i = 0; i < 60; i++) self._fadePlayerLabel(1 / 30, player.group.position);
  assert.ok(player.label.material.opacity > 0.98, `${player.label.material.opacity}`);
  npc.group.position.set(4, 0, -2);
  for (let i = 0; i < 60; i++) self._fadePlayerLabel(1 / 30, player.group.position);
  assert.ok(player.label.material.opacity > 0.98);
});

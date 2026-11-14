import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { Assets, mergeSiblings, skinSpheres, ANIMATED_MODELS, DEFERRED_MODELS } from '../src/game/assets.js';
import { RanchView } from '../src/game/view/ranch_view.js';
import { releaseRig } from '../src/game/view/pests.js';
import { modelQuery } from '../src/game/fetch_gz.js';
import viteConfig, { modelVersions } from '../vite.config.js';

const root = new URL('../', import.meta.url);

/** 뼈 2개로 굽혀지는 막대 (뼈대 동물 대신) */
function rig() {
  const geo = new THREE.CylinderGeometry(0.2, 0.2, 2, 6, 4).translate(0, 1, 0);
  const n = geo.attributes.position.count, si = [], sw = [];
  for (let i = 0; i < n; i++) { const top = geo.attributes.position.getY(i) > 1; si.push(top ? 1 : 0, 0, 0, 0); sw.push(1, 0, 0, 0); }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const b0 = new THREE.Bone(), b1 = new THREE.Bone();
  b1.position.y = 1; b0.add(b1);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  const scene = new THREE.Group();
  scene.position.set(30, 0, 0); // 원점이 아닌 곳에서 받아도 구는 메시 기준
  scene.add(b0, mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([b0, b1]));
  return { scene, mesh, b1 };
}

test('뼈대 동물: 넉넉한 컬링 구를 받을 때 한 번 잡고, 복제본은 화면 밖에서 그리지 않음', () => {
  const { scene, mesh } = rig();
  skinSpheres(scene, 1);
  const r1 = mesh.boundingSphere.radius;
  assert.ok(r1 > 1 && r1 < 1.3, `기본 자세 구는 막대 길이의 절반 남짓 (${r1.toFixed(2)})`);
  skinSpheres(scene);
  const r = mesh.boundingSphere.radius;
  assert.ok(Math.abs(r - r1 * 1.5) < 1e-6, '1.5배로 넓힘');
  assert.ok(mesh.boundingSphere.center.distanceTo(new THREE.Vector3(0, 1, 0)) < 0.3, '구 중심은 메시 기준 (받은 위치 30m 와 무관)');
  const a = new Assets();
  a.scenes.set('stick', scene); a.anims.set('stick', []);
  const c = a.cloneAnimated('stick');
  const sk = c.root.getObjectsByProperty('isSkinnedMesh', true)[0];
  assert.equal(sk.frustumCulled, true);
  assert.equal(sk.boundingSphere.radius, r, '복제본이 구를 그대로 씀');
  assert.notEqual(sk.boundingSphere, mesh.boundingSphere, '구는 복제 (한 마리를 바꿔도 다른 마리는 그대로)');
  assert.notEqual(sk.skeleton, mesh.skeleton);
  // 끝 뼈를 90° 굽혀도 굽힌 자세가 넓힌 구 안에 듦
  const b = sk.skeleton.bones[1];
  b.rotation.z = Math.PI / 2;
  c.root.updateMatrixWorld(true);
  const keep = sk.boundingSphere;
  sk.boundingSphere = null; sk.computeBoundingSphere();
  const cur = sk.boundingSphere; sk.boundingSphere = keep;
  assert.ok(cur.center.distanceTo(keep.center) + cur.radius <= keep.radius, '움직인 자세도 구 안');
  // 치울 때 뼈 텍스처·동작 캐시 해제 (지오메트리·재질은 원본과 공유라 그대로)
  let boneTexDisposed = 0;
  sk.skeleton.boneTexture = new THREE.DataTexture(new Float32Array(16), 2, 2, THREE.RGBAFormat, THREE.FloatType);
  sk.skeleton.boneTexture.addEventListener('dispose', () => boneTexDisposed++);
  let geoDisposed = 0;
  sk.geometry.addEventListener('dispose', () => geoDisposed++);
  releaseRig(c);
  assert.equal(boneTexDisposed, 1);
  assert.equal(sk.skeleton.boneTexture, null);
  assert.equal(geoDisposed, 0);
});

test('부품 합치기: 인덱스를 유지해 공유 정점을 다시 쓰고, 인덱스 없는 부품과도 함께 합쳐짐', () => {
  const parent = new THREE.Group();
  const mat = () => new THREE.MeshStandardMaterial({ color: 0x88aa44, roughness: 0.8, name: 'wood' });
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat());
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat()); b.position.x = 2;
  const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), mat()); c.position.x = 4;
  parent.add(a, b, c);
  const sc = new THREE.Group(); sc.add(parent);
  assert.equal(mergeSiblings(sc), 2);
  const m = parent.children.find((o) => o.name.endsWith('_merged'));
  assert.ok(m.geometry.index, '합친 메시도 인덱스');
  assert.equal(m.geometry.attributes.position.count, 24 + 24 + 36, '인덱스 상자는 정점 24개 그대로 (전에는 36개씩)');
  assert.equal(m.geometry.index.count, 36 * 3);
  assert.equal(m.geometry.attributes.color.count, m.geometry.attributes.position.count);
});

test('첫 화면 모델 줄이기: 목장 구경 동물·늑대·여우는 입장 뒤에 받고, 도착한 것만 풀어 놓음', async () => {
  const later = DEFERRED_MODELS.flat();
  for (const n of ['q_horse', 'q_donkey', 'q_alpaca', 'q_wolf', 'q_fox']) {
    assert.ok(later.includes(n), n);
    assert.ok(!ANIMATED_MODELS.includes(n), `${n} 은 첫 화면 목록에서 빠짐`);
  }
  assert.ok(DEFERRED_MODELS[0].includes('q_horse'), '구경 동물이 먼저');
  // loadDeferred: 여러 번 불러도 한 번만, 묶음 순서대로, 실패해도 끝남
  const a = new Assets(), order = [];
  a._loadAnimated = async (n) => { order.push(n); if (n !== 'q_fox') a.scenes.set(n, new THREE.Group()); };
  a._loadDeferredSkins = async () => {}; // 캐릭터 원본 몸은 tests/species_load.test.js 에서
  await Promise.all([a.loadDeferred(), a.loadDeferred()]);
  assert.deepEqual(order, later);
  assert.equal(a.deferredDone, true);
  assert.equal(a.has('q_fox'), false, '실패한 모델은 없는 것으로 (쓰는 쪽이 건너뜀)');
  // addVisitors: 도착한 종만, 종마다 한 마리
  const have = new Set(['q_horse']);
  const fake = { game: { assets: { has: (n) => have.has(n) } }, visitors: [], _all: [], _spawn: (model) => ({ model }) };
  assert.equal(RanchView.prototype.addVisitors.call(fake), 1);
  assert.equal(fake._all, null, '함께 움직이는 동물 목록 다시 만듦');
  assert.equal(RanchView.prototype.addVisitors.call(fake), 0);
  have.add('q_donkey'); have.add('q_alpaca');
  assert.equal(RanchView.prototype.addVisitors.call(fake), 2);
  assert.deepEqual(fake.visitors.map((e) => e.model), ['q_horse', 'q_donkey', 'q_alpaca']);
});

test('늦게 온 구경 동물: 플레이어 옆·카메라 화면 안에는 나타나지 않고, 숨을 자리가 없으면 다음에', () => {
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600);
  const added = [];
  const game = {
    world: { isBlocked: () => false, scene: { add: (m) => added.push(m) } },
    assets: { has: () => true, anims: new Map(), clone: () => new THREE.Group() },
    camera: cam,
  };
  const rv = Object.assign(Object.create(RanchView.prototype), { game, taken: [], visitors: [], _all: [] });
  const look = (px, pz, cx, cy, cz) => { cam.position.set(cx, cy, cz); cam.lookAt(px, 0, pz); cam.updateMatrixWorld(); };
  const fr = () => new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  // 목장 가운데에서 동쪽을 바라봄 (따라가는 카메라처럼 뒤·위에서)
  const pp = new THREE.Vector3(22, 0, 2);
  look(30, 2, 16, 6, 2);
  let placed = 0;
  for (let i = 0; i < 30; i++) {
    rv.taken.length = 0;
    const e = rv._spawn('q_horse', 1, pp, true);
    if (!e) continue;
    placed++;
    const { x, z } = e.m.position;
    assert.ok(Math.hypot(x - pp.x, z - pp.z) >= 8, `플레이어에게서 8m 밖 (${x.toFixed(1)}, ${z.toFixed(1)})`);
    assert.ok(!fr().intersectsSphere(new THREE.Sphere(new THREE.Vector3(x, 0.875, z), 1.75)), '화면 밖');
  }
  assert.ok(placed >= 15, `등 뒤 빈자리는 찾음 (${placed}/30)`);
  // 위에서 목장 전체를 내려다보면 숨을 자리가 없음 → strict 는 null, 아니면 플레이어에게서 가장 먼 자리
  look(22, 2, 22, 120, 2.1);
  rv.taken.length = 0;
  assert.equal(rv._spawn('q_horse', 1, pp, true), null);
  const far = rv._spawn('q_horse', 1, pp, false);
  assert.ok(Math.hypot(far.m.position.x - pp.x, far.m.position.z - pp.z) > 8);
  // 입장 전(생성자)에는 어디든
  assert.ok(rv._spawn('q_horse', 1));
  // addVisitors: 숨을 자리가 없으면 기다렸다가, 오래 못 찾으면 가장 먼 자리에 풀어 놓음
  Object.assign(rv, { taken: [], visitors: [], _visWait: 0 });
  let n = 0, polls = 0;
  while (!n && polls < 30) { n = rv.addVisitors(pp); polls++; }
  assert.equal(n, 3);
  assert.ok(polls > 5, `바로 나타나지 않음 (${polls}번째 확인)`);
  assert.equal(rv._visWait, 0);
  assert.equal(rv._all, null);
});

test('모델 캐시 버전: 파일 내용 해시를 주소에 붙이고, 미리 받기 주소가 실제 요청 주소와 같음', () => {
  const v = modelVersions(new URL('public/models', root).pathname);
  const files = fs.readdirSync(new URL('public/models', root)).filter((f) => /\.(glb|bin)$/.test(f));
  assert.deepEqual(Object.keys(v).sort(), files.sort());
  for (const h of Object.values(v)) assert.match(h, /^[0-9a-f]{10}$/);
  assert.equal(modelQuery('/models/q_nature.glb', v), `?v=${v['q_nature.glb']}`);
  assert.equal(modelQuery('/models/없는파일.glb', v), '', '모르는 파일은 예전처럼');
  assert.equal(modelQuery('/models/q_nature.glb'), '', '개발 서버·테스트는 버전 없음');
  const cfg = viteConfig({ command: 'build' });
  assert.equal(JSON.parse(cfg.define.__MODEL_V__)['q_nature.glb'], v['q_nature.glb']);
  assert.deepEqual(viteConfig({ command: 'serve' }).define, {}, '개발 서버는 버전 없이');
  const plug = cfg.plugins.find((p) => p.name === 'unico-model-preload');
  plug.configResolved({ base: '/' });
  // 빌드 때 미리 받기 스크립트를 따로 된 파일로 내보냄 (CSP 가 인라인 스크립트를 막음)
  const emitted = [];
  plug.buildStart.call({ emitFile: (f) => emitted.push(f) });
  assert.equal(emitted.length, 1);
  const file = emitted[0];
  assert.equal(file.type, 'asset');
  assert.match(file.fileName, /^assets\/model-preload-[0-9a-f]{8}\.js$/, '/assets 아래 내용 해시 이름 → 오래 캐시');
  const tags = plug.transformIndexHtml('', { filename: '/x/index.html' });
  assert.equal(tags.length, 1);
  assert.equal(tags[0].tag, 'script');
  assert.equal(tags[0].attrs.src, `/${file.fileName}`);
  assert.ok(!tags[0].attrs.type && !tags[0].attrs.async && !tags[0].attrs.defer, '일반 스크립트 → 게임 모듈보다 먼저 실행');
  assert.equal(tags[0].injectTo, 'head-prepend');
  // 스크립트 실행: DecompressionStream 이 있을 때만 링크를 붙임
  const run = (self) => {
    const links = [];
    const document = { createElement: (tag) => ({ tag }), head: { append: (el) => links.push(el) } };
    new Function('self', 'document', file.source)(self, document);
    return links;
  };
  assert.deepEqual(run({}), [], 'DecompressionStream 이 없으면(iOS 16.3 이하) 미리 받지 않음 → 원본만 한 번 받음');
  const links = run({ DecompressionStream: function () {} });
  assert.ok(links.length >= 3);
  for (const l of links) {
    const f = l.href.match(/^\/models\/(.+)\.gz\?v=/)[1];
    assert.equal(l.href, `/models/${f}.gz${modelQuery(`/models/${f}`, v)}`, 'fetchModel 이 만드는 주소와 같아야 재사용');
    assert.equal(l.tag, 'link');
    assert.equal(l.rel, 'preload');
    assert.equal(l.as, 'fetch');
    assert.equal(l.crossOrigin, 'anonymous', 'fetch() 기본 자격 증명 모드와 맞춤');
  }
  assert.equal(plug.transformIndexHtml('<html></html>', { filename: '/x/pixel.html' }), '<html></html>', '도트 판은 그대로');
  // 다른 base 에서도 fetchModel 주소(BASE_URL + models/)와 같음
  plug.configResolved({ base: '/farm/' });
  const e2 = [];
  plug.buildStart.call({ emitFile: (f) => e2.push(f) });
  assert.ok(e2[0].source.includes(`"/farm/models/q_nature.glb.gz?v=${v['q_nature.glb']}"`));
  assert.equal(plug.transformIndexHtml('', { filename: '/x/index.html' })[0].attrs.src, `/farm/${e2[0].fileName}`);
});

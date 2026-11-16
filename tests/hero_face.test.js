// 유니콘 표정 (주인공·KOAT 담당·접속자): ^^ 눈·말할 때 입·놀란 눈·먼 거리 끄기·그리기 수 (unico.js _expressHero)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

globalThis.fetch = async (url) => {
  const b = readFileSync(new URL(`../public/models/${url}`, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const ctx2d = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 60 }) }, { get: (t, k) => (k in t ? t[k] : () => {}) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

const { Unico, loadUnicoMesh } = await import('../src/game/unico.js');
for (const k of ['quad', 'biped']) {
  await loadUnicoMesh(k === 'quad' ? 'unico_body.bin' : 'unico_biped.bin', k);
  await loadUnicoMesh(k === 'quad' ? 'unico_body_lod.bin' : 'unico_biped_lod.bin', `${k}_lod`);
}
const camAt = (d) => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 1, d); return c; };
const RIGS = [['biped', { rig: 'biped' }], ['quad', {}]];
const make = (opts) => { const u = new Unico(null, opts); u.nextBlink = 99; u.labelAlways = true; return u; }; // 매 프레임 계산
/** 보이는 메시의 그리기 수 (재질 배열이면 그룹마다 1번) */
const draws = (o) => { let n = 0; o.traverseVisible((m) => { if (m.isMesh) n += Array.isArray(m.material) ? m.geometry.groups.length || 1 : 1; }); return n; };

test('만세·하트·인사: ^^ 눈이 보이고 보통 눈은 숨음, 입을 벌림 — 끝나면 원래대로', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    u.update(1 / 60, camAt(5));
    assert.equal(u.eyesHappy.visible, false, name);
    assert.equal(u.eyesG.visible, true);
    assert.equal(u.mouthOpenNow, false);
    for (const act of ['cheer', 'heart', 'wave']) {
      u.playAction(act, 0.5);
      u.update(1 / 60, camAt(5));
      // 바로 바꾸지 않고 깜빡이듯 접었다가 (60ms) 바꿈
      assert.equal(u.eyesG.visible, true, `${name} ${act} 접는 중`);
      assert.ok(u.eyesG.scale.y < 0.3, `${name} ${act} 눈 접힘 ${u.eyesG.scale.y}`);
      for (let i = 0; i < 4; i++) u.update(1 / 60, camAt(5));
      assert.equal(u.eyesHappy.visible, true, `${name} ${act}`);
      assert.ok(u.eyesHappy.scale.y < 1, '^^ 눈은 접힌 데서 펴짐');
      for (let i = 0; i < 4; i++) u.update(1 / 60, camAt(5));
      assert.equal(u.eyesHappy.scale.y, 1);
      assert.equal(u.eyesG.visible, false);
      assert.equal(u.mouthOpenNow, true);
      for (let i = 0; i < 40; i++) u.update(1 / 60, camAt(5));
      assert.equal(u.eyesHappy.visible, false, `${name} ${act} 끝`);
      assert.equal(u.eyesG.visible, true);
      assert.equal(u.mouthOpenNow, false);
    }
    // 행복 표정 끝 시각(감정표현 메뉴·선물)도 ^^
    u.happyUntil = u.t + 1;
    for (let i = 0; i < 5; i++) u.update(1 / 60, camAt(5));
    assert.equal(u.eyesHappy.visible, true);
  }
});

test('말하기: speak(1) 동안 입이 열렸다 닫혔다 (30프레임 안에 둘 다), 끝나면 닫힘', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    u.speak(1);
    const seen = new Set();
    for (let i = 0; i < 30; i++) { u.update(1 / 60, camAt(5)); seen.add(u.mouthOpenNow); }
    assert.deepEqual([...seen].sort(), [false, true], name);
    for (let i = 0; i < 60; i++) u.update(1 / 60, camAt(5));
    assert.equal(u.mouthOpenNow, false);
    assert.equal(u.eyesHappy.visible, false, '말하기는 보통 눈');
  }
});

test('먼 거리(40m 넘음)는 얼굴 묶음을 끄고, 다시 가까이 와도 숨긴 ^^ 눈·벌린 입은 그대로 숨김', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    u.update(1 / 60, camAt(50));
    assert.equal(u.faceG.visible, false, name);
    u.update(1 / 60, camAt(5));
    assert.equal(u.faceG.visible, true);
    assert.equal(u.eyesHappy.visible, false);
    assert.equal(u.mouthOpenNow, false);
    assert.equal(u.eyesG.visible, true);
    // 먼 거리에서 만세: 얼굴 전체가 꺼져 있음
    u.playAction('cheer', 2);
    u.update(1 / 60, camAt(50));
    assert.equal(u.faceG.visible, false);
  }
});

test('깜빡임·놀람: 눈이 제자리에서 접히고 커짐 (두 눈 경계 상자 가운데가 1cm 안), 생각하면 살짝 위로', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    u.update(1 / 60, camAt(5));
    const centre = () => { u.group.updateMatrixWorld(true); u.headG.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(u.eyesG); const c = b.getCenter(new THREE.Vector3()); return u.headG.worldToLocal(c); };
    const c0 = centre();
    u.nextBlink = 0.05; // 다음 프레임 깜빡임
    u.update(1 / 60, camAt(5));
    assert.ok(u.eyesG.scale.y < 0.5, `${name} 깜빡임`);
    assert.ok(centre().distanceTo(c0) < 0.01, `${name} 깜빡임 중심 ${centre().distanceTo(c0).toFixed(4)}`);
    u.nextBlink = 99;
    u.playAction('startle', 1);
    u.update(1 / 60, camAt(5));
    assert.ok(u.eyesG.scale.y > 1.1, '놀란 눈');
    for (let i = 0; i < 4; i++) u.update(1 / 60, camAt(5));
    assert.ok(centre().distanceTo(c0) < 0.01, `${name} 놀람 중심 ${centre().distanceTo(c0).toFixed(4)}`);
    u.playAction('think', 1);
    for (let i = 0; i < 30; i++) u.update(1 / 60, camAt(5));
    assert.ok(u.eyesG.position.y > u._eyeAt.y + 0.008, '생각: 올려다보기');
  }
});

test('얼굴 그리기 수: 머리·눈 부품을 재질별로 합쳐 예전(16번)보다 적고, 웃거나 말해도 늘지 않음', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    u.update(1 / 60, camAt(5));
    const idle = draws(u.faceG);
    assert.ok(idle <= 8, `${name} 대기 ${idle}번 (예전 머리 10 + 눈 6)`);
    u.playAction('cheer', 1);
    for (let i = 0; i < 10; i++) u.update(1 / 60, camAt(5));
    const cheer = draws(u.faceG);
    assert.ok(cheer <= idle + 1, `${name} 만세 ${cheer}번 (^^ 눈은 보통 눈 대신, 벌린 입 1번)`);
    // 재질 묶음: 같은 재질 그룹은 하나
    const head = u.faceG.children[0];
    const mats = head.geometry.groups.map((g) => g.materialIndex);
    assert.equal(new Set(mats).size, mats.length, '머리 그룹마다 다른 재질');
  }
});

test('호미질처럼 수확(pull)도 쑥 뽑히는 순간에 onHit 한 번, 히트스톱이면 그만큼 늦게', () => {
  const hitAt = (stop) => {
    const u = make({ rig: 'biped' });
    let at = null, n = 0;
    u.onHit = (k) => { if (k === 'pull') { n++; at ??= u.t; } };
    u.playAction('pull', 1.05);
    const t0 = u.t;
    for (let i = 0; i < 90; i++) { if (stop && i === 3) u.hitStop(0.1); u.update(1 / 60, camAt(5)); }
    return { dt: at - t0, n };
  };
  const a = hitAt(false), b = hitAt(true);
  assert.equal(a.n, 1);
  assert.ok(a.dt > 0.3 && a.dt < 0.6, `뽑는 순간 ${a.dt.toFixed(2)}초`);
  assert.equal(b.n, 1);
  assert.ok(b.dt > a.dt + 0.06, `히트스톱만큼 늦게 ${a.dt.toFixed(3)} → ${b.dt.toFixed(3)}`);
});

test('히트스톱: 동작 시간만 느려지고 그만큼 동작이 늦게 끝남 (위치·걷기 시간은 그대로)', () => {
  const u = make({ rig: 'biped' });
  u.playAction('hoe', 0.6);
  const until = u.actionUntil;
  u.update(1 / 60, camAt(5));
  const a0 = u.actionT, t0 = u.t;
  u.hitStop(0.1);
  for (let i = 0; i < 3; i++) u.update(1 / 60, camAt(5));
  assert.ok(u.actionT - a0 < 0.01, `멈칫 ${(u.actionT - a0).toFixed(4)}`);
  assert.ok(Math.abs(u.t - t0 - 3 / 60) < 1e-9, '캐릭터 시계는 그대로');
  assert.ok(u.actionUntil > until + 0.04, '동작 끝도 늦게');
});

test('놀람: 0.08초에 가장 크게(1.25×1.4) 튀었다가 놀람 내내 크게 유지, 반짝이 없는 눈·동그란 O 입 — 끝나면 원래대로 (그리기 수 늘지 않음)', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    u.update(1 / 60, camAt(5));
    const idle = draws(u.faceG), [shut, dGeo, oGeo] = u._mouthGeo, eGeo = u.eyesG.geometry;
    assert.equal(u.mouthOpenM.geometry, shut, '다문 입');
    u.playAction('startle', 1.2);
    let peak = 0;
    for (let i = 0; i < 8; i++) { u.update(1 / 60, camAt(5)); peak = Math.max(peak, u.eyesG.scale.y); }
    assert.ok(peak > 1.35, `${name} 튀어 오름 ${peak.toFixed(2)}`);
    assert.notEqual(u.eyesG.geometry, eGeo, '반짝이 뺀 눈');
    assert.equal(u.mouthOpenNow, true, '헉');
    assert.equal(u.mouthOpenM.geometry, oGeo, 'O 입');
    assert.equal(oGeo.index, dGeo.index, 'O·D·다문 입은 같은 버퍼');
    assert.equal(shut.index, dGeo.index);
    assert.ok(draws(u.faceG) <= idle + 1, `${name} 놀람 그리기 ${draws(u.faceG)} (대기 ${idle})`);
    for (let i = 0; i < 50; i++) u.update(1 / 60, camAt(5)); // 0.97초
    assert.ok(u.eyesG.scale.y > 1.15 && u.eyesG.scale.y < 1.3, `${name} 0.4초 넘어서도 유지 ${u.eyesG.scale.y.toFixed(2)}`);
    for (let i = 0; i < 20; i++) u.update(1 / 60, camAt(5));
    assert.equal(u.eyesG.scale.y, 1);
    assert.equal(u.eyesG.geometry, eGeo);
    assert.equal(u.mouthOpenNow, false);
    assert.equal(u.mouthOpenM.geometry, shut);
    // 다음 웃음은 다시 D 입
    u.playAction('cheer', 0.5);
    u.update(1 / 60, camAt(5));
    assert.equal(u.mouthOpenM.geometry, dGeo);
  }
});

test('말하기 입: 고정 8Hz 가 아니라 음절마다 다른 길이 (열림 70~150ms·닫힘 50~120ms·가끔 200~300ms 쉼), 끝나기 0.1초 전 닫힘', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    u.speak(4);
    const dt = 1 / 240, runs = { true: [], false: [] };
    let cur = null, len = 0;
    for (let i = 0; i < 4 * 240; i++) {
      u.update(dt, camAt(5));
      const v = u.mouthOpenNow;
      if (v === cur) len += dt; else { if (cur !== null) runs[cur].push(len); cur = v; len = dt; }
      if (u._speakUntil - u.t < 0.1 - 1e-6) assert.equal(v, false, `${name} 끝 무렵 닫힘`);
    }
    const open = runs.true.slice(1, -1), shut = runs.false.slice(0, -1); // 첫·마지막 열림과 마지막 닫힘은 잘림
    assert.ok(open.length > 10, `${name} 음절 수 ${open.length}`);
    for (const r of open) assert.ok(r > 0.06 && r < 0.16, `열림 ${r.toFixed(3)}`);
    for (const r of shut) assert.ok(r > 0.04 && r < 0.31, `닫힘 ${r.toFixed(3)}`);
    assert.ok(Math.max(...open) - Math.min(...open) > 0.03, '열림 길이가 제각각');
    assert.ok(shut.some((r) => r >= 0.19), '쉼이 있음');
  }
});

test('벌린 입은 크게: D 입이 미소 선보다 넓고 아래로 깊음, O 입은 가로세로 비슷한 동그라미 — 셋 다 입 메시 하나', () => {
  for (const [name, opts] of RIGS) {
    const u = make(opts);
    // 검은 미소 선·콧구멍(정점 색 0x1b1513)을 뺀 입 부분만
    const INK = new THREE.Color(0x1b1513);
    const box = (geo, mouthOnly = true) => {
      const p = geo.attributes.position, c = geo.attributes.color, b = new THREE.Box3(), v = new THREE.Vector3();
      for (let i = geo.drawRange.start; i < geo.drawRange.start + geo.drawRange.count; i++) {
        const k = geo.index.getX(i);
        if (mouthOnly && Math.abs(c.getX(k) - INK.r) < 0.002 && Math.abs(c.getY(k) - INK.g) < 0.002 && Math.abs(c.getZ(k) - INK.b) < 0.002) continue;
        b.expandByPoint(v.fromBufferAttribute(p, k));
      }
      return b.getSize(new THREE.Vector3());
    };
    const [S, D, O] = u._mouthGeo;
    assert.ok(u.mouthOpenM.visible, '입 메시는 늘 보임 (다문 입 = 미소 선·콧구멍)');
    assert.ok(box(S, false).x > 0.05 && box(S).x === 0, '다문 입은 검은 선·콧구멍뿐');
    const d = box(D), o = box(O);
    assert.ok(d.x > 0.1 && d.y > d.x * 0.25, `${name} D ${d.x.toFixed(3)}×${d.y.toFixed(3)}`);
    assert.ok(o.y > o.x * 0.8 && o.y < o.x * 2, `${name} O ${o.x.toFixed(3)}×${o.y.toFixed(3)}`);
  }
});

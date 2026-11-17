// 첫 농사 손맛: 고른 씨앗 바로 심기·떨어지면 자동 바꾸기·호미질 중 E 이어 하기·수확 연출 (src/game/view/farm_view.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { FarmView } = await import('../src/game/view/farm_view.js');

/** 밭 화면이 쓰는 만큼만 흉내 낸 게임 */
function fakeGame({ seeds = { carrot: 3 }, compost = 0 } = {}) {
  const log = { toasts: [], picker: 0, fly: [], events: [], actions: [] };
  const unico = {
    facing: 0, action: null, onHit: null, label: { visible: true }, group: new THREE.Group(),
    playAction(name) { this.action = name; log.actions.push(name); },
  };
  const g = {
    flags: {},
    quests: { claimed: {}, progress: {} },
    assets: { clone: () => new THREE.Group(), cloneCrop: () => new THREE.Group(), scenes: new Map() },
    world: { scene: new THREE.Scene() },
    player: { position: new THREE.Vector3(), unico, frozen: false, arrow: { visible: true }, group: new THREE.Group() },
    fx: { burst() {}, pop() {}, sprinkle() {} },
    audio: { play() {} },
    juice: { shake() {}, pop() {} },
    input: { e: false, move: false, interact() { return this.e; }, manual() { return this.move; } },
    economy: {
      inventory: { seeds: { ...seeds } }, items: { compost }, crops: {},
      useSeed(c) { if (!(this.inventory.seeds[c] > 0)) return false; this.inventory.seeds[c]--; return true; },
      count(k) { return this.items[k] || 0; },
      useItem(k, n) { if ((this.items[k] || 0) < n) return false; this.items[k] -= n; return true; },
      addCrop(c, n) { this.crops[c] = (this.crops[c] || 0) + n; },
      addItem() {},
    },
    ui: {
      panel: null,
      toast: (t) => log.toasts.push(t),
      openSeedPicker: (cb) => { log.picker++; log.pick = cb; },
      flyToBag: (t) => log.fly.push(t),
    },
    onEvent: (e, n) => {
      log.events.push(e);
      if (e === 'harvest') g.quests.progress.harvest5 = (g.quests.progress.harvest5 || 0) + n;
    },
  };
  return { g, log };
}

/** 칸 i 바로 옆에 서기 */
const standAt = (F, g, i) => g.player.position.set(F.tiles[i].x - 1, 0, F.tiles[i].z);
const run = (F, g, sec, dt = 1 / 30) => { let p = null; for (let k = 0; k < Math.round(sec / dt); k++) p = F.update(dt, g.player.position); return p; };

test('심기: 고른 씨앗이 있으면 고르기 창 없이 바로 심고, 처음 한 종류뿐이면 그 씨앗을 기억', () => {
  const { g, log } = fakeGame({ seeds: { carrot: 3 } });
  const F = new FarmView(g);
  F.sim.till(0); F.sim.till(1);
  F.interact(0, 'plant');
  assert.equal(log.picker, 0, '고르기 창이 열리지 않음');
  assert.equal(F.sim.plots[0].crop, 'carrot');
  assert.equal(g.flags.seedSel, 'carrot');
  g.economy.inventory.seeds.cabbage = 2;
  F.interact(1, 'plant');
  assert.equal(log.picker, 0, '씨앗이 늘어도 고른 씨앗으로 계속');
  assert.equal(F.sim.plots[1].crop, 'carrot');
});

test('심기: 처음이고 여러 종류면 한 번만 고르기 창 → 고른 씨앗·퇴비 여부 기억', () => {
  const { g, log } = fakeGame({ seeds: { carrot: 2, cabbage: 3 }, compost: 1 });
  const F = new FarmView(g);
  F.sim.till(0); F.sim.till(1);
  standAt(F, g, 0);
  const p = F.update(0, g.player.position);
  assert.equal(p.key, 'plant');
  assert.match(p.label, /골라/);
  F.interact(0, 'plant');
  assert.equal(log.picker, 1);
  log.pick('cabbage', false);
  assert.equal(g.flags.seedSel, 'cabbage');
  assert.equal(g.flags.seedFert, false);
  assert.equal(F.sim.plots[0].crop, 'cabbage');
  assert.equal(g.economy.count('compost'), 1, '퇴비 끔 → 쓰지 않음');
  F.interact(1, 'plant');
  assert.equal(log.picker, 1, '두 번째부터는 창 없이');
  assert.equal(F.sim.plots[1].crop, 'cabbage');
  standAt(F, g, 2); F.sim.till(2);
  assert.equal(F.update(0, g.player.position).label, '🥬 양배추 심기 · R 바꾸기', '안내: 고른 씨앗 + R (터치가 아니면)');
});

test('심기: 고른 씨앗이 떨어지면 다음 씨앗으로 바꾸고 알림 (창 없이 줄 이어 심기)', () => {
  const { g, log } = fakeGame({ seeds: { carrot: 1, cabbage: 3 } });
  g.flags.seedSel = 'carrot';
  const F = new FarmView(g);
  F.sim.till(0); F.sim.till(1);
  F.interact(0, 'plant');
  F.interact(1, 'plant');
  assert.equal(log.picker, 0);
  assert.equal(F.sim.plots[1].crop, 'cabbage');
  assert.equal(g.flags.seedSel, 'cabbage');
  assert.ok(log.toasts.includes('🥕 당근 씨앗이 떨어져 🥬 양배추로 바꿨어요'));
  assert.equal(F.cycleSeed(1), 'cabbage', '한 종류만 남으면 그대로');
});

test('갈기: 한 번 내리찍는 순간 흙이 바뀌고 (신호가 없어도 끝날 때) 이랑이 솟았다가 정확히 1 로', () => {
  const { g } = fakeGame();
  const F = new FarmView(g);
  standAt(F, g, 0);
  F.interact(0, 'till');
  assert.ok(g.player.frozen);
  assert.ok(Math.abs(F.job.dur - 0.65) < 1e-9, '한 번 내리찍기 ≈ 0.65초');
  g.player.unico.onHit('hoe'); // 내리찍는 순간
  assert.equal(F.sim.plots[0].state, 'tilled', '내리찍을 때 바로 갈림');
  assert.ok(F.tiles[0].plot.visible);
  assert.equal(F.tiles[0].plot.scale.y, 0.2);
  run(F, g, 0.2);
  assert.ok(F.tiles[0].plot.scale.y > 0.2);
  run(F, g, 0.6);
  assert.equal(F.tiles[0].plot.scale.y, 1);
  assert.equal(g.player.frozen, false);
  // 동작 신호가 오지 않아도 끝날 때 갈림
  F.interact(1, 'till');
  run(F, g, 0.7);
  assert.equal(F.sim.plots[1].state, 'tilled');
});

test('호미질 중 누른 E 는 끝나자마자 가장 가까운 칸의 다음 일로 이어짐 (움직이면 취소)', () => {
  const { g } = fakeGame({ seeds: { carrot: 3 } });
  const F = new FarmView(g);
  standAt(F, g, 0);
  F.interact(0, 'till');
  g.input.e = true; F.update(1 / 30, g.player.position); g.input.e = false;
  assert.ok(F.buffered);
  run(F, g, 0.7);
  assert.equal(F.sim.plots[0].crop, 'carrot', '간 칸에 바로 심음');
  // 움직이면 취소
  F.interact(1, 'till');
  g.input.e = true; F.update(1 / 30, g.player.position); g.input.e = false;
  g.input.move = true; F.update(1 / 30, g.player.position); g.input.move = false;
  assert.equal(F.buffered, false);
});

test('수확: 뽑는 순간 신호(pull) 또는 0.45초 대비책으로 수확물 하나 → 머리 위 → 가방으로 한 번만', () => {
  for (const viaHit of [true, false]) {
    const { g, log } = fakeGame();
    const F = new FarmView(g);
    standAt(F, g, 0);
    F.sim.till(0); F.sim.plant(0, 'carrot'); F.sim.plots[0].progress = 1; F.sim.plots[0].state = 'ready';
    F.refresh(0);
    const before = g.world.scene.children.length;
    F.interact(0, 'harvest');
    assert.equal(F.leaving.length, 1, '남은 포기는 줄어들며 사라짐');
    assert.equal(F.item.phase, 'wait');
    assert.equal(g.player.frozen, false, '멈추지 않음');
    if (viaHit) g.player.unico.onHit('pull');
    else run(F, g, 0.5);
    assert.equal(F.item.phase, 'arc');
    assert.ok(F.item.m.parent === g.world.scene);
    g.player.unico.onHit?.('pull'); // 두 번째 신호는 무시
    run(F, g, 1.2);
    assert.equal(F.item, null);
    assert.deepEqual(log.fly, ['🥕'], '가방으로 날아가는 건 작물 하나');
    assert.equal(F.leaving.length, 0);
    assert.equal(g.world.scene.children.length, before - 1, '포기·수확물 모두 장면에서 빠짐');
    assert.ok(log.actions.includes('pull') && log.actions.includes('lift'));
  }
});

test('수확: 새 수확·다시 읽기는 진행 중인 연출을 바로 가방으로 보냄', () => {
  const { g, log } = fakeGame();
  const F = new FarmView(g);
  for (const i of [0, 1]) { F.sim.till(i); F.sim.plant(i, 'carrot'); F.sim.plots[i].progress = 1; F.sim.plots[i].state = 'ready'; F.refresh(i); }
  standAt(F, g, 0);
  F.interact(0, 'harvest');
  run(F, g, 0.5);
  F.interact(1, 'harvest');
  assert.equal(log.fly.length, 1, '앞 수확물은 바로 가방으로');
  F.refreshAll();
  assert.equal(log.fly.length, 2);
  assert.equal(F.item, null);
});

test('심기 고르기 창: 퇴비가 없어 퇴비 칸이 안 보였으면 퇴비 여부를 기억하지 않음 (나중에 퇴비가 생기면 기본으로 줌)', () => {
  const { g, log } = fakeGame({ seeds: { carrot: 2, cabbage: 3 }, compost: 0 });
  const F = new FarmView(g);
  F.pickSeed();
  log.pick('cabbage', false);
  assert.equal(g.flags.seedSel, 'cabbage');
  assert.equal(g.flags.seedFert, undefined);
  g.economy.items.compost = 2;
  assert.equal(F.seedFert(), true, '퇴비가 생기면 함께 줌');
  F.pickSeed();
  log.pick('cabbage', false);
  assert.equal(F.seedFert(), false, '퇴비 칸에서 끈 건 기억');
});

test('호미질이 끝나는 프레임에 누른 E: 이어 한 일 하나만 (같은 E 로 안내의 일을 또 하지 않게)', () => {
  const { g } = fakeGame({ seeds: { carrot: 3 } });
  const F = new FarmView(g);
  standAt(F, g, 0);
  F.interact(0, 'till');
  run(F, g, 0.6);
  g.input.e = true;
  const p = run(F, g, 0.1, 0.1); // 이 프레임에 끝남 + E
  g.input.e = false;
  assert.equal(F.sim.plots[0].crop, 'carrot', '눌러 둔 E 로 바로 심음');
  assert.equal(p.onInteract, undefined, '이 프레임 안내에는 할 일이 없음');
  assert.equal(F.sim.plots[0].water, 0, '물은 아직 안 줌');
});

test('수확: 포기는 먼저 위로 쭉 늘어나며 흔들리다(당기기) 수확물이 나오면 줄어듦, 머리 위에 닿을 때 별', () => {
  const { g } = fakeGame();
  const pops = [];
  g.fx.pop = (x, z, t, o) => pops.push([t, o]);
  const F = new FarmView(g);
  standAt(F, g, 0);
  F.sim.till(0); F.sim.plant(0, 'carrot'); F.sim.plots[0].progress = 1; F.sim.plots[0].state = 'ready';
  F.refresh(0);
  F.interact(0, 'harvest');
  const l = F.leaving[0];
  run(F, g, 0.2);
  assert.ok(l.obj.scale.y > 1.2 && l.obj.scale.x < 0.9, '당기는 중: 세로로 늘고 가로로 얇아짐');
  assert.equal(pops.length, 0, '뽑는 순간엔 별 없음');
  run(F, g, 0.3); // 0.45초 → 수확물 등장
  assert.equal(F.item.phase, 'arc');
  for (let k = 0; k < 30 && F.item.phase === 'arc'; k++) run(F, g, 1 / 30);
  assert.equal(F.item.phase, 'hold');
  assert.equal(pops.length, 1, '머리 위에 닿을 때 별 (보호 기간 별 2개)');
  assert.match(pops[0][0], /^(⭐){2,3}$/);
  assert.equal(pops[0][1].to, undefined, '별은 떠오르기만 (가방으로 날아가지 않음)');
  assert.ok(pops[0][1].y > F.item.m.position.y + 0.8, '별은 수확물 위 (가리지 않게)');
  assert.ok(F.item.m.scale.x > F.item.s * 1.1, "닿는 순간 '짠' 하고 크게");
  run(F, g, 0.2);
  assert.ok(Math.abs(F.item.m.scale.x - F.item.s) < 1e-6, '그다음 제 크기');
});

test('수확물 재질: 작물 GLB 재질(시선 구멍 셰이더)을 빌리지 않고 전용 재질 하나를 함께 씀', async () => {
  const { produceMaterial, ProduceFactory } = await import('../src/game/view/farm_produce.js');
  const crops = new THREE.Group();
  const borrowed = new THREE.MeshStandardMaterial({ vertexColors: true });
  crops.add(new THREE.Mesh(new THREE.BoxGeometry(), borrowed));
  const P = new ProduceFactory({ scenes: new Map([['crops', crops]]) });
  const a = P.make('carrot'), b = P.make('tomato');
  assert.notEqual(a.material, borrowed);
  assert.equal(a.material, b.material);
  assert.equal(a.material, produceMaterial());
  assert.ok(a.geometry.attributes.color, '색은 정점 색');
  const pos = a.geometry.attributes.position;
  let wide = 0;
  for (let i = 0; i < pos.count; i++) wide = Math.max(wide, Math.hypot(pos.getX(i), pos.getZ(i)));
  assert.ok(wide >= 0.105, '통통한 당근 (반지름 0.11 정도)');
});

test('수확 중 숨긴 이름표·화살표: 원래 보이던 것만, 컷신 중이면 되돌리지 않음', () => {
  for (const locked of [false, true]) {
    const { g } = fakeGame();
    g.cinema = { locked: false };
    const F = new FarmView(g);
    standAt(F, g, 0);
    F.sim.till(0); F.sim.plant(0, 'carrot'); F.sim.plots[0].progress = 1; F.sim.plots[0].state = 'ready';
    F.refresh(0);
    F.interact(0, 'harvest');
    run(F, g, 0.5);
    assert.equal(g.player.unico.label.visible, false);
    assert.equal(g.player.arrow.visible, false);
    g.cinema.locked = locked;
    run(F, g, 1.0);
    assert.equal(F.item, null);
    assert.equal(g.player.unico.label.visible, !locked);
    assert.equal(g.player.arrow.visible, !locked);
  }
});

test('밭 갈기: 내리찍는 순간 음높이가 조금씩 다른 퍽 소리와 짧은 흔들림', () => {
  const { g } = fakeGame();
  const tones = [];
  g.audio.tone = (f) => tones.push(f);
  g.audio.noise = () => {};
  let shakes = 0;
  g.juice.shake = () => shakes++;
  const F = new FarmView(g);
  for (let i = 0; i < 6; i++) { standAt(F, g, i); F.interact(i, 'till'); g.player.unico.onHit('hoe'); run(F, g, 0.7); }
  assert.equal(tones.length, 6);
  assert.ok(tones.every((f) => f >= 92 * 0.92 - 1e-9 && f <= 92 * 1.08 + 1e-9), '±8%');
  assert.ok(new Set(tones).size > 1, '똑같은 소리만 나지 않음');
  assert.ok(shakes >= 12, '호미 흔들림 + 갈기 흔들림');
});

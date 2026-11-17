import * as THREE from 'three';
import { pickTracked, CHAPTERS, QMETA, chapterProgress } from './sim/chapters.js';
import { CROPS } from './sim/crops.js';
import { josa } from './sim/josa.js';
import { LAYOUT } from './world.js';
import { touchUI } from './input.js';
import { showTouchCoach } from '../ui/coach.js';

/** 다 하면 바로 보상을 받는 첫 농사 퀘스트 (퀘스트 창을 안 열어도 흐름이 이어짐) */
export const AUTO_CLAIM = new Set(['till1', 'plant3', 'water3', 'harvest5', 'sell3']);
/** 실제 밭 한 칸을 가리키는 농사 퀘스트 */
export const FARM_TUTORIAL = new Set(['till1', 'plant3', 'water3', 'harvest5', 'star3', 'giant1', 'weed2', 'fert3']);
/** 목표 칩에 남은 시간을 보여 줄 퀘스트 */
const ETA_QUESTS = new Set(['harvest5', 'star3', 'giant1', 'fert3']);

const petName = (g) => g.pet?.sim?.name || '콩이';

/** 남은 초 → '35초' / '1분 20초' (20초 넘으면 5초 단위) */
export function fmtEta(s) {
  const v = s > 20 ? Math.ceil(s / 5) * 5 : Math.max(1, Math.ceil(s));
  return v >= 60 ? `${Math.floor(v / 60)}분${v % 60 ? ` ${v % 60}초` : ''}` : `${v}초`;
}

/** 퀘스트별 목표 위치 (없으면 안내만) */
function targetOf(id, g) {
  const L = LAYOUT;
  const nearestBug = () => {
    const p = g.player.position;
    let best = null, bd = Infinity;
    for (const b of g.nature.bugs) if (b.g.visible) { const d = b.g.position.distanceTo(p); if (d < bd) { bd = d; best = b.g.position; } }
    return best;
  };
  switch (id) {
    case 'till1': case 'plant3': case 'water3': case 'harvest5': return new THREE.Vector3(0, 0, 0);
    case 'sell10': case 'sell3': return new THREE.Vector3(L.npcs.merchant.x, 0, L.npcs.merchant.z);
    case 'tractor1': case 'plow30': return g.ride.driving ? new THREE.Vector3(LAYOUT.field.x0 + 10, 0, LAYOUT.field.z0 + 6) : new THREE.Vector3(g.ride.tractor.vehicle.x, 0, g.ride.tractor.vehicle.z);
    case 'ride5': { const b = g.ride.byId.bike || g.ride.tractor; return new THREE.Vector3(b.vehicle.x, 0, b.vehicle.z); }
    case 'smart1': return new THREE.Vector3(L.sensor.x, 0, L.sensor.z);
    case 'feed3': case 'collect5': return new THREE.Vector3(22, 0, 2);
    case 'rice1': return new THREE.Vector3(g.rice.paddies[0].x, 0, g.rice.paddies[0].z);
    case 'riceharv': return g.economy.count('paddy') ? new THREE.Vector3(L.thresher.x, 0, L.thresher.z) : new THREE.Vector3(g.rice.paddies[0].x, 0, g.rice.paddies[0].z);
    case 'fish1': case 'book10': return new THREE.Vector3(L.dock.x, 0, L.dock.z);
    case 'care5': case 'heart3': return new THREE.Vector3(22, 0, 2);
    case 'buyanimal': return new THREE.Vector3(L.ranchWork.barn.x, 0, L.ranchWork.barn.z);
    case 'rprocess2': return new THREE.Vector3(L.ranchWork.x - 2, 0, L.ranchWork.z);
    case 'rgold1': return new THREE.Vector3(22, 0, 2);
    case 'fert3': return g.economy.count('compost') ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(L.craft.compost.x, 0, L.craft.compost.z);
    case 'star3': case 'giant1': return new THREE.Vector3(0, 0, 0);
    case 'process2': return new THREE.Vector3(L.craft.jars.x, 0, L.craft.jars.z);
    case 'order3': return new THREE.Vector3(L.craft.board.x, 0, L.craft.board.z);
    case 'swim1': return new THREE.Vector3(L.lake.x + 2.5, 0, L.lake.z - 3.5);
    case 'lake1': case 'fight3': return new THREE.Vector3(L.lake.x, 0, (L.lake.pier[1].z0 + L.lake.pier[1].z1) / 2);
    case 'weed2': { const i = g.farm.sim.plots.findIndex((p) => p.weeds); return i >= 0 ? new THREE.Vector3(g.farm.tiles[i].x, 0, g.farm.tiles[i].z) : new THREE.Vector3(0, 0, 0); }
    case 'dive3': { const t = g.lake?.treasures.find((x) => x.g.visible); return t ? t.g.position.clone() : new THREE.Vector3(L.lake.x, 0, L.lake.z); }
    case 'lakereq': return g.angling.today(g.world.day).done ? new THREE.Vector3(L.npcs.fisher.x, 0, L.npcs.fisher.z) : new THREE.Vector3(L.lake.board.x, 0, L.lake.board.z);
    case 'bug1': { const b = nearestBug(); return b ? b.clone().setY(0) : null; }
    case 'shake3': return new THREE.Vector3(L.orchard[0].x, 0, L.orchard[0].z);
    case 'friend2': return new THREE.Vector3(L.npcs.granny.x, 0, L.npcs.granny.z);
    case 'koat1': case 'koat6': return new THREE.Vector3(L.koat.gate.x, 0, L.koat.gate.z - 4);
    case 'petfeed3': { const p = g.pet?.e?.m?.position; return p ? new THREE.Vector3(p.x, 0, p.z) : null; }
    default: return null;
  }
}

/**
 * 농사 퀘스트가 가리킬 실제 밭 한 칸 (플레이어에게 가장 가까운 칸, 다른 칸이 2m 넘게 더 가까워질 때까지 유지)
 * st: { i } 유지용 상태. 반환 { pos, tile, i, ringOnly } 또는 null (농사 퀘스트가 아니면 null)
 */
export function farmTarget(id, g, st = { i: -1 }) {
  if (!FARM_TUTORIAL.has(id)) return null;
  const F = g.farm, plots = F.sim.plots;
  const pp = g.ride?.driving ? g.ride.riderGroup.position : g.player.position;
  const dist = (i) => Math.hypot(F.tiles[i].x - pp.x, F.tiles[i].z - pp.z);
  const pick = (pred) => {
    let best = -1, bd = Infinity;
    plots.forEach((p, i) => { if (!pred(p, i)) return; const d = dist(i); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return -1;
    const s = st.i;
    if (s >= 0 && s !== best && s < plots.length && pred(plots[s], s) && dist(s) - bd < 2) return s;
    return best;
  };
  const tile = (i, ringOnly = false) => { st.i = i; return { pos: new THREE.Vector3(F.tiles[i].x, 0, F.tiles[i].z), tile: true, i, ringOnly }; };
  const spot = (x, z) => { st.i = -1; return { pos: new THREE.Vector3(x, 0, z), tile: false, i: -1, ringOnly: false }; };
  const growing = (p) => p.state === 'growing';
  const dry = (p) => growing(p) && p.water <= 0 && !p.weeds;
  const seeds = Object.values(g.economy.inventory.seeds).some((n) => n > 0);
  const plantFlow = () => {
    if (!seeds) return spot(LAYOUT.npcs.merchant.x, LAYOUT.npcs.merchant.z);
    let i = pick((p) => p.state === 'tilled');
    if (i < 0) i = pick((p) => p.state === 'empty');
    return i >= 0 ? tile(i) : null;
  };
  switch (id) {
    case 'till1': { const i = pick((p) => p.state === 'empty'); return i >= 0 ? tile(i) : null; }
    case 'plant3': return plantFlow();
    case 'water3': {
      let i = pick(dry);
      if (i < 0) i = pick(growing);
      return i >= 0 ? tile(i) : plantFlow();
    }
    case 'harvest5': case 'star3': case 'giant1': {
      let i = pick((p) => p.state === 'ready');
      if (i >= 0) return tile(i);
      i = pick(dry);
      if (i >= 0) return tile(i);
      i = pick(growing);
      if (i >= 0) return tile(i, true); // 자라는 중: 고리만
      return plantFlow();
    }
    case 'weed2': { const i = pick((p) => growing(p) && p.weeds); return i >= 0 ? tile(i) : null; }
    case 'fert3': {
      if (!g.economy.count('compost')) return spot(LAYOUT.craft.compost.x, LAYOUT.craft.compost.z);
      let i = pick((p) => growing(p) && !p.fert);
      if (i < 0) i = pick((p) => p.state === 'tilled' && !p.fert);
      return i >= 0 ? tile(i) : null;
    }
    default: return null;
  }
}

/**
 * 첫 농사 목표 고치기 (심기 3·첫 수확 5):
 *  - 씨앗도 자라는 작물도 없으면 → 장터 여우에게 씨앗 사러
 *  - 첫 수확 보호 기간에 다 익은 밭이 없고 마른 밭이 있으면 → 그 밭에 다시 물 주기
 * 고친 목표는 id 뒤에 꼬리를 붙여 칩이 새로 그려지게 함. 해당 없으면 null
 */
export function farmObjective(cur, g) {
  if (!cur || cur.complete || (cur.id !== 'plant3' && cur.id !== 'harvest5')) return null;
  const F = g.farm, plots = F.sim.plots;
  const seeds = Object.values(g.economy.inventory.seeds).some((n) => n > 0);
  if (!seeds && !plots.some((p) => p.state === 'growing' || p.state === 'ready')) {
    const M = LAYOUT.npcs.merchant;
    return { q: { ...cur, id: `${cur.id}:seed`, desc: '장터 여우에게 당근 씨앗 사기', descTouch: null }, tgt: new THREE.Vector3(M.x, 0, M.z) };
  }
  if (cur.id === 'harvest5' && F.grace && !plots.some((p) => p.state === 'ready')) {
    const pp = g.player.position;
    let best = -1, bd = Infinity;
    plots.forEach((p, i) => {
      if (p.state !== 'growing' || p.water > 0 || p.weeds) return;
      const t = F.tiles[i], d = Math.hypot(t.x - pp.x, t.z - pp.z);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) return { q: { ...cur, id: `${cur.id}:dry`, desc: '💧 마른 밭에 다시 물 주기', descTouch: null }, tgt: new THREE.Vector3(F.tiles[best].x, 0, F.tiles[best].z), dry: true };
  }
  return null;
}

/** 길잡이 말: 지금 퀘스트에 맞춘 한마디 (g 를 받아 그때그때 만듦) */
const HINTS = {
  till1: () => `금빛 네모가 있는 빈 밭으로 가서 ${touchUI() ? '밭을 톡 누르거나 노란 E 버튼을' : 'E 를'} 눌러 봐. 호미로 밭을 갈 거야!`,
  plant3: (g) => (Object.values(g.economy.inventory.seeds).some((n) => n > 0) ? '갈아 둔 밭에 당근 씨앗을 심어 보자. 세 칸이면 돼!' : '씨앗이 다 떨어졌네! 장터 여우한테 당근 씨앗을 사 오자'),
  water3: () => '씨앗을 심었으면 물을 줘야 쑥쑥 자라. 마른 밭부터 물을 주자 💧',
  harvest5: (g) => {
    const s = g.farm.sim.soonest(), pet = petName(g);
    if (s.readyCount) return '다 익었어! 얼른 수확하자 🥕';
    if (s.dry) return '밭이 말랐어! 물을 다시 주면 더 빨리, 더 좋게 자라 💧';
    if (s.eta !== null) return `약 ${fmtEta(s.eta)} 뒤면 다 익어. 그동안 ${pet}${josa(pet, '와/과')} 놀아 줄래? 🐕`;
    return '당근 씨앗을 심고 물을 주면 금방 자라!';
  },
  sell3: () => '수확한 당근을 장터 여우에게 팔아 보자. 세 개면 돼!',
  koat1: () => `이제 KOAT 체험관에 가 보자! ${touchUI() ? '🏢 체험관 버튼을 누르면' : '🏢 버튼을 누르면'} 바로 갈 수 있어`,
  petfeed3: (g) => { const pet = petName(g); return `${pet}${josa(pet, '이/가')} 배고파 보여. 간식이나 작물을 줘 볼래?`; },
  feed3: () => '동쪽 목장 동물들에게 사료를 주자. 사료는 장터에서 팔아',
  collect5: () => '목장 동물들이 달걀·우유·양털을 만들어 줘. 다 되면 모아 보자',
  shake3: () => '과수원 나무를 흔들면 과일이 톡 떨어져!',
  tractor1: () => '밭 옆 트랙터에 타서 쟁기를 내려 봐. 밭이 한 번에 갈려!',
  ride5: () => '마을 곳곳의 트랙터·자전거·카트를 타 보자. 바람이 시원해!',
};

/** 목표 안내: HUD 칩(할 일·거리·방향) + 월드 표시(밭 금빛 네모·보석·빛기둥·발밑 화살표) */
export class Guide {
  constructor(game) {
    this.game = game;
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xfac03e) }, uOpacity: { value: 1 } },
      vertexShader: 'varying float vY; void main(){ vY = position.y / 7.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying float vY; void main(){ float a = (1.0 - vY) * 0.55 * uOpacity * (0.75 + 0.25 * sin(uTime * 3.0 + vY * 8.0)); gl_FragColor = vec4(uColor, a); }',
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 7, 24, 1, true), beamMat);
    this.beam.position.y = 3.5;
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: 0xfac03e, emissive: 0xfac03e, emissiveIntensity: 0.8, roughness: 0.3 }));
    this.gem.scale.y = 1.4;
    const gold = (o) => new THREE.MeshBasicMaterial({ color: 0xfac03e, transparent: true, opacity: o, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), gold(0.7));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    // 밭 한 칸 표시: 밭 흰 테두리(1.22~1.32) 안쪽 금빛 네모
    this.square = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.18, 4, 1, Math.PI / 4), gold(0.95));
    this.square.rotation.x = -Math.PI / 2;
    this.square.position.y = 0.04;
    this.square.renderOrder = 3;
    this.square.material.depthTest = false; // 갈아 둔 두둑·작물에 가려지지 않게 (얇은 테두리라 위에 그려도 괜찮음)
    this.marker = new THREE.Group();
    this.marker.add(this.beam, this.gem, this.ring, this.square);
    this.marker.visible = false;
    game.world.scene.add(this.marker);
    // 발밑 화살표: 목표가 멀거나 화면 밖이면 그쪽을 가리킴
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.34); sh.lineTo(0.3, 0.06); sh.lineTo(0, -0.08); sh.lineTo(-0.3, 0.06); sh.closePath();
    const chev = new THREE.Mesh(new THREE.ShapeGeometry(sh), gold(0.9));
    chev.rotation.x = -Math.PI / 2;
    chev.renderOrder = 3;
    this.chevron = new THREE.Group();
    this.chevron.add(chev);
    this.chevron.visible = false;
    game.world.scene.add(this.chevron);
    this._frustum = new THREE.Frustum();
    this._m4 = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this.t = 0;
    this.acc = 1;
    this.target = null; // 지금 가리키는 곳 (Vector3, 미니맵 고리용)
    this._tile = false;
    this._st = { i: -1 }; // 밭 칸 유지
    this._auto = null; this._autoT = 0;
    this._cards = []; // 보여 줄 장 완료 카드
    this._pulse = 0;
  }

  /** 지금 따라갈 퀘스트 (진행·완료 포함) */
  current() {
    const g = this.game, q = g.quests;
    const x = pickTracked(q, { pinned: g.flags?.pinQuest, peersOnline: (g.net?.remote?.size || 0) > 0 });
    return x ? { ...x, complete: q.isComplete(x), count: Math.min(x.goal, q.progress[x.id] || 0) } : null;
  }

  /** 길잡이 한마디 (길잡이 NPC 대화 첫 줄) */
  hint() {
    const g = this.game, cur = this.current();
    if (!cur) return '오늘 할 일은 다 했어! 마을을 자유롭게 둘러봐 🌼';
    if (cur.complete) return '보상 받는 거 잊지 마! 📜';
    const H = HINTS[cur.id];
    return H ? H(g) : `${cur.title}! ${(touchUI() && cur.descTouch) || cur.desc}`;
  }

  /** '어디로 가면 돼?': 멀면 지도 이동, 가까우면 표시를 반짝 */
  whereTo() {
    const g = this.game, t = this.target;
    if (!t) { g.ui.toast('지금은 정해진 곳이 없어요. 마을을 자유롭게 둘러봐요 🌼'); return false; }
    const pp = g.ride?.driving ? g.ride.riderGroup.position : g.player.position;
    if (Math.hypot(t.x - pp.x, t.z - pp.z) > 8 && g.minimap?.travel) { g.minimap.travel(t.x, t.z); return true; }
    g.ui.toast('바로 여기야! 빛나는 곳을 봐 ✨');
    this._pulse = 1;
    return true;
  }

  /** 보상을 받은 뒤: 장을 다 끝냈으면 선물 주고 카드 예약 (한 번만) */
  onClaimed(id) {
    const g = this.game, m = QMETA[id];
    if (!m) return;
    const c = CHAPTERS.find((x) => x.n === m.ch);
    const pr = chapterProgress(g.quests, c);
    if (!pr.total || pr.done < pr.total) return;
    const fl = (g.flags.chapterDone ||= {});
    if (fl[c.n]) return;
    fl[c.n] = true;
    g.economy.earn(c.reward.money);
    for (const [k, n] of Object.entries(c.reward.seeds || {})) g.economy.inventory.seeds[k] = (g.economy.inventory.seeds[k] || 0) + n;
    this._cards.push(c);
  }

  _showCard(c) {
    const g = this.game;
    const next = CHAPTERS.find((x) => x.n === c.n + 1);
    const seeds = Object.entries(c.reward.seeds || {}).map(([k, n]) => `${CROPS[k].emoji} ${CROPS[k].name} 씨앗 ${n}개`).join(' · ');
    if (g.reward) g.reward(3, { label: '📖' }); else g.audio.play('levelup');
    g.ui.result(`📖 ${c.n}장 「${c.title}」 완료!`, [
      `🎁 장 완료 선물 +${c.reward.money}🪙`,
      seeds && `🌱 씨앗 꾸러미: ${seeds}`,
      next ? `다음 장: ${next.n}장 「${next.title}」` : '모든 장을 마쳤어요! 이제 사계절 농부예요 🎉',
    ].filter(Boolean));
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.beam.material.uniforms.uTime.value = this.t;
    this._pulse = Math.max(0, this._pulse - dt * 0.6);
    const pk = 1 + Math.sin(this.t * 14) * 0.25 * this._pulse; // '바로 여기야' 반짝
    this.gem.position.y = (this._tile ? 1.7 : 2.9) + Math.sin(this.t * 2.4) * 0.15;
    this.gem.rotation.y += dt * 1.8;
    this.gem.scale.set(pk, 1.4 * pk, pk);
    const s = 1 + Math.sin(this.t * 3) * 0.08;
    this.ring.scale.set(s, s, s);
    this.square.material.opacity = 0.7 + Math.sin(this.t * 3.4) * 0.25;
    const sq = 1 + 0.06 * this._pulse * Math.sin(this.t * 14);
    this.square.scale.set(sq, sq, sq);
    const pp = g.ride?.driving ? g.ride.riderGroup.position : g.player.position;
    if (this.chevron.visible && this.target) {
      const a = Math.atan2(this.target.x - pp.x, this.target.z - pp.z);
      this.chevron.position.set(pp.x + Math.sin(a) * 1.3, pp.y + 0.06, pp.z + Math.cos(a) * 1.3);
      this.chevron.rotation.y = a;
    }
    this.acc += dt;
    if (this.acc < 0.15) return;
    const step = Math.min(this.acc, 1);
    this.acc = 0;
    const free = !g.cinema?.locked && !g.dialogue?.active;
    // 휴대폰 첫 조작 안내 (한 번)
    if (free && g.flags.intro && !g.flags.touchCoach && !g.ui.panel && !g.autoplay?.on && touchUI()) { g.flags.touchCoach = true; showTouchCoach(g); }
    // 장 완료 카드: 창·대화가 없을 때
    if (this._cards.length && free && !g.ui.panel && !this._auto) this._showCard(this._cards.shift());
    let cur = this.current();
    // 첫 농사 자동 보상: 도장 찍고 0.7초 뒤 (컷신·대화가 끝난 다음)
    if (cur?.complete && AUTO_CLAIM.has(cur.id)) {
      if (this._auto !== cur.id) { this._auto = cur.id; this._autoT = 0; g.ui.stampObjective?.(); }
      this._autoT += step;
      if (this._autoT >= 0.7 && free) { this._auto = null; g.claimQuest(cur.id, { quiet: true }); cur = this.current(); }
    } else this._auto = null;
    // 가리킬 곳
    let tgt = null, tile = false, ringOnly = false;
    if (cur && !cur.complete) {
      if (FARM_TUTORIAL.has(cur.id)) {
        const ft = farmTarget(cur.id, g, this._st);
        if (ft) ({ pos: tgt, tile, ringOnly } = ft);
      } else tgt = targetOf(cur.id, g);
    }
    const fo = farmObjective(cur, g);
    if (fo) {
      cur = fo.q;
      if (!tgt) tgt = fo.tgt;
      if (fo.dry && !g.flags.dryTip) { g.flags.dryTip = true; g.ui.toast('💧 물이 마른 밭은 천천히 자라요. 다시 물을 주면 품질 별이 늘어요'); }
    }
    // 남은 시간
    let extra = null;
    if (cur && !cur.complete && ETA_QUESTS.has(cur.id.split(':')[0])) {
      const s = g.farm.sim.soonest();
      if (s.i >= 0 || s.readyCount) extra = { eta: s.eta, dry: s.dry, ready: s.readyCount, pet: petName(g) };
    }
    this.target = tgt;
    this._tile = tile;
    let dist = null, ang = 0;
    if (tgt) {
      this.marker.position.set(tgt.x, 0, tgt.z);
      dist = Math.hypot(tgt.x - pp.x, tgt.z - pp.z);
      this.marker.visible = true;
      this.square.visible = tile;
      this.ring.visible = !tile && dist > 2.5;
      this.gem.visible = !ringOnly && (tile || dist > 2.5);
      // 빛기둥: 4m 밖에서만, 가까울수록 흐리고 낮게 (장터를 가리지 않게)
      this.beam.visible = !ringOnly && dist > 4;
      if (this.beam.visible) {
        const r = tile ? 0.35 / 0.55 : 1, hy = Math.min(1, Math.max(0.55, dist / 20));
        this.beam.scale.set(r, hy, r);
        this.beam.position.y = 3.5 * hy;
        this.beam.material.uniforms.uOpacity.value = Math.min(1, Math.max(0.35, (dist - 4) / 16));
      }
      // 발밑 화살표: 10m 밖이거나 화면 밖
      let off = false;
      const cam = g.camera;
      if (cam) {
        this._frustum.setFromProjectionMatrix(this._m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        off = !this._frustum.containsPoint(this._v.set(tgt.x, 0.5, tgt.z));
      }
      this.chevron.visible = dist > 2.5 && (dist > 10 || off);
      // 화면 기준 방향: 카메라 앞을 위(0°)로
      const fc = g.followCam;
      const toT = Math.atan2(tgt.x - pp.x, tgt.z - pp.z);
      const fwd = Math.atan2(-Math.sin(fc.yaw), -Math.cos(fc.yaw));
      ang = -(toT - fwd) * 180 / Math.PI;
    } else { this.marker.visible = false; this.chevron.visible = false; }
    g.ui.setObjective(cur, dist, ang, extra);
  }
}

import * as THREE from 'three';
import { Unico } from '../unico.js';
import { LAYOUT } from '../world.js';
import { VILLAGERS } from '../sim/villagers.js';
import { CROPS } from '../sim/crops.js';

const ROLE_ICON = { merchant: '🛒', researcher: '🔬', guide: '📣', granny: '🌾', kid: '🦋' };
/** 대화창 이름표 색 (역할별) */
const NPC_COLOR = { merchant: '#f28c28', researcher: '#8e7cc3', guide: '#6dbb4f', granny: '#a07e5c', kid: '#f28bb0' };
const BYE = { merchant: '좋은 거래였어! 또 와~', researcher: '데이터가 쌓이면 또 알려 줄게!', guide: '궁금한 거 있으면 언제든 불러 줘!', granny: '조심히 가거라, 아가.', kid: '다음에 또 같이 놀자!' };

const OUTFITS = {
  merchant: { hat: 'straw', scarf: 'red' },
  researcher: { goggles: true, scarf: 'blue', sprout: true },
  guide: { scarf: 'green', sprout: true },
  granny: { hat: 'straw', scarf: 'blue' },
  kid: { scarf: 'red', sprout: true },
};

/** 성격별 대사 (동물의 숲처럼 매일 조금씩 다른 말) */
const LINES = {
  merchant: ['신선한 농산물 삽니다~ 씨앗도 팔아요!', '오늘 시세 봤어? 매일 바뀐다구!', '볍씨도 들여놨어. 논농사 해 볼래?'],
  researcher: ['스마트팜은 센서로 온도·습도를 관리해요.', '벼는 단계마다 알맞은 물 높이가 달라요. 익으면 물을 빼 주세요!', '얕은 물에선 잡초가 잘 자라요. 깊게 대면 잡초가 줄어요.'],
  guide: ['유니코 팜에 온 걸 환영해요! 퀘스트(Q)를 확인해 보세요.', '연못에서 낚시를 해 봤어요? 비 오는 날엔 희귀한 물고기가!', '과일 나무는 하루에 한 번 흔들 수 있어요.'],
  granny: ['쌀 한 톨에도 정성이 담겨야 한단다.', '모내기 철엔 물을 얕게, 이삭이 패면 깊게 대거라.', '탈곡은 힘껏! 빠르게 밟아야 낟알이 잘 떨어져.'],
  kid: ['나비 잡으러 가자! 밤엔 반딧불이도 있어!', '황금 잉어 본 적 있어? 엄청 희귀하대!', '나무를 흔들면 가끔 장수풍뎅이가 떨어져!'],
};

/** 마을 주민 (동물의 숲풍): 매일 인사, 선물, 부탁, 우정 하트 */
export class NPCs {
  constructor(game) {
    this.game = game;
    this.list = Object.entries(LAYOUT.npcs).map(([id, n]) => {
      const u = new Unico(game.assets, { name: `${ROLE_ICON[id] || ''} ${n.name}`, labelColor: '#231916', labelBg: 'rgba(255,248,225,0.92)', outfit: OUTFITS[id], palette: id });
      u.group.position.set(n.x, 0, n.z);
      u.facing = u.yaw = Math.atan2(0 - n.x, 9 - n.z); // 스폰 쪽을 바라봄
      game.world.scene.add(u.group);
      const ob = n.wander ? null : { x: n.x, z: n.z, r: 0.7 };
      if (ob) game.world.obstacles.push(ob);
      return { id, u, n, lineIdx: Math.floor(Math.random() * 3), target: null, wait: 2 };
    });
  }

  update(dt, playerPos) {
    let hit = null, hd = 2.6;
    for (const e of this.list) {
      const p = e.u.group.position;
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      // 꼬마는 들판을 돌아다님 (플레이어가 가까우면 멈춰서 바라봄)
      if (e.n.wander && d > 3) {
        const W = e.n.wander;
        if (!e.target || Math.hypot(e.target.x - p.x, e.target.z - p.z) < 0.3) {
          e.wait -= dt;
          e.spd = 0;
          e.u.moving = false;
          if (e.wait <= 0) {
            // 화분·수레·가로등 같은 장애물 위는 피해서 목적지 고르기
            for (let k = 0; k < 10; k++) { const t = { x: W.x0 + Math.random() * (W.x1 - W.x0), z: W.z0 + Math.random() * (W.z1 - W.z0) }; if (!this.game.world.isBlocked(t.x, t.z, 0.8)) { e.target = t; break; } }
            e.wait = 2 + Math.random() * 4;
          }
        } else {
          const dx = e.target.x - p.x, dz = e.target.z - p.z, len = Math.hypot(dx, dz);
          // 출발할 때 천천히 붙는 속도, 도착할 때 감속 (도착 0.8m 전부터)
          const want = 2.2 * Math.min(1, len / 0.8 + 0.25);
          e.spd = (e.spd || 0) + (want - (e.spd || 0)) * (1 - Math.exp(-dt * 6));
          const step = Math.min(len, e.spd * dt);
          const nv = (this._nv ||= new THREE.Vector3()).set(p.x + (dx / len) * step, 0, p.z + (dz / len) * step);
          this.game.world.resolveCollision(nv, 0.4); // 소품을 통과하지 않게
          if (Math.hypot(nv.x - p.x, nv.z - p.z) < step * 0.3) e.blocked = (e.blocked || 0) + dt; else e.blocked = 0;
          p.x = nv.x; p.z = nv.z;
          if (e.blocked > 1.5) { e.blocked = 0; e.target = null; e.wait = 0.5; }
          e.u.facing = Math.atan2(dx, dz);
          e.u.moving = e.spd > 0.4;
        }
      } else {
        e.u.moving = false;
        e.spd = 0;
        if (d < 7) e.u.facing = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
      }
      e.idle = (e.idle || 0) + dt;
      if (e.idle > 8 + Math.random() * 4 && !e.u.moving) { e.idle = 0; e.u.playAction(e.n.pose, 2); }
      e.u.update(dt, this.game.followCam.camera);
      if (d < hd) { hd = d; hit = e; }
    }
    if (!hit) return null;
    const v = this.game.villagers;
    const hearts = v.hearts(hit.id);
    return { d: hd, label: `💬 ${hit.n.name}와 대화 ${'❤️'.repeat(hearts)}${'🤍'.repeat(5 - hearts)}`, key: 'npc', onInteract: () => this.talk(hit) };
  }

  /** 대화창으로 대화: 서로 마주 보고, 카메라는 대화 구도로. 선택지로 부탁·선물·장터·퀘스트 */
  async talk(e) {
    const g = this.game;
    if (g.dialogue.active) return;
    const pp = g.player.position, np = e.u.group.position;
    e.u.facing = Math.atan2(pp.x - np.x, pp.z - np.z);
    g.player.unico.facing = Math.atan2(np.x - pp.x, np.z - pp.z);
    g.cinema.focusTalk(pp, np);
    g.cinema.hideLabelsOf(g.player.unico, e.u);
    const r = g.villagers.talk(e.id, g.world.day);
    if (r.gained) g.ui.toast(`💕 ${e.n.name}와(과) 오늘 첫 인사! 우정 +${r.gained}`);
    this.applyRewards(e, r);
    const id = e.id, color = NPC_COLOR[id] || '#30b6aa';
    const who = () => ({ speaker: e.u, name: `${ROLE_ICON[id] || ''} ${e.n.name}`, color, sub: `우정 ${'❤️'.repeat(g.villagers.hearts(id))}${'🤍'.repeat(5 - g.villagers.hearts(id))}` });
    let line = LINES[id][e.lineIdx++ % LINES[id].length];
    let after = null;
    for (let guard = 0; guard < 8; guard++) {
      const req = g.villagers.requestFor(id, g.world.day, this.requestPool());
      const v = g.villagers.state[id];
      const choices = [];
      if (!req.done) { const have = g.economy.count(req.item); choices.push({ label: `📝 부탁 들어주기`, note: `${g.villagers.describeRequest(req)} · 보유 ${have}/${req.n}`, value: 'req', disabled: have < req.n }); }
      choices.push({ label: '🎁 선물하기', note: v.lastGift === g.world.day ? '오늘은 이미 선물했어요' : '', value: 'gift', disabled: v.lastGift === g.world.day });
      if (id === 'merchant') choices.push({ label: '🛒 장터 열기', value: 'market' });
      if (id === 'guide') choices.push({ label: '📜 할 일(퀘스트) 보기', value: 'quests' });
      choices.push({ label: '💬 이야기 더 하기', value: 'more' }, { label: '👋 안녕!', value: 'bye' });
      const c = await g.dialogue.say({ ...who(), text: line, choices: choices.slice(0, 4).concat(choices.length > 4 ? choices.slice(4) : []) });
      if (c === 'more') { line = LINES[id][e.lineIdx++ % LINES[id].length]; continue; }
      if (c === 'req') {
        if (g.economy.take(req.item, req.n)) {
          const rr = g.villagers.fulfill(id);
          g.economy.earn(rr.reward);
          g.audio.play('coin');
          e.u.playAction('cheer', 1.2);
          this.applyRewards(e, rr);
          await g.dialogue.say({ ...who(), text: `정말 고마워! 덕분에 살았어 🙏 (+${rr.reward}🪙, 우정 +${rr.gained})`, emote: 'heart' });
        }
        continue;
      }
      if (c === 'bye') await g.dialogue.say({ ...who(), text: BYE[id] || '또 놀러 와!', emote: 'wave' });
      else after = c;
      break;
    }
    g.cinema.release();
    if (after === 'gift') g.ui.openGiftPicker(e);
    else if (after === 'market') g.ui.openMarket();
    else if (after === 'quests') g.ui.openQuests();
  }

  /** 하트 단계 보상 지급 */
  applyRewards(e, r) {
    const g = this.game;
    for (const rw of r?.rewards || []) {
      if (rw.money) g.economy.earn(rw.money);
      if (rw.seeds) for (const [k, n] of Object.entries(rw.seeds)) g.economy.inventory.seeds[k] = (g.economy.inventory.seeds[k] || 0) + n;
      if (rw.item) for (const [k, n] of Object.entries(rw.item)) g.economy.addItem(k, n);
      g.ui.toast(`🎁 ${e.n.name}: "${rw.text}"`);
      g.audio.play('levelup');
    }
    const max = Math.max(...Object.keys(VILLAGERS).map((id) => g.villagers.hearts(id)));
    g.onEvent('hearts', max);
  }

  /** 오늘의 부탁 후보: 플레이어가 구할 수 있는 것 위주 */
  requestPool() {
    const lv = this.game.quests.level;
    return [...Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= lv), 'egg', 'milk', 'fruit_apple', 'fish_crucian', 'bug_butterfly'];
  }
}

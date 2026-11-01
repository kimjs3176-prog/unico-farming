import { Unico } from '../unico.js';
import { LAYOUT } from '../world.js';
import { VILLAGERS } from '../sim/villagers.js';
import { CROPS } from '../sim/crops.js';

const ROLE_ICON = { merchant: '🛒', researcher: '🔬', guide: '📣', granny: '🌾', kid: '🦋' };

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
          e.u.moving = false;
          if (e.wait <= 0) { e.target = { x: W.x0 + Math.random() * (W.x1 - W.x0), z: W.z0 + Math.random() * (W.z1 - W.z0) }; e.wait = 2 + Math.random() * 4; }
        } else {
          const dx = e.target.x - p.x, dz = e.target.z - p.z, len = Math.hypot(dx, dz);
          p.x += (dx / len) * 2.2 * dt; p.z += (dz / len) * 2.2 * dt;
          e.u.facing = Math.atan2(dx, dz);
          e.u.moving = true;
        }
      } else {
        e.u.moving = false;
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

  talk(e) {
    const g = this.game;
    const line = LINES[e.id][e.lineIdx++ % LINES[e.id].length];
    e.u.say(line, 4);
    e.u.playAction('heart', 1);
    g.audio.play('click');
    const r = g.villagers.talk(e.id, g.world.day);
    if (r.gained) g.ui.toast(`💕 ${e.n.name}와(과) 오늘 첫 인사! 우정 +${r.gained}`);
    this.applyRewards(e, r);
    g.ui.openVillager(e, line);
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

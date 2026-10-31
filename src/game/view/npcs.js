import { Unico } from '../unico.js';
import { LAYOUT } from '../world.js';

const OUTFITS = {
  merchant: { hat: 'straw', scarf: 'red' },
  researcher: { goggles: true, scarf: 'blue', sprout: true },
  guide: { scarf: 'green', sprout: true },
};

const LINES = {
  merchant: ['신선한 농산물 삽니다~ 씨앗도 팔아요!', '오늘 시세를 확인해 보세요. 매일 바뀐답니다.'],
  researcher: ['스마트팜은 센서로 온도·습도를 자동 관리해요.', '환경 제어를 잘하면 작물이 빨리 자라요!'],
  guide: ['유니코 팜에 온 걸 환영해요! 퀘스트(Q)를 확인해 보세요.', '트랙터와 스마트팜 미니게임도 꼭 해보세요!'],
};

/** 상점/연구원/안내 NPC */
export class NPCs {
  constructor(game) {
    this.game = game;
    this.list = Object.entries(LAYOUT.npcs).map(([id, n]) => {
      const u = new Unico(game.assets, { name: n.name, labelColor: '#ffe066', outfit: OUTFITS[id] });
      u.group.position.set(n.x, 0, n.z);
      u.facing = u.yaw = Math.atan2(0 - n.x, 9 - n.z); // 스폰 쪽을 바라봄
      game.world.scene.add(u.group);
      game.world.obstacles.push({ x: n.x, z: n.z, r: 0.7 });
      return { id, u, n, lineIdx: 0 };
    });
  }

  update(dt, playerPos) {
    let hit = null;
    for (const e of this.list) {
      const d = Math.hypot(e.n.x - playerPos.x, e.n.z - playerPos.z);
      if (d < 7) e.u.facing = Math.atan2(playerPos.x - e.n.x, playerPos.z - e.n.z);
      e.idle = (e.idle || 0) + dt;
      if (e.idle > 7 + Math.random() * 4) { e.idle = 0; e.u.playAction(e.n.pose, 2); }
      e.u.update(dt, this.game.followCam.camera, this.game.world.daylight);
      if (!hit && Math.hypot(e.n.x - playerPos.x, e.n.z - playerPos.z) < 2.6) hit = e;
    }
    if (!hit) return null;
    const label = hit.id === 'merchant' ? '장터 열기 (사고 팔기)' : hit.id === 'guide' ? '퀘스트 보기' : '연구원과 대화';
    return { label, key: 'npc', onInteract: () => this.talk(hit) };
  }

  talk(e) {
    const g = this.game;
    const line = LINES[e.id][e.lineIdx++ % LINES[e.id].length];
    e.u.say(line, 4);
    g.audio.play('click');
    if (e.id === 'merchant') g.ui.openMarket();
    else if (e.id === 'guide') g.ui.openQuests();
  }
}

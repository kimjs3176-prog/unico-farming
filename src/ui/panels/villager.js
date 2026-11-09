// 주민 대화·선물 고르기·농장 방 창
import { h, esc } from '../dom.js';
import { joinQrBox } from '../join_qr.js';
import { CROPS, PRODUCTS } from '../../game/sim/crops.js';
import { ITEMS } from '../../game/sim/items.js';
import { VILLAGERS } from '../../game/sim/villagers.js';

const anyItem = (k) => CROPS[k] || PRODUCTS[k] || ITEMS[k];

/** 주민·선물·방 창 메서드 (UI.prototype 에 합쳐짐) */
export const VillagerPanel = {
  async openRooms() {
    const g = this.game;
    const p = this.openPanel('🏡 어느 농장으로 갈까요?');
    const note = h('p', '', '농장을 옮겨도 내 밭·가방·퀘스트는 그대로예요.');
    p.append(note);
    const list = h('div', 'room-list');
    p.append(list);
    // 친구 초대: 이 QR 을 휴대폰으로 찍으면 같은 게임 주소로 바로 들어와요
    p.append(h('h3', '', '👥 친구 초대'));
    p.append(joinQrBox('📱 이 QR 을 찍으면 같은 농장 게임으로 들어와요', 120));
    try {
      const base = (import.meta.env?.VITE_WS_URL || '').replace(/^ws/, 'http').replace(/\/ws$/, '');
      const r = await fetch(`${base}/rooms`);
      const d = await r.json();
      note.textContent = `농장을 옮겨도 내 밭·가방·퀘스트는 그대로예요. 방마다 최대 ${+d.maxPlayers || 0}명이 함께 지내요.`;
      const rooms = d.rooms.length ? d.rooms : [{ name: '1번 농장', count: 0, max: d.maxPlayers }];
      const nextIdx = rooms.length + 1;
      if (rooms.every((x) => x.count >= x.max)) rooms.push({ name: `${nextIdx}번 농장`, count: 0, max: d.maxPlayers });
      for (const room of rooms) {
        const b = h('button', room.name === g.net.room ? 'cur' : '', `${esc(room.name)}<small>${+room.count || 0} / ${+room.max || 0}명${room.name === g.net.room ? ' · 현재' : ''}</small>`);
        b.disabled = room.count >= room.max;
        b.onclick = () => { g.net.switchRoom(room.name); this.closePanel(); };
        list.append(b);
      }
    } catch {
      list.append(h('div', 'row', '서버에 연결되어 있지 않아요 (오프라인 모드). 혼자서도 농장은 즐길 수 있어요!'));
    }
  },

  openVillager(e, line) {
    const g = this.game, v = g.villagers, id = e.id, info = VILLAGERS[id];
    const p = this.openPanel(`${e.u.species?.emoji ?? '🦄'} ${e.name ?? e.n.name}`);
    const render = () => {
      p.querySelectorAll('.body').forEach((x) => x.remove());
      const body = h('div', 'body');
      const hearts = v.hearts(id);
      body.append(h('div', 'villager-line', `“${esc(line)}”`));
      body.append(h('div', 'row', `<span class="nm">우정 ${'❤️'.repeat(hearts)}${'🤍'.repeat(5 - hearts)}</span><span class="qty">${v.state[id].friendship}/100 · 성격 ${info.personality}</span>`));
      const req = v.requestFor(id, g.world.day, g.npcs.requestPool());
      const acts = h('div', 'room-list');
      if (!req.done) {
        const have = g.economy.count(req.item);
        const b = h('button', have >= req.n ? 'cur' : '', `📝 부탁: ${v.describeRequest(req)}<small>보유 ${have}/${req.n}</small>`);
        b.disabled = have < req.n;
        b.onclick = () => {
          if (!g.economy.take(req.item, req.n)) return;
          const r = v.fulfill(id);
          g.economy.earn(r.reward);
          g.audio.play('coin');
          this.toast(`🙏 ${e.name ?? e.n.name}: 고마워! +${r.reward}🪙, 우정 +${r.gained}`);
          g.npcs.applyRewards(e, r);
          render();
        };
        acts.append(b);
      } else acts.append(h('button', '', `✅ 오늘 부탁 완료<small>내일 또 놀러 와!</small>`));
      const gift = h('button', '', `🎁 선물하기<small>좋아하는 것: ${info.likes.map((k) => anyItem(k)?.emoji || '').join(' ')}</small>`);
      gift.disabled = v.state[id].lastGift === g.world.day;
      gift.onclick = () => this.openGiftPicker(e);
      acts.append(gift);
      if (id === 'merchant') { const m = h('button', '', '🛒 장터 열기<small>사고 팔기</small>'); m.onclick = () => this.openMarket(); acts.append(m); }
      if (id === 'guide') { const q = h('button', '', '📜 퀘스트<small>할 일 보기</small>'); q.onclick = () => this.openQuests(); acts.append(q); }
      body.append(acts);
      p.append(body);
    };
    render();
  },

  openGiftPicker(e) {
    const g = this.game, eco = g.economy;
    const p = this.openPanel(`🎁 ${e.name ?? e.n.name}에게 무엇을 줄까요?`);
    const grid = h('div', 'seed-grid');
    const all = { ...eco.inventory.crops, ...eco.inventory.products, ...eco.inventory.items };
    let any = false;
    for (const [k, n] of Object.entries(all)) {
      if (!n || ITEMS[k]?.cat === 'seed') continue;
      any = true;
      const it = anyItem(k);
      const liked = VILLAGERS[e.id].likes.includes(k);
      const b = h('button', '', `${it.emoji} ${it.name}${liked ? ' 💕' : ''}<span class="q">${n}개</span>`);
      b.onclick = () => {
        if (!eco.take(k, 1)) return;
        const r = g.villagers.gift(e.id, k, g.world.day, g.costume?.mult('friend') ?? 1);
        e.u.playAction(r.liked ? 'cheer' : 'heart', 1.8);
        e.u.happyUntil = e.u.t + 3; // 동작이 끝나도 잠깐 더 웃는 얼굴 (주민 동물)
        e.u.say(r.liked ? '와아! 이거 정말 좋아해! 💕' : '고마워, 잘 쓸게!', 3);
        g.audio.play(r.liked ? 'win' : 'coin');
        this.toast(`🎁 ${it.name} 선물! 우정 +${r.gained}${r.liked ? ' (아주 좋아해요!)' : ''}`);
        g.npcs.applyRewards(e, r);
        this.closePanel();
      };
      grid.append(b);
    }
    if (!any) grid.append(h('div', 'row', '줄 수 있는 물건이 없어요. 작물·과일·물고기를 모아 보세요!'));
    p.append(grid);
  },
};

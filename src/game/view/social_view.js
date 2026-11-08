import { CROPS, PRODUCTS } from '../sim/crops.js';
import { ITEMS } from '../sim/items.js';
import { validGift, GIFT_MAX } from '../sim/social.js';
import { saveGame } from '../save.js';

/**
 * 다른 플레이어와 상호작용 화면 (규칙은 sim/social.js, 전달은 net.sendAct → 서버가 받는 사람에게만)
 *  - 가까이 가서 E → 👋 인사 · 🙌 하이파이브 · 🎁 선물 · ⭐ 친구
 *  - 하이파이브·친구는 상대 화면에 12초짜리 요청 카드가 뜨고, 받으면 둘 다 축하 동작
 *  - 선물을 서버가 전하지 못하면(한도 초과·상대가 나감) act_fail 이 와서 가방에 돌려받음
 */
const CATALOG = { ...CROPS, ...PRODUCTS, ...ITEMS };
const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class SocialView {
  constructor(game) {
    this.game = game;
    this.box = el('div', 'soc-reqs');
    document.getElementById('ui').append(this.box);
    this.sent = new Map();   // 보낸 선물 (서버가 못 전했다고 알려 오면 돌려받음): 번호 → { item, n, name, at }
    this.gid = 0;
    this.autoOk = new Map(); // 이미 친구인 사람의 친구 신청에 자동으로 답한 시각
  }

  get now() { return performance.now() / 1000; }
  remote(id) { return this.game.net.remote.get(id); }

  /** 서로 마주 보기 */
  face(r) {
    const me = this.game.player, p = r.unico.group.position, q = me.position;
    me.unico.facing = Math.atan2(p.x - q.x, p.z - q.z);
  }

  /** 상호작용 창 */
  open(id) {
    const g = this.game, ui = g.ui, so = g.social, r = this.remote(id);
    if (!r) return;
    if (Date.now() - (g.net.lastRecv || 0) > 20000) g.net.probe?.(); // 한동안 받은 게 없으면 미리 확인: 물건을 고르는 사이 끊긴 소켓을 찾아 바꿈
    this.face(r);
    const fr = so.isFriend(r.name);
    const p = ui.openPanel(`${fr ? '⭐' : '👤'} ${esc(r.name)}`);
    p.classList.add('soc');
    p.append(el('p', 'soc-sub', fr ? '⭐ 내 친구예요' : '같은 농장 방에 있는 플레이어예요'));
    const grid = el('div', 'soc-acts');
    const act = (icon, title, sub, fn, disabled = false) => {
      const b = el('button', 'soc-act', `<span class="ic">${icon}</span><b>${title}</b><small>${sub}</small>`);
      b.disabled = disabled;
      b.onclick = fn;
      grid.append(b);
    };
    act('👋', '인사하기', '손을 흔들어요', () => { ui.closePanel(); this.wave(id); });
    act('🙌', '하이파이브', so.fives.length < 3 ? '받아 주면 둘 다 +10코인 (오늘 3명)' : '오늘 코인은 다 받았어요', () => { ui.closePanel(); this.ask(id, 'five'); });
    act('🎁', '선물 보내기', `가방 물건 1~${GIFT_MAX}개 · 오늘 ${so.gifts}/10`, () => this.giftPicker(id), !!so.whyNotGift(99, 1));
    if (fr) act('💔', '친구 끊기', '내 친구 목록에서만 지워요', () => { so.removeFriend(r.name); g.net.labelOf(r); saveGame(g); ui.closePanel(); ui.toast(`${r.name} 님을 친구 목록에서 지웠어요`); });
    else act('⭐', '친구 추가', '상대가 받으면 친구가 돼요', () => { ui.closePanel(); this.ask(id, 'friend'); });
    p.append(grid);
  }

  wave(id) {
    const g = this.game, r = this.remote(id);
    if (!r) return;
    this.face(r);
    g.player.unico.playAction('wave', 1.6);
    g.net.sendAct(id, 'wave');
    g.social.stats.waves++;
    g.onEvent('greet');
  }

  /** 하이파이브·친구 요청 보내기 */
  ask(id, kind) {
    const g = this.game, r = this.remote(id);
    if (!r) return;
    this.face(r);
    g.social.request(kind, id, this.now);
    g.net.sendAct(id, kind);
    g.player.unico.playAction(kind === 'five' ? 'wave' : 'heart', 1.2);
    g.ui.toast(kind === 'five' ? `🙌 ${r.name} 님에게 하이파이브를 청했어요` : `⭐ ${r.name} 님에게 친구 신청을 보냈어요`);
  }

  giftPicker(id) {
    const g = this.game, eco = g.economy, ui = g.ui, r = this.remote(id);
    if (!r) return;
    const p = ui.openPanel(`🎁 ${esc(r.name)} 님에게 선물`);
    const rows = el('div', 'rows');
    const all = { ...eco.inventory.crops, ...eco.inventory.products, ...eco.inventory.items };
    let any = false;
    for (const [k, n] of Object.entries(all)) {
      if (!n || !CATALOG[k] || k === 'paddy') continue;
      any = true;
      const it = CATALOG[k];
      const row = el('div', 'row', `<span class="ic">${it.emoji}</span><span class="nm">${it.name} <span class="qty">보유 ${n}</span></span>`);
      for (const c of [1, 5]) {
        if (c > 1 && n < c) continue;
        const b = el('button', c > 1 ? 'gold' : '', `${c}개`);
        b.onclick = () => this.sendGift(id, k, c);
        row.append(b);
      }
      rows.append(row);
    }
    if (!any) rows.append(el('div', 'mk-empty', '🧺 줄 수 있는 물건이 없어요. 밭·목장·호수에서 모아 보세요'));
    p.append(rows);
  }

  sendGift(id, item, n) {
    const g = this.game, eco = g.economy, so = g.social, r = this.remote(id);
    if (!g.net.connected) return g.ui.toast('🎁 서버와 연결이 끊겨서 지금은 보낼 수 없어요');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return g.ui.toast('🎁 인터넷 연결이 끊겨서 지금은 보낼 수 없어요');
    if (g.net.probeTimer) return g.ui.toast('🎁 연결을 확인하는 중이에요. 잠시 뒤 다시 보내 주세요'); // 반쯤 끊긴 소켓이면 서버가 못 받아 돌려받을 수도 없음
    if (!r) return g.ui.toast('그 플레이어가 방을 떠났어요');
    const why = so.whyNotGift(eco.count(item), n);
    if (why) return g.ui.toast(`🎁 ${why}`);
    if (!eco.take(item, n)) return;
    const gid = ++this.gid;
    if (!g.net.sendAct(id, 'gift', { item, n, gid })) { this.refund(item, n); return g.ui.toast('🎁 서버와 연결이 끊겨서 보내지 못했어요'); }
    so.noteGift();
    for (const [k, v] of this.sent) if (this.now - v.at > 60) this.sent.delete(k);
    this.sent.set(gid, { item, n, name: r.name, at: this.now });
    this.face(r);
    g.player.unico.playAction('present', 1.4);
    g.audio.play('pop');
    g.ui.closePanel();
    g.ui.toast(`🎁 ${r.name} 님에게 ${CATALOG[item].emoji} ${CATALOG[item].name} ${n}개를 보냈어요`);
    g.onEvent('giftp');
    saveGame(g);
  }

  /** 꺼낸 물건을 가방에 다시 넣음 (eco.take 의 반대) */
  refund(item, n) { const bag = this.game.economy.bagOf(item); bag[item] = (bag[item] || 0) + n; }

  /** 서버가 선물을 전하지 못했다고 알려 옴 (한도 초과·상대가 나감): 내가 보낸 기록이 있을 때만 한 번 돌려받음 */
  onActFail(m) {
    const s = this.sent.get(m.gid);
    if (!s) return;
    this.sent.delete(m.gid);
    const g = this.game, so = g.social, it = CATALOG[s.item];
    this.refund(s.item, s.n);
    so.gifts = Math.max(0, so.gifts - 1); // 오늘 보낸 횟수도 되돌림
    so.stats.giftsSent = Math.max(0, so.stats.giftsSent - 1);
    g.ui.toast(m.why === 'busy'
      ? `🎁 너무 빨리 보내서 전하지 못했어요. ${it.emoji} ${it.name} ${s.n}개를 가방에 돌려놨어요`
      : `🎁 ${s.name} 님에게 전하지 못해 ${it.emoji} ${it.name} ${s.n}개를 가방에 돌려놨어요`);
    saveGame(g);
  }

  /** 상대가 보낸 상호작용 받기 */
  onAct(m) {
    const g = this.game, so = g.social, r = this.remote(m.from), name = String(m.name || '누군가').slice(0, 12);
    switch (m.k) {
      case 'wave':
        if (r) r.unico.say('👋 안녕!', 2.5);
        this.card(`👋 ${name} 님이 인사했어요`, '👋 답인사', () => this.wave(m.from));
        break;
      case 'five':
        this.card(`🙌 ${name} 님이 하이파이브를 청했어요`, '🙌 받기', () => {
          if (!this.remote(m.from)) return;
          g.net.sendAct(m.from, 'five_ok');
          this.celebrate(m.from, name);
        });
        break;
      case 'five_ok':
        if (so.accepted('five', m.from, this.now)) this.celebrate(m.from, name);
        break;
      case 'friend':
        if (so.isFriend(name)) { // 이미 친구면 바로 수락 (같은 사람에게는 10초에 한 번: 연타로 내 상호작용 한도를 다 쓰지 않게)
          if (!(this.now - (this.autoOk.get(m.from) ?? -1e9) < 10)) { this.autoOk.set(m.from, this.now); g.net.sendAct(m.from, 'friend_ok'); }
          break;
        }
        this.card(`⭐ ${name} 님이 친구 신청을 했어요`, '⭐ 친구 하기', () => {
          g.net.sendAct(m.from, 'friend_ok');
          this.befriend(m.from, name);
        });
        break;
      case 'friend_ok':
        if (so.accepted('friend', m.from, this.now)) this.befriend(m.from, name);
        break;
      case 'gift': {
        if (!validGift(m.item, m.n, CATALOG) || m.item === 'paddy') break; // 정해진 물건·개수만
        const it = CATALOG[m.item], eco = g.economy;
        if (CROPS[m.item]) eco.addCrop(m.item, m.n); else if (PRODUCTS[m.item]) eco.addProduct(m.item, m.n); else eco.addItem(m.item, m.n);
        so.stats.giftsGot++;
        if (r) r.unico.playAction('present', 1.2);
        g.audio.play('coin');
        g.player.unico.playAction('heart', 1.4);
        g.ui.toast(`🎁 ${name} 님이 ${it.emoji} ${it.name} ${m.n}개를 보냈어요! 가방에 넣었어요`);
        saveGame(g);
        break;
      }
    }
  }

  celebrate(id, name) {
    const g = this.game, r = this.remote(id);
    if (r) { this.face(r); r.unico.playAction('cheer', 1.4); }
    g.player.unico.playAction('cheer', 1.4);
    g.audio.play('win');
    g.juice?.pop?.(g.player.unico.group);
    const coins = g.social.highFive(name);
    if (coins) g.economy.earn(coins);
    g.ui.toast(`🙌 ${name} 님과 하이파이브!${coins ? ` +${coins}🪙` : ''}`);
    g.onEvent('highfive');
    saveGame(g);
  }

  befriend(id, name) {
    const g = this.game, r = this.remote(id);
    if (!g.social.addFriend(name)) return;
    if (r) g.net.labelOf(r);
    g.player.unico.playAction('heart', 1.4);
    g.audio.play('levelup');
    g.ui.toast(`⭐ ${name} 님과 친구가 됐어요! 들어오면 알려 드릴게요`);
    g.onEvent('friend', g.social.friends.length);
    saveGame(g);
  }

  /** 받은 요청 카드 (12초 뒤 사라짐) */
  card(text, okLabel, onOk) {
    const c = el('div', 'soc-req', `<span>${esc(text)}</span>`);
    const ok = el('button', 'gold', okLabel), no = el('button', 'ghost', '✕');
    const close = () => { c.classList.add('out'); setTimeout(() => c.remove(), 250); };
    ok.onclick = () => { close(); onOk(); };
    no.onclick = close;
    c.append(ok, no);
    this.box.append(c);
    while (this.box.children.length > 3) this.box.firstChild.remove();
    this.game.audio.play('pop', 0.5);
    setTimeout(close, 12000);
  }
}

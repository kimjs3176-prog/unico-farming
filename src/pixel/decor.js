import { DecorSim, DECOR, DECOR_BY_ID, DECOR_CATS, DECOR_MAX } from '../game/sim/decor.js';
import { withJosa } from '../game/sim/josa.js';
import { MW, G, PLOTS, RANCH, FIELD, PADDIES, TRACTOR_HOME, SMART, SITES, HIVES, OUT, NPCS } from './map.js';

/**
 * 농장 꾸미기 (도트판) — 규칙은 3D 판 sim/decor.js 그대로
 *  - ☰ 메뉴 → 꾸미기(또는 B): 소품을 골라 유니코 앞 칸에 미리보기(초록 가능/빨강 불가) → E 놓기 · R 뒤집기 · Esc 그만
 *  - 놓인 소품 앞에서 E: 옮기기(무료) · 치우기(보관함, 다시 놓을 때 무료)
 *  - 칸 좌표를 반으로 줄여 저장 (sim 의 저장 검사 |x|<60 안에 들도록)
 *  - 못 놓는 곳: 물·밭·논·목장·트랙터 밭·스마트팜·건설 부지·벌통·주민 자리·건물 앞·길 위의 큰 물건·집 안
 */
const T = 32;
const K = 2; // 칸 → 저장 좌표 (x / 2)

export function initDecor(game) {
  game.decor = new DecorSim();
  game.decorMode = null; // { id, rot, move: index|undefined }
}
export const decorSave = (game) => game.decor.toJSON();
export function decorLoad(game, d) { game.decor.load(d); game.decorRebuild(); }

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

export const DecorMethods = {
  decorTiles() { return this.decor.placed.map((p) => ({ x: Math.round(p.x * K), y: Math.round(p.z * K), p })); },
  /** 막힘 칸 다시 만들기 (놓은 소품 중 반지름 > 0 인 것) */
  decorRebuild() {
    if (this._decorSolid) for (const i of this._decorSolid) this.map.solid[i] = 0;
    this._decorSolid = [];
    for (const { x, y, p } of this.decorTiles()) {
      if (DECOR_BY_ID[p.id].r <= 0) continue;
      const i = y * MW + x;
      if (!this.map.solid[i]) { this.map.solid[i] = 1; this._decorSolid.push(i); }
    }
  },
  decorAt(x, y) { const i = this.decor.placed.findIndex((p) => Math.round(p.x * K) === x && Math.round(p.z * K) === y); return i; },

  /** (x,y) 에 소품을 놓을 수 없는 이유 (없으면 null) */
  decorWhyNotHere(id, x, y, ignore = -1) {
    const d = DECOR_BY_ID[id];
    if (y >= OUT || x < 1 || y < 1 || x >= MW - 1) return '여기엔 놓을 수 없어요';
    const gnd = this.map.ground[y * MW + x];
    if (gnd === G.water || gnd === G.paddy || gnd === G.field || gnd === G.soil || gnd === G.dock || gnd === G.cliff || gnd === G.stairs) return '물가·밭·논에는 놓을 수 없어요';
    if (gnd === G.path && d.r > 0) return '길 위에는 큰 물건을 놓을 수 없어요';
    if (inRect(x, y, PLOTS.x - 1, PLOTS.y - 1, PLOTS.x + PLOTS.cols, PLOTS.y + PLOTS.rows)) return '밭 둘레에는 놓을 수 없어요';
    if (inRect(x, y, RANCH.x0, RANCH.y0, RANCH.x1, RANCH.y1)) return '목장 안에는 놓을 수 없어요';
    if (inRect(x, y, FIELD.x - 1, FIELD.y - 1, FIELD.x + FIELD.cols, FIELD.y + FIELD.rows) || inRect(x, y, TRACTOR_HOME.x - 1, TRACTOR_HOME.y - 1, TRACTOR_HOME.x + 1, TRACTOR_HOME.y + 1)) return '트랙터 밭에는 놓을 수 없어요';
    if (PADDIES.some((P) => inRect(x, y, P.x - 1, P.y - 1, P.x + 3, P.y + 3))) return '논 둘레에는 놓을 수 없어요';
    if (inRect(x, y, SMART.x - 1, SMART.y - 1, SMART.x + SMART.w, SMART.y + SMART.h)) return '스마트팜 둘레에는 놓을 수 없어요';
    if (SITES.some((S) => inRect(x, y, S.x - 1, S.y - S.h, S.x + S.w, S.y + 1))) return '건설 부지에는 놓을 수 없어요';
    if (HIVES.some((H) => Math.abs(H.x - x) + Math.abs(H.y - y) <= 1)) return '벌통 옆에는 놓을 수 없어요';
    if (NPCS.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1)) return '주민 자리 옆에는 놓을 수 없어요';
    const own = this.decorAt(x, y);
    if (own >= 0 && own !== ignore) return '다른 소품이 있어요';
    if (own < 0 && this.solid(x, y)) return '막힌 곳이에요';
    if (this.objAt(x, y) || this.objAt(x, y - 1)) return '건물·물건 앞은 비워 두세요';
    if (this.entityAt(x, y) || this.tractorTile(x, y)) return '누가 서 있어요';
    if (this.player.x === x && this.player.y === y) return '발밑에는 놓을 수 없어요';
    return null;
  },

  /* ── 창 ── */
  decorMenu() {
    if (this.indoors) { this.ui.toast('꾸미기는 바깥 농장에서 해요', 'star'); return; }
    const D = this.decor, e = this.econ;
    this.ui.openMenu({
      title: '꾸미기', tabs: [...DECOR_CATS.map(([id, label]) => ({ id, label: label.replace(/^\S+\s/, '') })), { id: 'placed', label: '놓은 것' }], tab: 'garden',
      build: (tab) => {
        const sub = `놓은 소품 <b>${D.count}</b>/${DECOR_MAX} · 가진 돈 ${e.money.toLocaleString()}코인 · 보관함에 있는 건 무료`;
        if (tab === 'placed') {
          return {
            sub, empty: '아직 놓은 소품이 없어요',
            items: D.placed.map((p, i) => ({ icon: 'star', label: `${DECOR_BY_ID[p.id].name}`, right: `(${Math.round(p.x * K)}, ${Math.round(p.z * K)})`, onPick: () => { this.ui.closeMenu(); this.decorFocus(i); } })),
          };
        }
        const items = DECOR.filter((d) => d.cat === tab).map((d) => {
          const why = D.whyNot(d.id, { money: e.money, level: this.level });
          const st = D.storedOf(d.id);
          return { img: this.S.decorIcon(d.id), label: `${d.name}${d.lv > this.level ? ` (Lv.${d.lv})` : ''}`, right: st ? `보관 ${st} · 무료` : `${d.price}`, disabled: !!why, onPick: () => { this.ui.closeMenu(); this.decorStart(d.id); } };
        });
        return { sub, items, foot: '<kbd>↑↓</kbd> 고르기 · <kbd>E</kbd> 골라서 놓으러 가기 · <kbd>Esc</kbd> 닫기' };
      },
    });
  },
  decorStart(id, move) {
    this.decorMode = { id, rot: move !== undefined ? this.decor.placed[move].rot : 0, move };
    this.ui.toast(`${DECOR_BY_ID[id].name}: 앞 칸이 초록이면 E 놓기 · R 뒤집기 · Esc 그만`, 'star');
  },
  decorFocus(i) { const p = this.decor.placed[i]; if (p) this.ui.toast(`${DECOR_BY_ID[p.id].name} 자리: (${Math.round(p.x * K)}, ${Math.round(p.z * K)})`, 'star'); },
  /** 놓을 칸 = 바라보는 앞 칸 */
  decorSpot() { const [x, y] = this.facing(); return { x, y }; },
  decorKey(k) {
    const M = this.decorMode; if (!M) return false;
    if (k === 'back') { this.decorMode = null; this.ui.toast('꾸미기를 그만뒀어요', 'star'); return true; }
    if (k === 'rot') { M.rot = (M.rot + 4) % 8; this.audio.play('click'); return true; }
    if (k !== 'ok') return false;
    const { x, y } = this.decorSpot();
    const why = this.decorWhyNotHere(M.id, x, y, M.move ?? -1);
    if (why) { this.ui.toast(why, 'star'); this.audio.play('bump', 0.4); return true; }
    const D = this.decor;
    if (M.move !== undefined) {
      D.move(M.move, x / K, y / K, M.rot);
      this.decorMode = null;
    } else {
      const cost = D.place(M.id, x / K, y / K, M.rot, { money: this.econ.money, level: this.level });
      if (cost < 0) { this.ui.toast(D.whyNot(M.id, { money: this.econ.money, level: this.level }) || '놓을 수 없어요', 'star'); return true; }
      if (cost) { this.econ.money -= cost; this.econ.stats.spent += cost; }
      // 같은 걸 하나 더 놓을 수 있으면 계속 (돈이 모자라면 끝)
      if (D.whyNot(M.id, { money: this.econ.money, level: this.level })) this.decorMode = null;
      this.report('decor', D.count);
    }
    this.decorRebuild();
    this.audio.play('plant'); this.puff(x * T + 16, y * T + 26, 6);
    this.ui.toast(`${withJosa(DECOR_BY_ID[M.id].name, '을/를')} ${M.move !== undefined ? '옮겼어요' : '놓았어요'}`, 'star');
    return true;
  },
  /** 놓인 소품 앞에서 E */
  decorTarget(x, y) {
    const i = this.decorAt(x, y);
    if (i < 0) return null;
    const p = this.decor.placed[i], d = DECOR_BY_ID[p.id];
    return {
      label: `${d.name} (꾸미기)`,
      run: async () => {
        const c = await this.ui.say('꾸미기', `${d.name}. 어떻게 할까요?`, ['옮기기', '치우기 (보관함)', '그대로']);
        if (c === 0) this.decorStart(p.id, i);
        else if (c === 1) { this.decor.pickUp(i); this.decorRebuild(); this.audio.play('pop'); this.ui.toast(`${withJosa(d.name, '을/를')} 보관함에 넣었어요 (다시 놓을 때 무료)`, 'star'); }
      },
    };
  },

  /* ── 그리기 ── */
  pushDecorDrawables(out) {
    const S = this.S;
    for (const { x, y, p } of this.decorTiles()) {
      if (this.decorMode?.move !== undefined && this.decor.placed[this.decorMode.move] === p) continue;
      const sp = S.decor(p.id, p.rot >= 4);
      out.push({ img: sp.img, x: x * T + 16 - sp.ax, y: y * T + T - sp.ay, sy: y * T + T - 4, st: true, tall: sp.tall, glow: sp.glow });
    }
    const M = this.decorMode;
    if (M && !this.ui.busy) {
      const { x, y } = this.decorSpot();
      const ok = !this.decorWhyNotHere(M.id, x, y, M.move ?? -1);
      const sp = S.decor(M.id, M.rot >= 4);
      out.push({ img: sp.img, x: x * T + 16 - sp.ax, y: y * T + T - sp.ay, sy: y * T + T - 4, alpha: 0.75, ghost: ok ? 'ok' : 'no', gx: x * T, gy: y * T });
    }
  },
  decorLights() {
    const L = [];
    for (const { x, y, p } of this.decorTiles()) if (p.id === 'lamp') L.push({ x: x * T + 16, y: y * T + T - 56, r: 92, c: [255, 200, 120], lamp: true });
    return L;
  },
};

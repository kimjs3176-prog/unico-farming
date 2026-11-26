import { EncounterState, rollWild, wildLevel, recordWild, REPEL_PRICE, FIRST_WIN_BONUS } from './encounter_sim.js';
import { ENEMIES } from './battle_sim.js';
import { MW, MH, G, PLOTS, RANCH, FIELD, PADDIES, SMART, SITES, HIVES, OUT, NPCS, SPAWN, HOME } from './map.js';

/**
 * 풀숲 인카운터 (포켓몬처럼): 밭·논·목장 둘레 풀숲을 걸으면 밭을 노리는 야생 동물이 튀어나와 배틀
 *  - 풀숲은 수풀이 무릎까지 와서 걸으면 하반신이 가려지고, 지나가면 바스락 흔들림
 *  - 한 칸마다 추첨(encounter_sim.js) → ❗ → 화면 번쩍 → 배틀 (낮: 까마귀·참새떼·고라니·두더지 / 밤: 산여우·늑대·멧돼지)
 *  - 이기면 코인·경험치(레벨이 오름), 처음 이긴 동물은 보너스. 지면 눈앞이 캄캄해져 집 앞에서 깨어나고, 동물이 밭을 조금 망침
 *  - 장터의 쑥 향주머니: 한동안 풀숲에서 안 나옴 · ☰ 메뉴의 야생 동물 도감에 만난 동물이 기록됨
 */
const T = 32;
export const WILD_ORDER = ['sparrow', 'crow', 'mole', 'gorani', 'boar', 'fox', 'wolf'];
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (x, y, s) => { // 낮은 주파수 값 잡음 (덩어리진 풀숲)
  const fx = x / s, fy = y / s, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, v = fy - yi;
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
};

export function initEncounter(game) {
  game.enc = new EncounterState();
  game.flags.wild ||= {};
  // 풀숲 칸: 밭·논·트랙터 밭·목장 둘레 5칸 안의 풀밭 중 잡음이 높은 곳 (길·물·막힌 칸·주민 자리·출발점 근처는 빼고)
  const farmland = [];
  const rect = (x0, y0, x1, y1) => farmland.push([x0, y0, x1, y1]);
  rect(PLOTS.x, PLOTS.y, PLOTS.x + PLOTS.cols - 1, PLOTS.y + PLOTS.rows - 1);
  rect(RANCH.x0, RANCH.y0, RANCH.x1, RANCH.y1);
  rect(FIELD.x, FIELD.y, FIELD.x + FIELD.cols - 1, FIELD.y + FIELD.rows - 1);
  for (const P of PADDIES) rect(P.x, P.y, P.x + 2, P.y + 2);
  const dist = (x, y) => Math.min(...farmland.map(([x0, y0, x1, y1]) => Math.max(x0 - x, 0, x - x1) + Math.max(y0 - y, 0, y - y1)));
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const tg = new Set();
  for (let y = 2; y < Math.min(MH, OUT) - 1; y++) for (let x = 2; x < MW - 2; x++) {
    const i = y * MW + x, gnd = game.map.ground[i];
    if (gnd !== G.grass && gnd !== G.hill) continue;
    if (game.map.solid[i] || game.objAt(x, y) || game.objAt(x, y + 1)) continue;
    const d = dist(x, y);
    // 밭 둘레(2~8칸)는 풀숲이 잘 자라고, 언덕·바깥 들판은 덩어리로 드문드문 (밭 바로 옆 한 칸은 일하러 다니는 길)
    const nz = smooth(x, y, 3.2);
    if (d < 2) continue;
    if (d <= 8 ? nz < 0.42 : nz < (gnd === G.hill ? 0.55 : 0.68)) continue;
    if (NPCS.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 2) || Math.abs(SPAWN.x - x) + Math.abs(SPAWN.y - y) <= 4) continue;
    if (inRect(x, y, SMART.x - 1, SMART.y - 1, SMART.x + SMART.w, SMART.y + SMART.h) || SITES.some((S) => inRect(x, y, S.x - 1, S.y - S.h, S.x + S.w, S.y + 1)) || HIVES.some((H) => Math.abs(H.x - x) + Math.abs(H.y - y) <= 1)) continue;
    if (Math.abs(HOME.outDoor.x - x) <= 2 && Math.abs(HOME.outDoor.y - y) <= 2) continue;
    // 길 바로 옆 칸은 빼서 큰길로는 풀숲을 안 밟고 다닐 수 있게
    const nearPath = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => game.map.ground[(y + dy) * MW + x + dx] === G.path).length;
    if (nearPath >= 2) continue;
    tg.add(i);
  }
  // 외톨이 칸은 지움 (덩어리만 남김)
  for (const i of [...tg]) { const x = i % MW, y = (i / MW) | 0; const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => tg.has((y + dy) * MW + x + dx)).length; if (n < 2) tg.delete(i); }
  game.tallGrass = tg;
  game.grassRustle = new Map(); // 칸 → 흔들림 남은 시간
}
export const encounterSave = (g) => g.enc.toJSON();
export function encounterLoad(g, d) { g.enc.load(d); }

export const EncounterMethods = {
  inTallGrass(x, y) { return this.tallGrass.has(y * MW + x); },
  /** 매 프레임: 풀숲을 걸은 거리만큼 추첨 */
  encounterTick(dt, frozen) {
    for (const [k, t] of this.grassRustle) { if (t - dt <= 0) this.grassRustle.delete(k); else this.grassRustle.set(k, t - dt); }
    if (this.encounterT > 0) {
      this.encounterT -= dt;
      if (this.encounterT <= 0) this.openWildBattle();
      return;
    }
    if (frozen || this.battle || this.tr.driving || this.indoors || this.swimming) return;
    const p = this.player;
    if (!this.inTallGrass(p.x, p.y)) return;
    const moved = p.speed * dt;
    if (moved <= 0.5) return;
    const k = p.y * MW + p.x;
    if (!this.grassRustle.has(k)) { this.audio.play('stroke', 0.15); if (Math.random() < 0.6) this.parts.push({ kind: 'leaf', x: p.wx + (Math.random() - 0.5) * 12, y: p.wy - 10, vx: (Math.random() - 0.5) * 30, vy: -20, a: 0, life: 0.6, decay: 1.6, col: 'rgb(115,182,82)' }); }
    this.grassRustle.set(k, 0.35);
    const before = this.enc.repel;
    if (this.enc.walk(moved)) this.beginWild();
    else if (before > 0 && this.enc.repel === 0) this.ui.toast('쑥 향주머니 향이 다 날아갔어요', 'seed');
  },
  /** ❗ → 번쩍 → 배틀 */
  beginWild() {
    const night = this.night > 0.5;
    const kind = rollWild(Math.random, { night, season: this.season.id });
    const elv = wildLevel(Math.random, this.level, kind);
    this.wildNext = { kind, elv, night };
    this.encounterT = 0.75;
    this.player.vx = this.player.vy = 0; this.held = []; this.path = null;
    this.wildBang = true;
    this.audio.play('bump', 0.7);
    this.ui.flash?.();
  },
  openWildBattle() {
    const w = this.wildNext; this.wildNext = null; this.wildBang = false;
    if (!w || this.battle) return;
    recordWild(this.flags.wild, w.kind, { won: false });
    this.startBattle({ kind: w.kind, name: ENEMIES[w.kind].name, encounter: true, elv: w.elv, night: w.night });
  },
  /** 배틀 결과 (battle.js 가 부름) → 보상·벌칙 */
  wildResult(P, sim) {
    const book = this.flags.wild;
    if (sim.state === 'win') {
      const e = (book[P.kind] ||= { seen: 1, won: 0, best: 0 });
      const first = e.won === 0;
      e.won++; e.best = Math.max(e.best, P.elv);
      const coins = sim.reward() + (first ? FIRST_WIN_BONUS : 0);
      this.econ.earn(coins); this.coinBurst?.(coins);
      const lv = this.quests.gainXp(sim.xp());
      this.report('shoo');
      return { coins, xp: sim.xp(), first, levelUp: lv.levelUp ? lv : null };
    }
    if (sim.state === 'lose') {
      // 동물이 밭을 조금 망침 (자라는 작물 하나)
      const grow = this.farm.plots.map((p, i) => [p, i]).filter(([p]) => p.state === 'growing' || p.state === 'ready');
      let hurt = null;
      if (grow.length && P.kind !== 'fox' && P.kind !== 'wolf') { const [pl, i] = grow[Math.floor(Math.random() * grow.length)]; if (pl.state === 'ready') { pl.state = 'growing'; pl.progress = 0.5; } else pl.progress = Math.max(0, pl.progress - 0.3); hurt = i; }
      else for (const a of this.ranch.animals) { a.aff = Math.max(0, a.aff - 3); }
      const lost = Math.min(this.econ.money, Math.floor(this.econ.money * 0.1));
      if (lost > 0) this.econ.spend(lost);
      return { hurt, lost };
    }
    return {};
  },
  /** 진 뒤: 집 앞에서 깨어남 */
  async wakeAtHome() {
    await this.teleport(HOME.outDoor.x, HOME.outDoor.y + 1, 'down');
    this.ui.toast('집 앞에서 정신을 차렸어요. 콩이가 꼬리를 흔들며 기다렸어요', 'heart');
  },
  buyRepel() {
    if (!this.econ.spend(REPEL_PRICE)) { this.ui.toast('코인이 모자라요', 'coin'); return false; }
    this.enc.useRepel(); this.audio.play('coin');
    this.ui.toast(`쑥 향주머니를 달았어요! 한동안 풀숲에서 야생 동물이 안 나와요 (${this.enc.repel}칸)`, 'seed');
    return true;
  },
  wildBookMenu() {
    const book = this.flags.wild;
    const met = WILD_ORDER.filter((k) => book[k]?.seen).length;
    this.ui.openMenu({
      title: `야생 동물 도감 ${met}/${WILD_ORDER.length}`,
      build: () => ({
        sub: '밭·논·목장 둘레 풀숲을 걸으면 튀어나와요 · 낮과 밤, 계절마다 나오는 동물이 달라요',
        items: WILD_ORDER.map((k) => {
          const e = book[k], E = ENEMIES[k];
          return e?.seen
            ? { img: this.S.pestIcon(k), label: `${E.name} · 약점 ${E.weak.length}가지`, right: `만남 ${e.seen} · 쫓음 ${e.won}${e.best ? ` · 최고 Lv.${e.best}` : ''}`, onPick: () => {} }
            : { icon: 'quest', label: '??? (아직 못 만났어요)', right: '', disabled: true, onPick: () => {} };
        }),
      }),
    });
  },

  /* ── 그리기 ── */
  pushGrassDrawables(out) {
    if (this.indoors) return;
    const S = this.S, p = this.player, t = performance.now() / 1000;
    const x0 = p.x - 22, x1 = p.x + 22, y0 = p.y - 14, y1 = p.y + 14;
    for (const i of this.tallGrass) {
      const x = i % MW, y = (i / MW) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const rs = this.grassRustle.get(i) || 0;
      const sway = rs > 0 ? Math.round(Math.sin(rs * 40) * 2) : Math.round(Math.sin(t * 1.4 + x * 0.7 + y * 0.3) * 0.6);
      const v = (x * 7 + y * 3) % 3;
      out.push({ img: S.tallGrass.back[v], x: x * T + sway * 0.5, y: y * T - 6, sy: y * T + 2, st: true });
      out.push({ img: S.tallGrass.front[v], x: x * T + sway, y: y * T + 10, sy: y * T + T + 6, st: true });
    }
  },
};

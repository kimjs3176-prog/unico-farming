import { SmartFarmSim, SMART_TIME } from '../game/sim/smartfarm.js';
import {
  DIVISIONS, PASS_SCORE, TOUR_REWARD, StampBook, makeMatchRound, makeStagesRound, makeInspectRound, makeCarbonRound, makeConveyor, SEED_KINDS, scoreRun, scoreConveyor,
} from '../game/sim/koat.js';
import { Angling, RODS, BAIT_RARE, ReelFight, needsFight } from '../game/sim/angling.js';
import { TownSim, BUILDINGS } from '../game/sim/town.js';
import { CROPS } from '../game/sim/crops.js';
import { ITEMS } from '../game/sim/items.js';
import { LAKE, HILLS, CHESTS, SITES, SMART, HIVES, DOCK, G, MW } from './map.js';

const HONEY_TIME = 150; // 3D 판과 같음: 낮·맑은 날 기준 꿀이 가득 차는 시간(초)

/**
 * 도트판 새 지역: 스마트팜 · KOAT 체험관 · 낚시터 · 새 마을 부지 · 언덕 전망대 · 보물 상자
 * 규칙은 3D 판과 같은 sim 모듈, 화면은 도트판 대화창·계기판
 */
const T = 32;
const nameOf = (k) => (CROPS[k] || ITEMS[k])?.name || k;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function initRegions(g) {
  g.smart = new SmartFarmSim();
  g.smartRun = null;      // 진행 중인 환경제어 { koat }
  g.smartBoostT = 0;      // 밭 성장 부스트 남은 초
  g.smartBoostMult = 1;
  g.stamps = new StampBook();
  g.angling = new Angling();
  g.fight = null;         // 큰 물고기 힘겨루기
  g.reeling = false;
  g.town = new TownSim(SITES.length);
  g.lookouts = {};        // 전망대 첫 방문
  g.chestDay = CHESTS.map(() => 0);
  g.pano = null;          // 전망대 파노라마 연출
  g.hives = HIVES.map(() => ({ honey: Math.random() * 0.6 }));
  g.swimming = false; g.swimT = 0;
  g.diving = null;        // 잠수 { t, spot }
  // 잠수 보물 자리: 호수 안쪽 반짝이는 곳 5개 (부두는 피해서)
  g.diveSpots = [];
  for (let k = 0; g.diveSpots.length < 5 && k < 200; k++) {
    const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.45;
    const x = (LAKE.cx + Math.cos(a) * r * LAKE.rx) * T, y = (LAKE.cy + Math.sin(a) * r * LAKE.ry) * T;
    if (Math.abs(x - (DOCK.x + 1) * T) < 80) continue;
    if (g.diveSpots.some((p) => Math.hypot(p.x - x, p.y - y) < 120)) continue;
    g.diveSpots.push({ x, y, on: true, respawn: 0 });
  }
}

export const regionSave = (g) => ({ hives: g.hives.map((h) => +h.honey.toFixed(3)), smartBoostT: g.smartBoostT, smartBoostMult: g.smartBoostMult, stamps: g.stamps.toJSON(), angling: g.angling.toJSON(), town: g.town.toJSON(), lookouts: g.lookouts, chestDay: g.chestDay });
export function regionLoad(g, d) {
  if (!d) return;
  g.smartBoostT = d.smartBoostT || 0; g.smartBoostMult = d.smartBoostMult || 1;
  g.stamps.load(d.stamps); g.angling.load(d.angling); g.town.load(d.town);
  if (Array.isArray(d.hives)) d.hives.forEach((v, i) => { if (g.hives[i]) g.hives[i].honey = v; });
  g.lookouts = d.lookouts || {}; if (Array.isArray(d.chestDay)) g.chestDay = CHESTS.map((_, i) => d.chestDay[i] || 0);
  applyTown(g);
}

/** 완성된 건물 효과를 농장 전체에 반영 */
export function applyTown(g) {
  const e = g.town.effects();
  g.econ.sellMult = e.sellMult;
  g.farm.buildMult = e.growMult;
  g.farm.waterMult = e.waterMult;
}

export const RegionMethods = {
  boothName(i) { return DIVISIONS[i]?.name; },
  /* ── 매 프레임 ── */
  regionTick(dt, busy) {
    if (!busy) {
      // 스마트팜 부스트
      if (this.smartBoostT > 0) { this.smartBoostT -= dt; if (this.smartBoostT <= 0) { this.smartBoostT = 0; this.ui.toast('스마트팜 성장 부스트가 끝났어요', 'seed'); } }
      this.farm.boost = this.smartBoostT > 0 ? this.smartBoostMult : 1;
      // 공사
      for (const i of this.town.tick(dt)) {
        const B = BUILDINGS[this.town.sites[i].type];
        this.audio.play('levelup'); this.ui.toast(`${B.name} 완공! ${B.desc}`, 'star');
        this.report('built'); applyTown(this);
        const S = SITES[i]; for (let k = 0; k < 14; k++) this.parts.push({ kind: 'puff', x: (S.x + Math.random() * S.w) * T, y: (S.y + S.h) * T - 4, vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 20, life: 1, decay: 1.2 });
      }
      // 공사 중 흙먼지·망치 소리
      this.town.sites.forEach((s, i) => {
        if (s.state !== 'building' || Math.random() > dt * 3) return;
        const S = SITES[i]; this.parts.push({ kind: 'puff', x: (S.x + Math.random() * S.w) * T, y: (S.y + S.h) * T - 6, vx: (Math.random() - 0.5) * 16, vy: -8, life: 1, decay: 1.6 });
        const p = this.player; if (Math.hypot(p.wx - (S.x + 2) * T, p.wy - (S.y + 2) * T) < 260 && Math.random() < 0.3) this.audio.play('dig', 0.15);
      });
    }
    this.waterTick(dt, busy);
    if (this.smartRun) this.smartTick(dt);
    if (this.fight) this.fightTick(dt);
    if (this.pano) { this.pano.t += dt; if (this.pano.t >= this.pano.len) this.pano = null; }
  },

  /** 새 날: 방앗간 수입·정자 선물·의뢰·보물 상자 */
  regionNewDay() {
    const r = this.town.newDay();
    if (r.coins) { this.econ.earn(r.coins); this.ui.toast(`풍차 방앗간 수입 +${r.coins}코인`, 'coin'); }
    for (const [id, n] of r.gifts) { this.econ.addItem(id, n); this.ui.toast(`쉼터 정자에 주민 선물: ${nameOf(id)} × ${n}`, 'gift'); }
  },

  /* ── 상호작용 ── */
  regionTarget(o) {
    switch (o.type) {
      case 'greenhouse': return { label: `비닐하우스${this.smartBoostT > 0 ? ` (성장 부스트 ×${this.smartBoostMult} 남은 ${Math.ceil(this.smartBoostT)}초)` : ''}`, run: () => this.ui.say('스마트팜', '센서가 온도·습도·CO₂ 를 재고, 조작반으로 난방·환기·분무·CO₂ 공급을 해요. 옆의 센서 조작반에서 환경 제어를 해 보세요! 잘하면 밭 작물이 더 빨리 자라요.') };
      case 'sensor': return { label: '스마트팜 환경 제어 (미니게임)', run: () => this.beginSmart() };
      case 'solar': return { label: '태양광 패널', run: () => this.ui.say('', '비닐하우스 난방과 센서 전기를 태양광으로 만들어요.') };
      case 'koat_hq': return { label: 'KOAT 본관', run: () => this.ui.say('한국농업기술진흥원', '농업 기술 사업화·창업·종자·스마트농업·농기계 검정·농업환경 분석을 맡는 기관이에요. 광장의 본부 부스 6곳을 체험하고 안내데스크에서 스탬프를 보여 주세요!') };
      case 'desk': return { label: `안내데스크 · 스탬프 투어 (${this.stamps.count}/${DIVISIONS.length})`, run: () => this.koatDesk() };
      case 'booth': return { label: `${DIVISIONS[o.div].name} 부스 체험`, run: () => this.koatBooth(o.div) };
      case 'fountain': return { label: '분수', run: () => this.ui.say('', '시원한 물줄기가 반짝여요.') };
      case 'flag': return null;
      case 'fishshop': return { label: '낚시 가게', run: () => this.fishShop() };
      case 'board': return { label: '낚시터 기록판 · 오늘의 의뢰', run: () => this.fishBoard() };
      case 'site': return this.siteInfo(o.site);
      case 'lookout': return { label: `${HILLS.find((h) => h.id === o.hill).name} 전망대`, run: () => this.lookout(o.hill) };
      case 'hive': return this.hiveTarget(o.hive);
      case 'chest': return { label: this.chestDay[o.chest] === this.day ? '빈 보물 상자 (내일 다시)' : '보물 상자 열기', run: () => this.openChest(o.chest) };
    }
    return undefined;
  },

  /* ─────────── 스마트팜 환경 제어 ─────────── */
  async beginSmart(koat = null) {
    if (!koat) {
      const c = await this.ui.say('스마트팜 환경 제어', `${SMART_TIME}초 동안 온도·습도·CO₂ 를 모두 초록 범위에 맞춰요. 1 난방 · 2 환기(셋 다 낮춤) · 3 분무 · 4 CO₂ 공급 (버튼을 눌러도 돼요). 햇볕·소나기·찬바람 같은 돌발 상황도 생겨요!`, ['시작!', '다음에']);
      if (c !== 0) return;
    }
    this.player.vx = this.player.vy = 0;
    this.smart.start({ events: true });
    this.smartRun = { koat, ready: 1.2 };
    this.ui.smart(this.smart, (k) => this.smartAct(k));
  },
  smartAct(k) { if (!this.smartRun || this.smartRun.ready > 0) return; this.smart.act(k); this.audio.play('click'); },
  smartTick(dt) {
    const R = this.smartRun;
    if (R.ready > 0) { R.ready -= dt; this.ui.smart(this.smart, null, '준비…'); return; }
    const done = this.smart.tick(dt);
    if (this.smart.newEvent) { this.ui.toast(this.smart.newEvent.name.replace(/^\S+\s/, ''), 'rain'); this.audio.play('bump', 0.4); this.smart.newEvent = null; }
    this.ui.smart(this.smart, null, this.smart.event ? this.smart.event.name.replace(/^\S+\s/, '') : this.smart.allGood() ? '좋아요! 모두 적정 범위' : '초록 범위를 벗어났어요');
    if (done) this.finishSmart();
  },
  finishSmart() {
    const R = this.smartRun; this.smartRun = null; this.ui.smart(null);
    const r = this.smart.result();
    if (R.koat !== null && R.koat !== undefined) return this.koatResult(R.koat, r.score, [`적정 환경 유지 ${this.smart.good.toFixed(1)}초 / ${SMART_TIME}초`]);
    this.econ.earn(r.money); this.report('smartfarm');
    if (r.boostSeconds) { this.smartBoostT = r.boostSeconds; this.smartBoostMult = r.boost; }
    this.audio.play(r.score >= 50 ? 'win' : 'bump');
    const stars = r.score >= 90 ? 3 : r.score >= 70 ? 2 : r.score >= 50 ? 1 : 0;
    this.ui.say('스마트팜 점검 결과', `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${r.score}점 · 적정 유지 ${this.smart.good.toFixed(1)}초 · 보상 ${r.money}코인${r.boostSeconds ? ` · 밭 작물 성장 ×${r.boost} 부스트 ${r.boostSeconds}초!` : ' · 50점 이상이면 밭 성장 부스트'}`);
  },

  /* ─────────── KOAT 체험관 ─────────── */
  async koatBooth(i) {
    const d = DIVISIONS[i];
    const best = this.stamps.best[d.id];
    const link = d.game.type === 'link'; // 기술사업본부: 외부 특허 체험 페이지
    const rule = link ? '체험하면 스탬프' : `${PASS_SCORE}점 이상이면 스탬프${best !== undefined ? ` · 최고 ${best}점` : ''}`;
    const c = await this.ui.say(`${d.name}`, `${d.summary} [체험] ${d.game.title}: ${d.game.how} (${rule}${this.stamps.stamps[d.id] ? ' · 스탬프 있음' : ''})`, [link ? `${d.game.title} (새 창)` : '체험 시작', '담당 팀 듣기', '다음에']);
    if (c === 1) { await this.ui.say(d.name, `우리 본부에는 ${d.teams.join(', ')}이(가) 있어요.`); return this.koatBooth(i); }
    if (c !== 0) return;
    const type = d.game.type;
    if (type === 'link') { // 새 창(탭)으로 열고, 처음이면 체험 완료로 스탬프
      window.open(d.game.url, '_blank', 'noopener,noreferrer');
      if (!this.stamps.stamps[d.id]) return this.koatResult(i, 100, ['특허 체험 페이지를 새 창으로 열었어요']);
      return this.ui.say(d.name, '새 창에서 특허 체험 페이지를 열었어요.');
    }
    if (type === 'smartfarm') return this.beginSmart(i);
    let score = 0; const lines = [];
    if (type === 'match') {
      const R = makeMatchRound(); const res = [];
      for (const tech of R.techs) {
        const a = await this.askTimed(d.game.title, `${tech} — 이 기술이 꼭 필요한 기업은?`, R.buyers, 12);
        const ok = a.i >= 0 && R.buyers[a.i] === R.answer[tech];
        res.push({ ok, left: a.left }); lines.push(`${ok ? 'O' : 'X'} ${tech} → ${R.answer[tech]}`);
        this.audio.play(ok ? 'coin' : 'bump', 0.5);
      }
      score = scoreRun(res);
    } else if (type === 'stages') {
      const R = makeStagesRound(); const res = [];
      for (const st of R) {
        const a = await this.askTimed(`${d.game.title} · ${st.stage}`, st.situation, st.options, 12);
        const ok = a.i === st.answer; res.push({ ok, left: a.left });
        if (!ok) await this.ui.say(d.name, `아쉬워요! ${st.why}`); else this.audio.play('coin', 0.5);
      }
      score = scoreRun(res);
    } else if (type === 'inspect') {
      const R = makeInspectRound(); const res = [];
      for (const it of R) {
        const a = await this.askTimed(d.game.title, `${it.name}: 측정값 ${typeof it.value === 'number' ? it.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : it.value}${it.unit} (기준 ${it.std}${it.unit})`, ['적합', '부적합'], 8);
        const ok = a.i >= 0 && (a.i === 0) === it.pass; res.push({ ok, left: a.left });
        this.audio.play(ok ? 'coin' : 'bump', 0.5); lines.push(`${ok ? 'O' : 'X'} ${it.name} → ${it.pass ? '적합' : '부적합'}`);
      }
      score = scoreRun(res);
    } else if (type === 'carbon') {
      const R = makeCarbonRound(); const res = [];
      for (const card of R) {
        const a = await this.askTimed(d.game.title, `「${card.text}」 온실가스를 줄이는 영농 방법일까요?`, ['감축 방법이에요', '아니에요'], 7);
        const ok = a.i >= 0 && (a.i === 0) === card.good; res.push({ ok, left: a.left });
        this.audio.play(ok ? 'coin' : 'bump', 0.5);
        if (!ok) await this.ui.say(d.name, card.why);
      }
      score = scoreRun(res);
    } else if (type === 'sort') {
      // 컨베이어: 하나씩 흘러오는 종자를 빨리 판단 (점점 빨라짐)
      const list = makeConveyor(Math.random, 16);
      let hit = 0, wrong = 0, total = 0;
      for (const [k, it] of list.entries()) {
        const K = SEED_KINDS[it.kind];
        if (K.bad) total++;
        const a = await this.askTimed(`${d.game.title} (${k + 1}/${list.length})`, `컨베이어에 ${K.label === '좋은 종자' ? '통통한 종자' : K.label.replace('종자', '것').replace('돌·이물질', '돌멩이')}이(가) 지나가요!`, ['골라내기', '통과'], Math.max(1.6, 3 - k * 0.09));
        const pick = a.i === 0;
        if (pick && K.bad) { hit++; this.audio.play('coin', 0.4); } else if (pick && !K.bad) { wrong++; this.audio.play('bump', 0.4); }
      }
      score = scoreConveyor(hit, wrong, total);
      lines.push(`불량 ${total}개 중 ${hit}개 골라냄 · 좋은 종자 실수 ${wrong}개`);
    }
    this.koatResult(i, score, lines);
  },
  /** 제한 시간 있는 선택 → { i(-1 = 시간 초과), left(0..1) } */
  askTimed(title, text, choices, sec) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let done = false;
      const tick = () => {
        if (done) return;
        const left = Math.max(0, sec - (performance.now() - t0) / 1000);
        this.ui.meter({ title, time: left, gauge: left / sec, band: [0, 0], ok: left > sec * 0.3, hot: left <= sec * 0.3, text: '제한 시간' });
        if (left <= 0) { done = true; this.ui.closeDlg(-1); return; }
        requestAnimationFrame(tick);
      };
      this.ui.say(title, text, choices).then((i) => { done = true; this.ui.meter(null); resolve({ i, left: Math.max(0, 1 - (performance.now() - t0) / 1000 / sec) }); });
      requestAnimationFrame(tick);
    });
  },
  koatResult(i, score, lines = []) {
    const d = DIVISIONS[i];
    const prev = this.stamps.best[d.id];
    const r = this.stamps.record(d.id, score);
    if (r.newStamp) { this.report('koatstamp'); this.report('koatall', this.stamps.count); this.audio.play('levelup'); }
    else this.audio.play(r.passed ? 'win' : 'bump');
    const stars = score >= 100 ? 3 : score >= 85 ? 2 : score >= PASS_SCORE ? 1 : 0;
    const msg = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${score}점${prev !== undefined && score > prev ? ' (새 최고!)' : ''} · ${r.passed ? (r.newStamp ? `${d.name} 스탬프 쾅! (${this.stamps.count}/${DIVISIONS.length})` : '통과!') : `${PASS_SCORE}점 이상이면 스탬프를 받아요`}${lines.length ? ' · ' + lines.slice(0, 3).join(' / ') : ''}`;
    this.ui.say(`${d.game.title} 결과`, msg);
  },
  async koatDesk() {
    const list = DIVISIONS.map((d) => `${this.stamps.stamps[d.id] ? '■' : '□'} ${d.name}`).join('  ');
    if (this.stamps.complete && !this.stamps.rewarded) {
      const w = this.stamps.claim();
      this.econ.earn(w.money); this.quests.xp += w.xp; this.audio.play('levelup');
      return this.ui.say('안내데스크', `와! 6개 본부 스탬프를 모두 모았네요. ${w.money}코인과 ${w.xp}XP, 칭호 "${w.title}"를 드려요! ${list}`);
    }
    return this.ui.say('안내데스크 (기획운영본부)', `광장 부스에서 본부 체험을 하고 ${PASS_SCORE}점 이상이면 스탬프를 받아요. 6개를 다 모으면 ${TOUR_REWARD.money}코인과 칭호를 드려요! ${list}`);
  },
  koatTalk(n) {
    if (n.koat === 'desk') return this.koatDesk();
    return this.koatBooth(n.koat);
  },

  /* ─────────── 낚시터 ─────────── */
  isLakeTile(x, y) { const u = (x + 0.5 - LAKE.cx) / LAKE.rx, v = (y + 0.5 - LAKE.cy) / LAKE.ry; return u * u + v * v < 1.2; },
  castOpts(lake) {
    const A = this.angling;
    const bait = lake && A.useBait && this.econ.useItem('bait');
    return { night: this.night > 0.6, raining: this.raining, lake, rare: (lake ? A.rodInfo.rare : 1) * (bait ? BAIT_RARE : 1), bait };
  },
  /** 입질에 당겼을 때: 큰 물고기면 힘겨루기로 */
  landFish(r, lake) {
    if (lake && needsFight(r.fish, r.size)) {
      this.fight = { sim: new ReelFight(r.fish, r.size, this.angling.rodInfo), fish: r.fish, size: r.size };
      this.reeling = false;
      this.audio.play('splash');
      this.ui.toast('큰 놈이다! 꾹 눌러 감고, 빨간 구간·몸부림 때는 손을 떼요', 'fish');
      return true;
    }
    return false;
  },
  fightTick(dt) {
    const F = this.fight, sim = F.sim;
    const ev = sim.tick(dt, this.reeling);
    if (ev === 'surge') this.audio.play('splash', 0.5);
    if (this.reeling && Math.random() < dt * 6) this.audio.play('click', 0.15);
    this.ui.meter({ title: `힘겨루기 · ${nameOf(F.fish)}`, gauge: sim.tension, band: [0, 0.75], ok: sim.tension < 0.75, hot: sim.tension >= 0.75, text: `${sim.surging ? '몸부림! 손을 떼요' : this.reeling ? '감는 중…' : '꾹 눌러 감기 (E·Space)'} · 남은 줄 ${Math.round(sim.line * 100)}%` });
    if (ev === 'landed' || ev === 'snapped' || ev === 'escaped') {
      this.fight = null; this.ui.meter(null); this.reeling = false;
      if (ev === 'landed') { this.startAct('pull', { ok: true }); this.report('fightwin'); this.catchFish(F.fish, F.size, true, true); }
      else { this.audio.play('bump'); this.ui.toast(ev === 'snapped' ? '줄이 끊어졌어요! 텐션이 빨간 구간이면 손을 떼요' : '물고기가 도망갔어요…', 'fish'); }
    }
  },
  /** 잡은 물고기 기록 (연못·호수 공통) */
  catchFish(fish, size, lake, fought = false) {
    this.econ.addItem(fish); const b = this.book.add(fish, { size, day: this.day }); this.checkBook();
    this.audio.play('win'); this.report('fish');
    let extra = '';
    if (lake) {
      this.report('lakefish');
      const rec = this.angling.record(fish, size, this.day, { fought });
      if (rec.request) extra += ' · 오늘의 의뢰 달성! 낚시꾼에게 보고해요';
      if (rec.biggest) extra += ' · 낚시터 최대어!';
    }
    this.popIcon('fish', this.player.wx, this.player.wy - 50);
    this.ui.say('', `${nameOf(fish)}을(를) 낚았다! ${size}cm${b.isNew ? ' (도감 등록!)' : b.isRecord ? ' (최대 크기 갱신!)' : ''}${extra}`);
  },
  fishShop() {
    const A = this.angling, e = this.econ;
    const fisher = this.npcs.find((n) => n.id === 'fisher');
    if (fisher) fisher.talking = true;
    this.ui.openMenu({
      title: '낚시 가게', onClose: () => { if (fisher) fisher.talking = false; },
      build: () => {
        const req = A.today(this.day);
        const items = [];
        if (req.done && !req.claimed) items.push({ icon: 'star', label: `의뢰 보고: ${nameOf(req.fish)} ${req.min}cm 이상`, right: `+${req.reward}`, onPick: () => { const w = A.claim(this.day); if (!w) return; e.earn(w.money); e.addItem('bait', w.bait); this.report('lakereq'); this.audio.play('levelup'); this.ui.toast(`의뢰 보상 ${w.money}코인 + 떡밥 ${w.bait}개`, 'coin'); } });
        const n = A.nextRod, up = A.canUpgrade(e.money, this.level);
        if (n) items.push({ icon: 'fish', label: `${n.name} (${n.desc})${n.level > this.level ? ` · Lv.${n.level}` : ''}`, right: `${n.price}`, disabled: !up.ok, onPick: () => { const u = A.canUpgrade(e.money, this.level); if (!u.ok) return; e.money -= u.price; e.stats.spent += u.price; A.upgrade(); this.audio.play('levelup'); this.ui.toast(`${A.rodInfo.name}로 바꿨어요!`, 'fish'); } });
        items.push({ icon: 'seed', label: '떡밥 (입질↑ 희귀↑, 던질 때 1개)', right: `${ITEMS.bait.price} · 보유 ${e.inventory.items.bait || 0}`, disabled: e.money < ITEMS.bait.price, onPick: () => e.buyItem('bait') && this.audio.play('coin') });
        items.push({ icon: 'quest', label: `떡밥 자동 사용: ${A.useBait ? '켬' : '끔'}`, right: '', onPick: () => { A.useBait = !A.useBait; } });
        return { sub: `지금 낚싯대: ${A.rodInfo.name} · 오늘의 의뢰 ${nameOf(req.fish)} ${req.min}cm 이상 ${req.claimed ? '(완료)' : req.done ? '(보고 가능!)' : ''}`, items };
      },
    });
  },
  fishBoard() {
    const A = this.angling, req = A.today(this.day);
    const big = A.biggest ? `${nameOf(A.biggest.fish)} ${A.biggest.size}cm` : '아직 없음';
    return this.ui.say('낚시터 기록판', `오늘의 의뢰: ${nameOf(req.fish)} ${req.min}cm 이상 (보상 ${req.reward}코인·떡밥 ${req.bait}개)${req.claimed ? ' — 완료!' : req.done ? ' — 달성! 가게에 보고하세요' : ''} · 최대어: ${big} · 힘겨루기 성공 ${A.fights}번. 부두 끝이나 물가에서 낚시하면 호수에만 사는 물고기가 와요.`);
  },

  /* ─────────── 새 마을 부지 ─────────── */
  siteInfo(i) {
    const s = this.town.sites[i];
    if (s.state === 'empty') return { label: '빈 건설 부지 (건물 짓기)', run: () => this.siteMenu(i) };
    const B = BUILDINGS[s.type];
    if (s.state === 'building') return { label: `${B.name} 공사 중 ${Math.round(this.town.progress(i) * 100)}%`, run: () => this.siteMenu(i) };
    return { label: B.name, run: () => this.ui.say(B.name, B.desc) };
  },
  siteMenu(i) {
    const T2 = this.town;
    this.ui.openMenu({
      title: '새 마을 부지',
      build: () => {
        const s = T2.sites[i];
        if (s.state === 'building') {
          const cost = T2.rushCost(i);
          return { sub: `${BUILDINGS[s.type].name} 공사 중 · 남은 ${Math.ceil(s.left)}초`, items: [{ icon: 'coin', label: '코인을 더 내고 바로 완성', right: `${cost}`, disabled: this.econ.money < cost, onPick: () => { if (this.econ.money < cost) return; this.econ.money -= cost; T2.rush(i); this.ui.closeMenu(); } }] };
        }
        if (s.state === 'done') return { sub: BUILDINGS[s.type].desc, items: [] };
        return {
          sub: `가진 돈 ${this.econ.money.toLocaleString()}코인 · 지으면 농장 전체에 효과`,
          items: Object.entries(BUILDINGS).map(([k, B]) => {
            const why = T2.whyNot(i, k, this.econ.money, this.level);
            return { icon: 'star', label: `${B.name} — ${B.desc}${why ? ` (${why})` : ''}`, right: `${B.price}`, disabled: !!why, onPick: () => {
              const cost = T2.build(i, k, this.econ.money, this.level); if (!cost) return;
              this.econ.money -= cost; this.econ.stats.spent += cost; this.audio.play('coin'); this.report('build');
              this.ui.closeMenu(); this.ui.toast(`${B.name} 공사 시작! (${B.time}초)`, 'star');
            } };
          }),
        };
      },
    });
  },

  /* ─────────── 언덕 전망대 · 보물 상자 ─────────── */
  lookout(id) {
    const H = HILLS.find((h) => h.id === id);
    const first = !this.lookouts[id];
    this.lookouts[id] = true;
    this.pano = { t: 0, len: 5, cx: (H.look.x + 1) * T, cy: H.look.y * T };
    this.player.vx = this.player.vy = 0;
    this.audio.play('win');
    if (first) { this.econ.earn(100); this.report('lookout', Object.keys(this.lookouts).length); }
    this.ui.toast(`${H.name}에서 내려다본 마을${first ? ' · 첫 방문 +100코인' : ''} (${Object.keys(this.lookouts).length}/${HILLS.length})`, 'star');
  },
  openChest(i) {
    if (this.chestDay[i] === this.day) { this.ui.toast('오늘은 비어 있어요. 내일 다시!', 'gift'); return; }
    this.chestDay[i] = this.day;
    const r = Math.random();
    let msg;
    if (r < 0.45) { const n = 40 + Math.floor(Math.random() * 12) * 10; this.econ.earn(n); msg = `${n}코인`; this.popIcon('coin', CHESTS[i].x * T + 16, CHESTS[i].y * T); }
    else if (r < 0.75) { const k = this.unlockedCrops()[Math.floor(Math.random() * this.unlockedCrops().length)]; this.econ.inventory.seeds[k] = (this.econ.inventory.seeds[k] || 0) + 3; msg = `${CROPS[k].name} 씨앗 3개`; }
    else { const f = ['fruit_apple', 'fruit_peach', 'fruit_pear', 'fruit_persimmon'][Math.floor(Math.random() * 4)]; this.econ.addItem(f, 2); msg = `${nameOf(f)} 2개`; }
    this.audio.play('coin'); this.report('chest');
    this.ui.toast(`보물 상자: ${msg}!`, 'gift');
  },

  /* ─────────── 양봉 ─────────── */
  beesWorking() { return this.night < 0.5 && !this.raining; },
  hiveTarget(i) {
    const h = this.hives[i];
    if (h.honey >= 1) return { label: '꿀 거두기', run: () => this.collectHoney(i) };
    return { label: `꿀 모으는 중 ${Math.floor(h.honey * 100)}%${this.beesWorking() ? '' : ' (벌들이 쉬는 중)'}`, run: () => this.ui.say('양봉', `벌들이 들꽃에서 꿀을 모아요. 낮에 맑은 날이면 ${HONEY_TIME / 60 | 0}분 남짓이면 가득 차요. 비 오는 날과 밤에는 벌도 쉬어요.`) };
  },
  collectHoney(i) {
    const h = this.hives[i]; if (h.honey < 1) return;
    h.honey = 0;
    this.econ.addProduct('honey', 1);
    this.audio.play('harvest'); this.report('honey');
    const H = HIVES[i]; this.popIcon('honey', H.x * T + 16, H.y * T - 10);
    this.ui.toast('달콤한 꿀 1병을 거뒀어요! 장터에서 팔 수 있어요', 'honey');
  },

  /* ─────────── 수영 · 잠수 (호수) ─────────── */
  /** 주인공만 들어갈 수 있는 물: 낚시터 호수 (마을 연못은 얕아서 안 됨) */
  swimOK(x, y) { return x >= 0 && y >= 0 && this.map.ground[y * MW + x] === G.water && this.isLakeTile(x, y) && !this.entityAt(x, y); },
  waterTick(dt, busy) {
    // 꿀
    if (!busy && this.beesWorking()) for (const h of this.hives) if (h.honey < 1) h.honey = Math.min(1, h.honey + dt / HONEY_TIME);
    if (this.beesWorking() && Math.random() < dt * 1.2) {
      const p = this.player;
      if (HIVES.some((H) => Math.hypot(p.wx - H.x * T, p.wy - H.y * T) < 90)) this.audio.tone(220 + Math.random() * 40, 0.25, 'sawtooth', 0.012, 10, { lp: 700, rev: 0.05 }); // 윙윙
    }
    // 보물 자리 다시 반짝임
    for (const sp of this.diveSpots) if (!sp.on && (sp.respawn -= dt) <= 0) sp.on = true;
    // 물에 들어감/나옴
    const p = this.player;
    const inWater = !this.tr.driving && this.map.ground[p.y * MW + p.x] === G.water;
    if (inWater !== this.swimming) {
      this.swimming = inWater;
      this.audio.play('splash', inWater ? 0.8 : 0.4);
      this.splash(p.wx, p.wy);
      if (inWater) { this.report('swim'); if (!this.swimTip) { this.swimTip = true; this.ui.toast('첨벙! 헤엄치는 중이에요. 반짝이는 곳에서 E 로 잠수!', 'fish'); } }
    }
    if (this.swimming) this.swimT += dt * (p.speed > 10 ? 1 : 0.4);
    // 잠수
    if (this.diving) {
      const D = this.diving; D.t += dt;
      if (Math.random() < dt * 14) this.parts.push({ kind: 'bubble', x: p.wx + (Math.random() - 0.5) * 10, y: p.wy - 6, vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10, life: 0.8, decay: 1.4 });
      if (D.t >= 1.4) this.diveDone();
    }
  },
  swimTarget() {
    const p = this.player;
    const sp = this.diveSpots.filter((s) => s.on).find((s) => Math.hypot(s.x - p.wx, s.y - (p.wy - 6)) < 34);
    if (sp) return { label: '잠수해서 반짝이는 곳 살펴보기', run: () => this.dive(sp) };
    return { label: '헤엄치는 중 · 반짝이는 곳을 찾아 보세요', run: () => {} };
  },
  dive(sp) {
    if (this.diving) return;
    this.diving = { t: 0, spot: sp };
    this.player.vx = this.player.vy = 0;
    this.audio.play('splash', 0.9); this.splash(this.player.wx, this.player.wy);
  },
  diveDone() {
    const D = this.diving; this.diving = null;
    D.spot.on = false; D.spot.respawn = 35 + Math.random() * 40;
    const p = this.player; this.splash(p.wx, p.wy); this.audio.play('splash', 0.5);
    const r = Math.random();
    let text, icon = 'gift';
    if (r < 0.07) { this.econ.addItem('pearl', 1); text = `반짝반짝 ${ITEMS.pearl.name}`; this.audio.play('levelup'); icon = 'star'; }
    else if (r < 0.62) { this.econ.addItem('clam', 1); text = ITEMS.clam.name; this.audio.play('coin'); }
    else if (r < 0.82) { const n = 30 + Math.floor(Math.random() * 6) * 10; this.econ.earn(n); text = `물에 빠진 동전 ${n}`; this.audio.play('coin'); icon = 'coin'; }
    else { this.econ.addItem('fish_snail', 1); const rec = this.book.add('fish_snail', { size: 4 + Math.round(Math.random() * 3), day: this.day }); this.checkBook(); text = `우렁이${rec.isNew ? ' (도감 등록!)' : ''}`; this.audio.play('harvest'); icon = 'fish'; }
    this.popIcon(icon, p.wx, p.wy - 30);
    this.ui.toast(`잠수해서 ${text}을(를) 찾았어요!`, icon);
    this.report('dive');
  },
  /** 물 위 그림: 보물 반짝임 · 벌 · 헤엄칠 때 물결 */
  drawWater(g, camX, camY, t) {
    const S = this.S;
    for (const sp of this.diveSpots) {
      if (!sp.on) continue;
      const x = Math.round(sp.x - camX), y = Math.round(sp.y - camY);
      if (x < -20 || y < -20 || x > 4000 || y > 4000) continue;
      g.drawImage(S.sparkle[Math.floor(t * 6 + sp.x) % 4], x - 5, y - 5);
      if (Math.floor(t * 2 + sp.y) % 3 === 0) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - 7, y + 4, 4, 1); g.fillRect(x + 4, y + 3, 3, 1); }
    }
    // 벌: 벌통마다 6마리 8자 비행 (쉬는 중이면 입구 근처에 옹기종기)
    const work = this.beesWorking();
    HIVES.forEach((H, i) => {
      const hx = H.x * T + 16 - camX, hy = H.y * T - 4 - camY;
      for (let b = 0; b < 6; b++) {
        const ph = t * (1.6 + b * 0.13) + b * 0.8 + i;
        const r = work ? 12 + (b % 3) * 7 : 4;
        const x = Math.round(hx + Math.sin(ph) * r), y = Math.round(hy - (work ? 10 + Math.sin(ph * 2.3) * 7 + (b % 2) * 5 : -2) + Math.sin(ph * 2) * r * 0.35);
        g.fillStyle = '#ffc53a'; g.fillRect(x, y, 2, 1); g.fillStyle = '#2a2140'; g.fillRect(x + (Math.sin(ph) > 0 ? 1 : 0), y, 1, 1);
        if (work && Math.floor(t * 30 + b) % 2) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x, y - 1, 1, 1); }
      }
    });
    // 헤엄칠 때: 허리께 물결 고리 (몸 아래쪽이 물에 잠긴 듯)
    if (this.swimming && !this.diving) {
      const p = this.player, x = Math.round(p.wx - camX), y = Math.round(p.wy - camY - 14);
      const w = 13 + Math.round(Math.sin(this.swimT * 4) * 1.5);
      g.fillStyle = 'rgba(200,238,252,0.85)';
      for (let k = -w; k <= w; k++) { const yy = Math.round(Math.sqrt(Math.max(0, 1 - (k / w) ** 2)) * 4); g.fillRect(x + k, y + yy, 1, 1); if (Math.abs(k) > w - 5) g.fillRect(x + k, y - yy, 1, 1); }
      if (p.speed > 10) { g.fillRect(x - w - 3, y + 1, 2, 1); g.fillRect(x + w + 2, y + 1, 2, 1); }
    }
  },

  /** 전망대 파노라마: 마을 위를 천천히 한 바퀴 */
  panoFocus() {
    const P = this.pano, k = P.t / P.len;
    const a = k * Math.PI * 2, r = 260 * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * Math.sin(Math.min(1, (1 - k) * 3) * Math.PI / 2);
    return { x: P.cx + Math.cos(a) * r * 1.4, y: P.cy + Math.sin(a) * r };
  },
};

export { RODS, SMART, wait };

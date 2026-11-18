// Game 믹스인: 저장·불러오기·초기화·다른 창 감지
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import { saveGame, loadSaveInfo, loadBackup, backupSave, keepBroken, clearSave, setReadOnly, saveBlocked, lastSaveError, crashMarked, clearCrashMark, claimOwner, SAVE_KEY, OWNER_KEY } from './save.js';
import { record, showOverlay, OVERLAY_ICON } from './crash.js';
import { TOUR_REWARD } from './sim/koat.js';

const KOAT_TITLE = TOUR_REWARD.title;

/** '여기서 이어 하기' 로 새로고침했다는 표시 (sessionStorage, 그 창에만) */
export const TAKEOVER_KEY = 'unico.takeover';
/** 넘겨받은 직후 잠깐은 다른 창의 마지막 저장을 무시 (그 창이 멈추기 전에 쓴 것) */
const TAKEOVER_GRACE = 5000;
/** 치명 오류 뒤 이만큼 오류 없이 놀아야 표시를 지움 */
const CLEAN_MS = 60000;
const sess = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };

/** 저장 실패 알림 (까닭마다 접속에 한 번) */
const SAVE_FAIL = {
  quota: '⚠️ 저장 공간이 부족해 농장을 저장하지 못했어요',
  denied: '⚠️ 이 브라우저 설정(사생활 보호 모드 등)에서는 농장을 저장할 수 없어요',
  other: '⚠️ 농장을 저장하지 못했어요. 잠시 뒤 다시 저장해 볼게요',
};

export const GameSave = {
  /** 지금 상태 저장 (초기화·읽기 전용이면 save.js 가 막음) → 저장했으면 true */
  save(opt) {
    this.saveTimer = 0;
    if (this._introPending) return false; // 첫 접속: 인트로 시작 전에는 저장하지 않음 (저장이 생기면 다음 접속에 인트로가 안 나옴)
    // 지금 단 칭호를 flags.title 로 (KOAT 데스크처럼 player.setTitle 만 부른 곳도 다시 불러오면 그 칭호)
    const curTitle = this.player?.title;
    if (typeof curTitle === 'string' && curTitle && this.flags) this.flags.title = curTitle;
    const ok = saveGame(this, opt);
    try {
      const warned = (this._saveWarnedKinds ||= new Set());
      if (!ok && !saveBlocked()) {
        const kind = SAVE_FAIL[lastSaveError()] ? lastSaveError() : 'other';
        if (!warned.has(kind)) { warned.add(kind); this.ui?.toast(SAVE_FAIL[kind]); this._saveFailToasted = true; }
        this._saveFailing = true;
      } else if (ok && this._saveFailing) {
        if (this._saveFailToasted) this.ui?.toast('💾 이제 다시 저장돼요'); // 알린 실패가 풀렸을 때만
        this._saveFailing = this._saveFailToasted = false;
      }
      // 치명 오류 다음 접속: 한동안 오류 없이 놀았으면 표시를 지움 (다음 부팅부터 다시 .bak 을 새로)
      if (ok && !opt?.crash && this._crashMark && !this._crashed) {
        const now = Date.now();
        if (now - this._crashMark >= CLEAN_MS && !(this._lastBadAt && now - this._lastBadAt < CLEAN_MS)) {
          clearCrashMark();
          this._crashMark = 0;
        }
      }
    } catch { /* 알림 없이 계속 */ }
    return ok;
  },

  restore() {
    this.takeOver();
    const info = loadSaveInfo();
    let s = info.data, note = null;
    if (info.status === 'empty') return this.startNewFarm();
    if (info.status === 'broken') {
      // 못 읽은 기록: 원본을 따로 보관한 뒤 백업으로, 백업도 없으면 새 농장 (보관을 못 했으면 이번 접속은 저장하지 않음)
      const kept = keepBroken(info.raw);
      if (!kept) setReadOnly(true); // 백업이 있어도 보관하지 못한 원본을 덮지 않음
      record(new Error('저장 기록을 읽지 못함'), 'load:broken');
      const bak = loadBackup();
      if (!bak) {
        if (!kept) setReadOnly(true);
        return this.startNewFarm(kept ? '⚠️ 저장 기록을 읽지 못해 새 농장을 시작해요 (이전 기록은 따로 보관해 두었어요)'
          : '⚠️ 저장 기록을 읽지 못했어요. 이전 기록을 지키려고 이번에는 저장하지 않아요');
      }
      s = bak.data;
      const day = Number(s?.world?.day);
      note = { title: '💾 백업에서 불러왔어요', text: `지난번 기록이 손상되어 최근 백업${Number.isFinite(day) && day > 0 ? `(${Math.floor(day)}일차)` : ''}에서 농장을 불러왔어요. 그 뒤의 진행은 조금 빠졌을 수 있어요.` };
    } else if (info.status === 'newer') {
      setReadOnly(true); // 옛 판이 새 판 기록을 빠진 칸째로 덮어쓰지 않게
      note = '🆕 새 버전으로 저장된 농장이에요. 새로고침하면 이어서 저장돼요';
    }
    const failed = this.loadSections(s);
    if (failed.length) {
      const kept = info.status === 'newer' || keepBroken(info.raw);
      if (!kept) setReadOnly(true);
      note = { title: '💾 일부 기록을 불러오지 못했어요', text: kept
        ? '몇 가지 기록은 처음 상태로 돌아갔어요. 원래 기록은 따로 보관해 두었어요.'
        : '몇 가지 기록을 불러오지 못했고 원본 보관도 실패했어요. 이전 기록을 지키려고 이번에는 저장하지 않아요.' };
    } else if (info.status === 'ok') {
      // 마지막으로 깨끗하게 불러온 기록 (부팅마다 한 번) — 지난 접속이 치명 오류로 멈췄으면 오류 직전 백업을 지킴
      if (crashMarked()) this._crashMark = Date.now();
      else backupSave(info.raw);
    }
    if (!note) { this.ui.toast('💾 저장된 농장을 불러왔어요'); return; }
    this.whenShown(() => setTimeout(() => this.notice(note), 900)); // 로딩 화면이 걷힌 뒤에 보이게
  },

  /** 불러오기 안내: 기록이 빠진 일은 닫을 때까지 남는 작은 창으로 (창을 못 열면 알림) */
  notice(note) {
    if (typeof note === 'string') return this.ui.toast(note);
    try {
      const p = this.ui.openPanel?.(note.title);
      if (p) {
        p.dataset.kind = 'savenote';
        const row = document.createElement('div');
        row.className = 'row';
        row.textContent = note.text;
        row.style.wordBreak = 'keep-all'; // 낱말 가운데서 줄이 바뀌지 않게
        const btn = document.createElement('button');
        btn.textContent = '확인';
        btn.onclick = () => this.ui.closePanel();
        p.append(row, btn);
        return;
      }
    } catch { /* 알림으로 */ }
    this.ui.toast(`${note.title} — ${note.text}`);
  },

  /** '여기서 이어 하기' 로 새로고침한 창: 넘겨받았다고 알려 다른 창을 먼저 멈춤 */
  takeOver() {
    const ss = sess();
    let flag = null;
    try { flag = ss?.getItem(TAKEOVER_KEY); ss?.removeItem(TAKEOVER_KEY); } catch { /* 표시 없음 */ }
    if (flag !== '1') return false;
    this._tabId ||= Math.random().toString(36).slice(2, 10);
    this._takeoverAt = Date.now();
    return claimOwner(this._tabId);
  },

  /** 처음 접속(또는 읽지 못한 기록): 로딩 화면이 걷히면 인트로 */
  startNewFarm(note) {
    this._introPending = true;
    this.whenShown(() => setTimeout(() => this.introCutscene(), 700));
    if (note) this.whenShown(() => setTimeout(() => this.ui.toast(note), 400));
  },

  /** 칸마다 따로 불러오기: 한 칸이 오류를 내도 그 칸만 기본값으로 두고 나머지는 계속 → 실패한 칸 이름 목록 */
  loadSections(s) {
    const failed = [];
    const step = (name, fn) => {
      try { fn(); } catch (e) {
        failed.push(name);
        console.warn('기록 불러오기 실패 (기본값으로):', name, e);
        record(e, `load:${name}`);
      }
    };
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    step('flags', () => {
      this.flags = s.flags && typeof s.flags === 'object' ? s.flags : {};
      // 인트로를 이미 본 농장: 새로 생긴 첫 안내(장터·목장·반려견 소개)는 다시 띄우지 않음
      if (this.flags.intro) for (const k of ['marketTip', 'ranchTip', 'petIntro']) this.flags[k] ??= true;
    });
    step('farm', () => this.farm.sim.load(s.farm));
    step('farmView', () => this.farm.refreshAll());
    step('economy', () => this.economy.load(s.economy));
    step('quests', () => this.quests.load(s.quests));
    step('ranch', () => this.ranch.load(s.ranch));
    step('rice', () => this.rice.load(s.rice));
    step('nature', () => this.nature.load(s.nature));
    step('villagers', () => this.villagers.load(s.villagers));
    step('collection', () => this.collection.load(s.collection));
    step('koat', () => this.koat.load(s.koat));
    step('explore', () => this.explore.load(s.explore));
    step('bees', () => this.bees.load(s.bees));
    step('angling', () => this.angling.load(s.angling));
    step('farmcraft', () => this.farmcraft.load(s.farmcraft));
    step('town', () => this.town.load(s.town));
    step('home', () => this.home.load(s.home));
    step('costume', () => this.costume.load(s.costume));
    step('social', () => this.social.load(s.social));
    step('decor', () => this.decor.load(s.decor));
    step('look', () => this.applyLook(false));
    step('pet', () => { if (this.pet.ok) this.pet.load(s.pet); });
    // 칭호: 가진 것 목록(flags.titles)·지금 칭호(flags.title). KOAT 투어 칭호는 스탬프북에서 다시 채움
    step('title', () => {
      const own = Array.isArray(this.flags.titles) ? this.flags.titles.filter((t) => typeof t === 'string') : [];
      if (this.koat.book.rewarded && !own.includes(KOAT_TITLE)) own.push(KOAT_TITLE);
      this.flags.titles = own;
      const cur = own.includes(this.flags.title) ? this.flags.title : own[own.length - 1];
      if (cur) this.player.setTitle(cur);
    });
    step('world', () => {
      if (num(s.world?.time)) this.world.time = s.world.time;
      if (num(s.world?.day)) this.world.day = s.world.day;
    });
    step('socialDay', () => this.social.newDay(this.world.day));
    step('player', () => { if (num(s.player?.x) && num(s.player?.z)) this.player.position.set(s.player.x, 0, s.player.z); });
    return failed;
  },

  /** 다른 창(탭)에서 같은 농장을 저장·초기화하면 이 창은 멈춤: 늦게 저장해 다른 창의 진행을 되돌리지 않게 (storage 이벤트는 다른 창의 쓰기에만 옴) */
  watchOtherTabs() {
    window.addEventListener('storage', (e) => {
      if (e.key !== SAVE_KEY && e.key !== OWNER_KEY && e.key !== null) return; // null: 다른 창에서 저장소 전체를 비움
      if (e.storageArea && typeof localStorage !== 'undefined' && e.storageArea !== localStorage) return;
      if (e.key === OWNER_KEY) { if (e.newValue != null) this.goStale('other'); return; } // 다른 창이 넘겨받음
      if (e.key === SAVE_KEY && e.newValue != null && this._takeoverAt && Date.now() - this._takeoverAt < TAKEOVER_GRACE) return; // 멈추기 직전 그 창의 마지막 저장
      this.goStale(e.newValue == null ? 'reset' : 'other');
    });
  },

  /** 이 창 멈춤: 저장 막기 · 입력 멈춤 · 루프·소리 멈춤 · [여기서 이어 하기] = 새로고침 (다른 창의 최신 기록을 불러옴) */
  goStale(why = 'other') {
    if (this._stale) return;
    this._stale = true;
    setReadOnly(true);
    try {
      this.input.reset?.();
      this.input.enabled = false;
      this.renderer.setAnimationLoop(null);
      this._looping = false;
      this.music?.pause?.();
      this.audio?.sleep?.();
      // 같은 사람이 두 번 보이지 않게 접속도 끊음 (화면으로 돌아와도 다시 붙지 않게)
      const n = this.net;
      if (n) { n.connect = n.wake = () => {}; n.detach?.(); }
    } catch { /* 안내는 띄움 */ }
    showOverlay({
      id: 'unico-stale',
      iconSrc: OVERLAY_ICON,
      badge: '🔁',
      title: why === 'reset' ? '다른 창에서 농장을 초기화했어요' : '다른 창에서 플레이 중이에요',
      body: '두 창이 서로의 기록을 덮어쓰지 않게 이 창은 잠시 멈췄어요. 여기서 이어 하면 가장 최근 기록을 불러와요.',
      actions: [{
        label: '🔄 여기서 이어 하기',
        run: () => {
          try { sess()?.setItem(TAKEOVER_KEY, '1'); } catch { /* 표시 없이 새로고침 */ }
          location.reload();
        },
      }],
      hint: '이 창은 닫아도 괜찮아요',
    });
  },

  resetSave() { clearSave(); location.reload(); }, // clearSave 뒤에는 떠날 때 저장이 막힘 (지운 농장이 되살아나지 않게)
};

import { portraitSVG, preloadPortraits } from './portrait2d.js';
import { textOn } from './contrast.js';
import { isSubmitEnter } from '../game/input.js';
import { VOICE_UNICO } from '../game/species.js';
import { voice, greet, lineShape, holdDuck, DUCK } from '../game/voice.js';

/** 이름 다듬기: 앞뒤 공백·제어 문자 빼고 max 글자까지 (이모지도 한 글자), 비면 fallback */
export function sanitizeName(raw, fallback = '', max = 6) {
  const t = [...String(raw ?? '').replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').trim()].slice(0, max).join('').trim();
  return t || String(fallback ?? '');
}
/** 이름 카드를 그냥 두면 이만큼(초) 뒤 지금 이름으로 (건너뛰기·오토플레이) */
export const NAME_AUTO_S = 4;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 하트 하나 (24×24 그림): 채움 #f06292, 빈 하트는 연분홍 칸 (theme/dialogue.css) */
const HEART = 'M12 20.6 4.2 13.2C1.9 11 1.8 7.4 4 5.4c2-1.8 5-1.5 6.8.5L12 7.2l1.2-1.3c1.8-2 4.8-2.3 6.8-.5 2.2 2 2.1 5.6-.2 7.8Z';
/** 우정 하트 n/max 를 그림 하트로 (이모지 🤍 는 크림 바탕에서 안 보임). popFrom: 이 번호부터 새로 채워진 하트는 톡 커짐 */
export function heartsHTML(n, max = 5, label = '우정', popFrom = Infinity) {
  const k = Math.max(0, Math.min(max, Math.round(n) || 0));
  let s = '';
  for (let i = 0; i < max; i++) s += `<svg class="ht${i < k ? ' on' : ''}${i < k && i >= popFrom ? ' pop' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART}"/></svg>`;
  return `<span class="dlg-hearts" role="img" aria-label="${esc(label)} ${k}/${max}">${label ? `<em>${esc(label)}</em>` : ''}${s}</span>`;
}
/** 예전 방식 sub('우정 ❤️❤️🤍🤍🤍 · 배부름 80%') → { hearts, max, label, rest }. 아니면 null */
export function parseHeartsSub(sub) {
  const m = /^\s*(우정|애정)\s*((?:❤️|❤|🤍)+)\s*(?:·\s*(.*))?$/u.exec(String(sub ?? ''));
  if (!m) return null;
  const on = (m[2].match(/❤/g) || []).length, off = (m[2].match(/🤍/g) || []).length;
  return { hearts: on, max: on + off, label: m[1], rest: m[3] || '' };
}

/** 설명 속 진행 'n/m' (앞의 '·', '보유'/'지금', 뒤의 '개 있어!' 까지) */
const NOTE_PROG = /\s*·?\s*(?:보유|지금)?\s*(\d+)\s*\/\s*(\d+)(?:\s*개)?(?:\s*있어[!.~]?)?/u;
/** 줄 앞 그림 문자(이모지) 하나 + 띄어쓰기 */
const LEAD_EMOJI = /^\s*(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*/u;
/** 자물쇠 (작은 그림) */
const LOCK = '<svg class="lk" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="2.5" y="7" width="11" height="7.5" rx="2" fill="currentColor"/></svg>';
/**
 * 선택지 한 줄의 모양 (순수 함수): { html, cls, disabled, locked }
 *  - disabled: 누를 수 없음 (반려견 재주 잠금 등, 그대로)
 *  - locked: 누를 수는 있는 '아직 못 하는' 줄 (부탁 다시 듣기 등)
 *  둘 다 같은 잠긴 모양: 점선 테두리 + 자물쇠 + 'n/m' 진행 알약 (c.progress 또는 설명의 'n/m' 에서)
 */
export function choiceView(c, k) {
  const locked = !!(c.locked || c.disabled);
  let note = c.note || '', prog = c.progress ?? null;
  if (locked && prog == null) {
    const m = NOTE_PROG.exec(note);
    // 알약으로 옮긴 n/m 은 설명에서 뺌 ('보유 2/3' · '지금 2/3개 있어!' 둘 다)
    if (m) { prog = `${m[1]}/${m[2]}`; note = note.replace(NOTE_PROG, '').replace(/\s*·\s*$/, '').trim(); }
  }
  // 잠긴 줄은 자물쇠 하나만 (앞의 이모지는 뺌)
  const label = locked ? String(c.label ?? '').replace(LEAD_EMOJI, '') || String(c.label ?? '') : String(c.label ?? '');
  const pill = locked && prog != null ? `<b class="pg">${esc(prog)}</b>` : '';
  const html = `<span class="k">${k + 1}</span>${locked ? LOCK : ''}<span class="lb">${esc(label)}</span>${pill}${note ? `<small>${esc(note)}</small>` : ''}`;
  return { html, cls: [locked ? 'locked' : '', note ? 'has-note' : ''].filter(Boolean).join(' '), disabled: !!c.disabled, locked };
}

/**
 * 선택지 자리: 'float' 대화창 위 오른쪽 기둥 · 'stack' 세로 화면(폰·세운 태블릿), 창 위 전체 너비 · 'inbox' 창 안 (가로로 눕힌 폰, 이름 카드)
 * 카메라 비키기(cutscene.js choiceColumn)도 같은 기준: float 일 때만
 */
export function choicesMode(w, h, coarse, input = false) {
  if (input) return 'inbox';
  if (h <= 500 && coarse) return 'inbox';
  return w <= 600 || w < h ? 'stack' : 'float';
}
const viewMode = (input) => {
  const w = typeof innerWidth === 'number' ? innerWidth : 1280, h = typeof innerHeight === 'number' ? innerHeight : 800;
  let coarse = false;
  try { coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches; } catch { /* 없으면 마우스 */ }
  return choicesMode(w, h, coarse, input);
};

/**
 * 격자 선택지의 마지막 줄 채우기 (순수 함수): 칸 수 cols, 줄마다 차지하는 칸 spans → 마지막 줄의 마지막 선택지가 차지할 칸 수
 * 빈 칸이 없으면 그대로(spans 마지막 값)
 */
export function lastRowSpan(spans, cols) {
  if (!spans.length || cols < 2) return spans.at(-1) ?? 1;
  let pos = 0, s = 1;
  for (const v of spans) { s = Math.min(cols, v); if (pos + s > cols) pos = 0; pos += s; }
  return s + (cols - pos);
}
/** 선택지 한 줄이 격자에서 차지할 칸: 세로 폰은 잠긴 줄·설명 줄이 한 줄 전체, 가로 폰은 잠긴 줄만 두 칸 */
const GRID = { stack: { cols: 2, span: (b) => (b.classList.contains('locked') || b.classList.contains('has-note') ? 2 : 1) }, inbox: { cols: 3, span: (b) => (b.classList.contains('locked') ? 2 : 1) } };

/** 말소리 고르기: 줄에 준 voice → 말하는 주민 종 → 유니코 종소리. 해설(말하는 사람 없음)·반려견은 없음 */
export function voiceOf(ln) {
  if (ln.voice && typeof ln.voice === 'object') return ln.voice;
  if (typeof ln.voice === 'number') return { f0: ln.voice };
  return ln.speaker?.species?.voice ?? (ln.speaker ? VOICE_UNICO : null);
}

/** 이름 있는 효과음이 있으면 그것, 없으면 대신할 소리 ('tap'·'blip' 은 소리 정리 쪽에서 더함) */
const hasNamed = new Map();
function named(audio, name, fallback, vol) {
  if (!audio?.play) return;
  if (!hasNamed.has(name)) { let ok = false; try { ok = typeof audio.has === 'function' ? !!audio.has(name) : new RegExp(`['"]${name}['"]`).test(String(audio.play)); } catch { ok = false; } hasNamed.set(name, ok); }
  return hasNamed.get(name) ? audio.play(name, vol) : audio.play(fallback, vol);
}

/**
 * 대화창 (화면 아래): 2D 초상화(SVG, 말할 때 입이 움직임) + 이름표 + 한 글자씩 나오는 대사 + 말소리 + 선택지
 *  - 클릭 / E / Space / Enter: 글자 다 보이기 → 다음 줄
 *  - 선택지는 클릭 또는 숫자 키 1~9
 * say([{ speaker?: Unico, name, color?, sub?, hearts?, heartsMax?, voice?, text, choices?: [{ label, value, note?, disabled?, locked?, progress? }], input?: { value, max } }]) → 마지막 선택 값
 *  - hearts: 이름표 옆 그림 하트 (sub 는 '배부름 80%' 같은 작은 글)  - locked: 누를 수 있는 잠긴 줄 (disabled 는 못 누름)
 *  - input: 대화창 안 이름 카드 [좋아!] / [✏️ 바꾸기] → 다듬은 이름 (건너뛰면 지금 이름)
 *  - 대화 중에 또 say 하면 앞 대화가 끝난 뒤 이어서 (덮어쓰지 않음)
 */
export class Dialogue {
  constructor(game, root) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'dlg hidden';
    this.el.innerHTML = `<div class="dlg-portrait"></div>
      <div class="dlg-main"><div class="dlg-name"><b></b><span class="dlg-hearts-slot"></span><small></small></div><div class="dlg-text"></div><i class="dlg-next">▼</i></div>
      <div class="dlg-choices"></div>`;
    root.append(this.el);
    this.$ = (s) => this.el.querySelector(s);
    this.choicesEl = this.$('.dlg-choices');
    this._mode = null;
    this.active = false;
    this.closedAt = 0;
    this.el.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dlg-choices')) { e.preventDefault(); this._advance(); } });
    // 다른 창(미니게임 등)의 같은 키 처리까지 막음: 한 번 누른 E 가 대사도 넘기고 게임도 시작하지 않게
    // 화면을 돌리거나 창 크기가 바뀌면 열린 선택지 자리를 다시 정함
    const replace = () => { if (this.active) this._placeChoices(this.el.classList.contains('has-input')); };
    window.addEventListener('resize', replace);
    window.addEventListener('orientationchange', replace);
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.isComposing || e.target?.tagName === 'INPUT') return;
      if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); this._advance(); return; }
      const n = +e.key;
      // preventDefault: 바꾸기로 글 상자에 포커스가 옮겨 가도 누른 숫자가 이름 칸에 찍히지 않게
      if (n >= 1 && n <= 9 && this.choosing) { e.preventDefault(); e.stopImmediatePropagation(); this.el.querySelectorAll('.dlg-choices button')[n - 1]?.click(); } // 선택지 번호 1~9
    }, true);
    this.portraits = new Map();
    preloadPortraits();
  }

  /** 방금 닫혔는지 (닫는 키 입력이 다른 상호작용으로 새지 않게) */
  justClosed() { return performance.now() - this.closedAt < 350; }

  skipAll() {
    this._skip = true;
    if (this._naming) return this._naming.done(); // 이름 카드: 지금 이름으로
    this._advance(true);
  }

  /** 다음으로 (글자 다 보이기 → 다음 줄). 키보드 E 와 같음: 화면 E 버튼·3D 화면 탭에서 부름 */
  advance() { this._advance(); }

  /** 초상화: 말하는 유니코의 색·옷차림으로 2D 일러스트. portrait: 'dog' 이면 반려견 */
  _portrait(speaker, color, kind, emote) {
    const box = this.$('.dlg-portrait');
    box.innerHTML = '';
    const show = !!speaker || kind === 'dog';
    box.style.display = show ? '' : 'none';
    if (!show) return;
    try { box.append(portraitSVG(speaker, { accent: color || '#30b6aa', kind: kind || 'unico', emote })); } catch { box.style.display = 'none'; }
  }

  _advance(force) {
    if (!this.active) return;
    if (this.typing && !force) { this.typing = false; return; } // 남은 글자 한 번에
    if (this.choosing && !force) return;
    this._next?.();
  }

  /** 대화 (앞 대화가 진행 중이면 끝난 뒤 이어서) */
  say(lines) {
    const run = (this._queue || Promise.resolve()).then(() => this._say(lines));
    this._queue = run.catch(() => {});
    return run;
  }

  async _say(lines) {
    if (!Array.isArray(lines)) lines = [lines];
    // 3초 넘게 쉬었다 시작하는 대화는 새 대화 (첫인사를 다시)
    if (!this._greeted || performance.now() - this.closedAt > 3000) { this._greeted = new Set(); this._heartsOf = null; }
    this.active = true; this._skip = false;
    const P = this.game.player;
    P.hold ? P.hold('dlg') : (P.frozen = true);
    this.el.classList.remove('hidden');
    document.body?.classList?.add('talking'); // HUD·행동 막대를 흐리게, 누를 수 없게 (dialogue.css)
    // 대화 동안 음악 살짝 줄임: 다음 대화가 0.6초 안에 이어지면 풀지 않음 (줄 사이에 음악이 들썩이지 않게)
    clearTimeout(this._duckOff);
    if (!this._ducked) { this._ducked = true; try { holdDuck(this.game.audio, true); } catch { /* 소리 실패는 무시 */ } }
    try { return await this._lines(lines); } finally {
      this._duckOff = setTimeout(() => { this._ducked = false; try { holdDuck(this.game.audio, false); } catch { /* 무시 */ } }, DUCK.release * 1000);
      document.body?.classList?.remove('talking');
      this.el.classList.add('hidden');
      this.active = false;
      this.typing = this.choosing = false;
      this._naming = null;
      this.closedAt = performance.now();
      if (P.unhold) P.unhold('dlg'); else if (!this.game.cinema?.locked) P.frozen = false;
    }
  }

  async _lines(lines) {
    let result = null, lastSpeaker;
    for (const ln of lines) {
      if (this._skip && !ln.choices && !ln.input) continue;
      if (this._skip && ln.input) { result = sanitizeName(ln.input.value, ln.input.value, ln.input.max); continue; }
      const who = `${ln.speaker?.palette || ln.portrait || ''}:${ln.emote || ''}:${ln.speaker ? 1 : 0}`;
      if (who !== lastSpeaker) { this._portrait(ln.speaker, ln.color, ln.portrait, ln.emote); lastSpeaker = who; }
      this.el.style.setProperty('--dlg-accent', ln.color || '#30b6aa');
      this.el.style.setProperty('--dlg-on', textOn(ln.color || '#30b6aa')); // 이름표 글자색: 배경색에 따라 흰색/진한 갈색
      this.$('.dlg-name b').textContent = ln.name || '';
      // 우정 하트: hearts 로 받거나, 예전 sub('우정 ❤️🤍…') 를 풀어서 그림 하트로
      const hp = ln.hearts != null ? { hearts: ln.hearts, max: ln.heartsMax ?? 5, label: ln.heartsLabel ?? '우정', rest: ln.sub || '' } : parseHeartsSub(ln.sub);
      const hk = hp ? `${hp.label}${hp.hearts}/${hp.max}` : '';
      if (hk !== this._heartsKey) {
        // 같은 이와 이야기하는 중 하트가 늘면 새 하트만 톡
        const prev = this._heartsOf, same = hp && prev && prev.name === ln.name && prev.label === hp.label && prev.max === hp.max;
        this._heartsKey = hk;
        this.$('.dlg-hearts-slot').innerHTML = hp ? heartsHTML(hp.hearts, hp.max, hp.label, same && hp.hearts > prev.hearts ? prev.hearts : Infinity) : '';
      }
      if (hp) this._heartsOf = { name: ln.name, label: hp.label, max: hp.max, hearts: hp.hearts };
      const sub = hp ? hp.rest : ln.sub;
      this.$('.dlg-name small').innerHTML = sub ? esc(sub) : '';
      this.choicesEl.innerHTML = '';
      this.el.classList.toggle('has-choices', !!(ln.choices || ln.input));
      this.el.classList.toggle('has-input', !!ln.input);
      this._placeChoices(!!ln.input);
      const prof = voiceOf(ln), cps = prof?.cps || 38;
      // 첫인사 한 마디 (주민 종·반려견): 한 이어진 대화에서 인물마다 한 번 (선택지 뒤 다시 불러도·컷신에서 번갈아 말해도 반복하지 않음)
      const dog = !ln.speaker && ln.portrait === 'dog', gk = dog ? 'bark' : voiceOf(ln)?.greet;
      const vk = gk ? `${gk}:${ln.name || ''}` : '';
      if (vk && !this._greeted.has(vk)) {
        this._greeted.add(vk);
        try { greet(this.game.audio, gk); } catch { /* 소리 실패는 무시 */ }
      }
      ln.speaker?.playAction?.(ln.emote || 'talk', Math.min(2.5, ln.text.length * 0.05));
      ln.speaker?.speak?.(Math.min(6, [...ln.text].length / cps + 0.2)); // 글자 나오는 동안 입 움직임
      result = await this._type(ln, prof, cps);
    }
    return result;
  }

  _type(ln, prof = voiceOf(ln), cps = prof?.cps || 38) {
    return new Promise((resolve) => {
      const textEl = this.$('.dlg-text');
      const chars = [...ln.text];
      let i = 0, acc = 0, syl = 0, pause = 0;
      this.typing = true;
      textEl.textContent = '';
      this.el.classList.remove('done');
      // 말소리: 종마다 다른 목소리, 글자마다 정해진 소리 (voice.js). every 음절마다 한 번
      const shape = prof ? lineShape(chars) : null, every = prof?.every || 2, audio = this.game.audio;
      const speakChar = (k) => {
        const ch = chars[k];
        if (!prof || !/[가-힣0-9A-Za-z]/.test(ch)) return;
        const last = k === shape.lastIdx;
        if (syl++ % every !== 0 && !last) return;
        try { voice(audio, prof, ch, { last, q: shape.q, ex: shape.ex }); } catch { /* 소리 실패는 무시 */ }
      };
      let last = performance.now();
      const step = (now) => {
        if (!this.active) return;
        const dt = (now - last) / 1000; last = now;
        if (!this.typing) i = chars.length;
        else {
          acc += dt * cps;
          if (pause > 0) { const p = Math.min(pause, acc / cps); pause -= p; acc -= p * cps; } // 쉼표·말줄임: 잠깐 쉼
          while (acc >= 1 && i < chars.length && pause <= 0) {
            acc -= 1; i++;
            const ch = chars[i - 1];
            if (ch === ',' || ch === '…') pause = ch === '…' ? 0.16 : 0.1;
            speakChar(i - 1);
          }
        }
        textEl.textContent = chars.slice(0, i).join('');
        if (i < chars.length) return requestAnimationFrame(step);
        this.typing = false;
        this.el.classList.add('done');
        ln.speaker?.speak?.(0); // 글자가 다 나오면 입 다묾
        if (ln.input) this._showName(ln.input, resolve);
        else if (ln.choices) this._showChoices(ln.choices, resolve);
        else this._next = () => { this._next = null; named(this.game.audio, 'tap', 'click', 0.6); resolve(null); };
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * 오토플레이용 자동 넘김: 글자가 다 나오면 읽을 시간만큼 기다렸다 다음 줄로.
   * 선택지는 '안녕/그만'(bye) 이 있을 때만 4초 기다렸다 그것을 고름 (다른 선택은 사람이 직접)
   * 시간은 실제 시간 기준 (화면이 끊겨도 읽는 시간은 같게)
   * @returns 자동으로 넘길 수 있는 대화인가
   */
  autoStep() {
    const now = performance.now();
    if (!this.active || this.typing) { this._autoAt = 0; return this.active; }
    if (!this._autoAt) this._autoAt = now; // 이 줄(선택지)이 다 나온 때
    const waited = (now - this._autoAt) / 1000;
    if (this._naming) { // 이름 카드: 4초 뒤 지금 이름으로
      if (waited > NAME_AUTO_S && !this._naming.editing) { this._autoAt = 0; this._naming.done(); }
      return true;
    }
    if (this.choosing) {
      const bye = this._choices?.find((c) => c.value === 'bye' && !c.disabled);
      if (!bye) return false;
      if (waited > 4) { this._autoAt = 0; this.choosing = false; named(this.game.audio, 'blip', 'click'); this._resolveChoice?.(bye.value); }
      return true;
    }
    const n = this.$('.dlg-text').textContent.length;
    if (waited > Math.min(4, 1.2 + n * 0.04)) { this._autoAt = 0; this._advance(); }
    return true;
  }

  /**
   * 이름 카드 (대화창 안): 🐕 지금 이름 + [좋아!] / [✏️ 바꾸기]
   * 바꾸기를 눌러야 글 상자를 열고 포커스 (폰에서 처음부터 자판이 올라오지 않게). Enter 는 한글 조합이 끝난 뒤에만
   * 글 상자 상태: 🐕 + 글 상자 + 글자 수(n/6), [좋아!] / [취소] (취소 → 처음 상태로)
   * opt.onShow(): 카드가 뜰 때 (반려견 반기기 등)
   */
  _showName(opt, resolve) {
    const max = opt.max || 6, cur = sanitizeName(opt.value, '', max), icon = opt.icon || '🐕';
    this.choosing = true; this._choices = null; this._autoAt = 0;
    const box = this.$('.dlg-choices');
    let input = null;
    const n = (this._naming = {
      editing: false,
      done: (v) => {
        if (this._naming !== n) return;
        this._naming = null; this.choosing = false;
        input?.blur?.();
        named(this.game.audio, 'blip', 'click');
        resolve(sanitizeName(v ?? cur, cur, max));
      },
    });
    const btn = (k, label, cls = '') => {
      const b = document.createElement('button');
      if (cls) b.className = cls;
      b.innerHTML = `<span class="k">${k}</span>${label}`;
      return b;
    };
    // 처음 상태: 지금 이름 + [좋아!] / [✏️ 바꾸기]
    const view = () => {
      n.editing = false; input = null;
      box.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'dlg-name-card';
      const chip = document.createElement('span');
      chip.className = 'nm';
      chip.innerHTML = `<i class="ic">${esc(icon)}</i>${esc(cur)}`;
      const btns = document.createElement('div');
      btns.className = 'btns';
      const ok = btn(1, '좋아!', 'gold'), edit = btn(2, '✏️ 바꾸기');
      ok.onclick = (e) => { e.stopPropagation(); n.done(cur); };
      edit.onclick = (e) => { e.stopPropagation(); editView(); };
      btns.append(ok, edit);
      card.append(chip, btns);
      box.append(card);
    };
    // 바꾸기 상태: 🐕 [글 상자 n/6] + [좋아!] / [취소]
    const editView = () => {
      n.editing = true;
      box.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'dlg-name-card editing';
      const field = document.createElement('label');
      field.className = 'nm nm-edit';
      field.innerHTML = `<i class="ic">${esc(icon)}</i>`;
      input = document.createElement('input');
      input.type = 'text';
      input.maxLength = max;
      input.value = cur;
      input.placeholder = `${max}글자까지`;
      input.setAttribute('enterkeyhint', 'done');
      input.setAttribute('aria-label', '새 이름');
      const cnt = document.createElement('small');
      cnt.className = 'cnt';
      const count = () => { cnt.textContent = `${[...input.value].length}/${max}`; };
      count();
      input.addEventListener('input', count);
      input.addEventListener('keydown', (k) => {
        if (isSubmitEnter(k)) { k.preventDefault(); n.done(input.value); }
        else if (k.key === 'Escape') { k.preventDefault(); view(); }
        k.stopPropagation(); // 이름을 치는 동안 게임 단축키로 새지 않게
      });
      field.append(input, cnt);
      const btns = document.createElement('div');
      btns.className = 'btns';
      const ok = btn(1, '좋아!', 'gold'), cancel = btn(2, '취소', 'ghost');
      ok.onclick = (e) => { e.stopPropagation(); n.done(input.value); };
      cancel.onclick = (e) => { e.stopPropagation(); view(); };
      btns.append(ok, cancel);
      card.append(field, btns);
      box.append(card);
      input.focus();
      input.select?.();
    };
    view();
    try { opt.onShow?.(); } catch { /* 연출 실패는 무시 */ }
  }

  _showChoices(choices, resolve) {
    this.choosing = true;
    this._choices = choices; this._resolveChoice = resolve; this._autoAt = 0;
    const box = this.choicesEl;
    box.innerHTML = '';
    choices.forEach((c, k) => {
      const v = choiceView(c, k), b = document.createElement('button');
      b.innerHTML = v.html;
      if (v.cls) b.className = v.cls;
      b.disabled = v.disabled;
      if (v.locked) b.setAttribute('aria-label', `${c.label} (아직 못 해요${c.note ? `: ${c.note}` : ''})`);
      b.onclick = (e) => { e.stopPropagation(); this.choosing = false; named(this.game.audio, 'blip', 'click'); resolve(c.value); };
      box.append(b);
    });
    this._fillLastRow();
    // 선택지가 뜰 때 짧게 미끄러져 올라옴 (transform·opacity 만)
    box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    box.scrollTop = 0;
    this._moreMark();
  }

  /** 격자(세로 폰 두 칸·가로 폰 세 칸)에서 마지막 줄 빈 칸을 마지막 선택지로 채움 */
  _fillLastRow() {
    const btns = [...(this.choicesEl.querySelectorAll?.(':scope > button') || [])];
    for (const b of btns) { b.style.gridColumn = ''; b.classList.remove('fill-end'); }
    const g = GRID[this._mode], last = btns.at(-1);
    if (!g || !last) return;
    const spans = btns.map(g.span), n = lastRowSpan(spans, g.cols);
    if (n !== spans.at(-1)) { last.style.gridColumn = `span ${n}`; last.classList.add('fill-end'); }
  }

  /** 기둥이 넘쳐 스크롤되면 아래 끝 흐림 표시 (끝까지 내리면 없앰) */
  _moreMark() {
    const box = this.choicesEl;
    const upd = () => {
      const more = box.scrollHeight > box.clientHeight + 2;
      box.classList.toggle('more', more);
      box.classList.toggle('at-end', !more || box.scrollTop + box.clientHeight >= box.scrollHeight - 4);
    };
    if (!this._moreBound) { this._moreBound = true; box.addEventListener('scroll', upd, { passive: true }); }
    upd();
  }

  /** 선택지 자리 정하기: 창 위에 띄우기(float·stack) 또는 창 안(inbox). 클래스 ch-* 로 CSS 가 모양을 정함 */
  _placeChoices(input) {
    const mode = viewMode(input), box = this.choicesEl;
    if (mode === this._mode && box.parentNode) return;
    this._mode = mode;
    if (mode === 'inbox') { const main = this.$('.dlg-main'); if (main.insertBefore) main.insertBefore(box, this.$('.dlg-next')); else main.append(box); }
    else this.el.append(box);
    for (const m of ['float', 'stack', 'inbox']) this.el.classList.toggle('ch-' + m, m === mode);
    if (this.choosing && this._choices) { this._fillLastRow(); this._moreMark(); }
  }
}

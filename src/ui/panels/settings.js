// 환경설정(그래픽 품질·글자 크기)·도움말 창
import { h, esc } from '../dom.js';
import { summaryText, sameFarm, compareCard } from './farm_compare.js';
export { summaryText, sameFarm, compareCard }; // 예전 import 자리 그대로 (테스트·다른 코드)
import { PRESET_INFO, SHADOWS, applyPreset, UI_SCALES, uiScaleOf, autoNow, matchPreset } from '../../game/quality.js';
import { canVibrate, hapticPrefs, shakePrefs, reducedMotion } from '../../game/juice.js';
import { copyDiag } from '../../game/crash.js';
import { touchUI } from '../../game/input.js';
import { parseCode, importSave, localSummary, hasBrokenSave, CODE_ERR, QR_MAX } from '../../game/save.js';
import { farmQrCanvas } from '../join_qr.js';

/** 파일 이름: unico-farm-YYYYMMDD.json */
export function farmFileName(d = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `unico-farm-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.json`;
}
const isLocal = () => typeof location !== 'undefined' && /^(localhost|127\.|\[?::1\]?$)/.test(location.hostname);

/**
 * 농장 코드 복사: 누른 그 순간(사용자 동작 안)에 clipboard.write 를 부르고 내용은 약속으로 넘김
 *  → 압축을 기다린 뒤 복사하면 막는 브라우저(사파리)도 복사됨. 안 되면 writeText → { ok, code }
 *  주의: 클릭 처리에서 await 없이 맨 먼저 부를 것
 */
export async function copyFarmCode(g, nav = globalThis.navigator) {
  const p = Promise.resolve(g.farmCode?.()).catch(() => null);
  const cb = nav?.clipboard;
  if (cb?.write && typeof ClipboardItem === 'function') {
    try {
      const blob = p.then((c) => { if (!c) throw new Error('농장 없음'); return new Blob([c], { type: 'text/plain' }); });
      await cb.write([new ClipboardItem({ 'text/plain': blob })]);
      return { ok: true, code: await p };
    } catch { /* writeText 로 */ }
  }
  const c = await p;
  if (!c) return { ok: false, code: null };
  try { await cb.writeText(c); return { ok: true, code: c }; } catch { return { ok: false, code: c }; }
}

/** 복사가 막혔을 때: 직접 골라 복사할 수 있는 코드 칸 */
function codeBox(c) {
  const ta = h('textarea', 'fm-code');
  ta.readOnly = true; ta.value = c; ta.setAttribute('aria-label', '농장 코드');
  return ta;
}

/** 소리 크기 칸: 전체·음악·효과음·주변 소리 */
const VOL_ROWS = [['master', '전체'], ['music', '음악'], ['sfx', '효과음'], ['amb', '주변 소리']];
const SOUND_MODES = [['all', '🔊', '모두 켬'], ['sfx', '🎵', '효과음만'], ['off', '🔇', '끔']];

/** 이 소리 크기 칸이 지금 소리 상태에서 꺼져 있는지 (끔: 모두, 효과음만: 음악) */
export const volDimmed = (k, mode) => mode === 'off' || (mode === 'sfx' && k === 'music');

/** 소리 크기 칸 한 줄 (이름·막대·퍼센트를 같은 칸 폭으로 맞춤) */
function volRow(k, n, v, mode) {
  const pct = Math.round(v * 100), dim = volDimmed(k, mode);
  return `<label class="gfx-row snd-row" style="display:grid;grid-template-columns:5em 1fr 3.2em;${dim ? 'opacity:0.45' : ''}"${dim ? ' aria-disabled="true"' : ''}>`
    + `<span style="width:auto;text-align:left">${n}</span>`
    + `<input type="range" min="0" max="100" step="5" data-vol="${k}" value="${pct}" aria-label="${n} 크기" aria-valuetext="${n} ${pct}%" style="min-height:44px">`
    + `<span style="width:auto">${pct}%</span></label>`;
}

/** 환경설정·도움말 창 메서드 (UI.prototype 에 합쳐짐) */
export const SettingsPanel = {
  /** 환경설정: 그래픽 품질 프리셋 + 세부 항목 (바로 적용, 브라우저에 저장) */
  openSettings() {
    const g = this.game;
    const p = this.openPanel('⚙️ 환경설정');
    p.dataset.kind = 'settings';
    // 컷신 중에 열면 '건너뛰기' 단추가 창 머리 위에 겹치므로 창이 열린 동안 숨김
    const skip = typeof document !== 'undefined' ? document.querySelector('.cine-skip') : null;
    if (skip && p.parentNode && typeof MutationObserver === 'function') {
      skip.style.visibility = 'hidden';
      // 다시 연 환경설정 창이 있으면 그대로 숨김 (옛 창의 알림이 늦게 와도)
      const mo = new MutationObserver(() => {
        if (p.isConnected) return;
        mo.disconnect();
        if (!document.querySelector('.panel[data-kind="settings"]')) skip.style.visibility = '';
      });
      mo.observe(p.parentNode, { childList: true });
    }
    const render = () => {
      const s = g.gfx;
      const cur = s.preset;
      const lvl = cur === 'auto' ? autoNow(s) : cur;
      const mode = g.audio.mode ?? 'all';
      const rm = reducedMotion();
      const presetBtns = ['auto', 'low', 'medium', 'high'].map((k) => `<button class="gfx-preset ${cur === k ? 'on' : ''}" data-p="${k}"><b>${PRESET_INFO[k].name}</b>${k === 'auto' && cur === 'auto' ? `<small>지금: ${PRESET_INFO[autoNow(s)]?.name || ''}</small>` : ''}</button>`).join('');
      p.querySelector('.gfx-body')?.remove();
      const body = h('div', 'gfx-body', `
        <h3>🖥️ 그래픽 품질 <span class="gfx-fps">측정 중…</span></h3>
        <div class="gfx-presets">${presetBtns}</div>
        <p class="gfx-desc">${PRESET_INFO[cur]?.desc || ''}${cur === 'custom' ? '' : lvl === 'low' ? ' · 저사양 PC 는 이 단계를 권장해요' : ''}</p>
        ${cur === 'auto' ? `<p class="gfx-tip">🧭 이 기기 그래픽에 맞춰 '${PRESET_INFO[s.autoLevel]?.name || ''}'으로 시작해요${s.sessionLevel && s.sessionLevel !== s.autoLevel ? ` · 이번에는 화면이 끊겨 '${PRESET_INFO[s.sessionLevel].name}'으로 낮췄어요 (다음 접속은 다시 '${PRESET_INFO[s.autoLevel]?.name || ''}'부터)` : ''}</p>` : ''}
        <h3>세부 설정</h3>
        <label class="gfx-row">해상도 <input type="range" min="50" max="100" step="5" data-k="scale" value="${Math.round(s.scale * 100)}"><span>${Math.round(s.scale * 100)}%</span></label>
        <label class="gfx-row">그림자 <select data-k="shadows">${Object.entries(SHADOWS).map(([k, v]) => `<option value="${k}" ${s.shadows === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
        <label class="gfx-row">풀·들꽃 양 <input type="range" min="0" max="100" step="5" data-k="grass" value="${Math.round(s.grass * 100)}"><span>${Math.round(s.grass * 100)}%</span></label>
        <label class="gfx-row check"><input type="checkbox" data-k="post" ${s.post ? 'checked' : ''}> 화면 효과 (빛 번짐·계단 현상 제거·색 보정)</label>
        <label class="gfx-row check"><input type="checkbox" data-k="ao" ${s.ao ? 'checked' : ''} ${s.post ? '' : 'disabled'}> 주변광 차폐 (구석 그늘, 가장 무거움)</label>
        <label class="gfx-row check"><input type="checkbox" data-k="tiltShift" ${s.tiltShift ? 'checked' : ''} ${s.post ? '' : 'disabled'}> 미니어처 초점 (위·아래 흐림)</label>
        <label class="gfx-row check"><input type="checkbox" data-k="showFps" ${s.showFps ? 'checked' : ''}> 화면에 FPS 표시</label>
        <h3>🔤 글자·버튼 크기</h3>
        <div class="gfx-presets ui-scales">${UI_SCALES.map((u) => `<button class="gfx-preset ${uiScaleOf(s) === u.v ? 'on' : ''}" data-ui="${u.v}" style="font-size:${Math.round(14 * u.v)}px"><b>${u.name}</b></button>`).join('')}</div>
        ${canVibrate() ? `<h3>📳 진동</h3>
        <label class="gfx-row check"><input type="checkbox" data-pref="haptics" ${hapticPrefs.get() ? 'checked' : ''}> 진동 (수확·입질·버튼을 누를 때 살짝)</label>` : ''}
        <h3>🔊 소리${touchUI() ? '' : ' <small style="font-weight:normal">N 키로도 바꿔요</small>'}</h3>
        <div class="gfx-presets snd-modes" style="grid-template-columns:repeat(3,1fr)">${SOUND_MODES.map(([k, ic, n]) => `<button class="gfx-preset ${mode === k ? 'on' : ''}" data-snd="${k}" aria-pressed="${mode === k}"><span aria-hidden="true" style="font-size:18px;line-height:1">${ic}</span><b style="white-space:nowrap">${n}</b></button>`).join('')}</div>
        ${VOL_ROWS.map(([k, n]) => volRow(k, n, g.audio.volume?.[k] ?? 0, mode)).join('')}
        ${mode === 'off' ? '<p class="gfx-tip">소리가 꺼져 있어요 — 위에서 켜 주세요</p>' : mode === 'sfx' ? '<p class="gfx-tip">음악이 꺼져 있어요 — 음악을 들으려면 \'모두 켬\'을 눌러 주세요</p>' : ''}
        <h3>🎥 화면 움직임</h3>
        <label class="gfx-row check"${rm ? ' style="opacity:0.55"' : ''}><input type="checkbox" data-pref="shake" ${shakePrefs.get() && !rm ? 'checked' : ''} ${rm ? 'disabled' : ''}> 화면 흔들림 (천둥·수확 때 카메라가 살짝 흔들려요)</label>
        ${rm ? '<p class="gfx-tip">기기의 \'동작 줄이기\' 설정이 켜져 있어 흔들림은 꺼져 있어요</p>' : ''}
        <p class="gfx-tip">💡 끊긴다면: 품질 '낮음' → 해상도 낮추기 → 그림자 끄기 순으로 시도해 보세요. 설정은 이 브라우저에 저장돼요.</p>
        <button class="ghost gfx-help" style="margin-top:6px">❓ 도움말 · 조작법 보기</button>
        <button class="ghost gfx-diag" style="margin-top:6px">📋 진단 정보 복사</button>
        <p class="gfx-tip gfx-diag-note" aria-live="polite"></p>`);
      const fm = p.querySelector('.farm-move');
      if (fm) fm.before(body); else p.append(body);
      body.querySelectorAll('.gfx-preset[data-p]').forEach((b) => (b.onclick = () => { g.setGraphics(applyPreset(g.gfx, b.dataset.p)); render(); }));
      body.querySelectorAll('[data-ui]').forEach((b) => (b.onclick = () => { g.setGraphics({ ...g.gfx, uiScale: +b.dataset.ui }); g.audio.play('click'); render(); }));
      // 진동: 그래픽 설정과 따로 저장 (프리셋 비교에 섞이지 않게)
      const hp = body.querySelector('[data-pref="haptics"]');
      if (hp) hp.onchange = () => { hapticPrefs.set(hp.checked); if (hp.checked) g.juice?.haptic?.(15); };
      body.querySelector('.gfx-help').onclick = () => this.openHelp();
      // 진단 정보: 문의할 때 붙여 넣을 글 (기기·품질·최근 오류)
      const note = body.querySelector('.gfx-diag-note');
      body.querySelector('.gfx-diag').onclick = () => copyDiag(note, note);
      // 소리: 세 단추(모두 켬·효과음만·끔) + 크기 (움직이는 동안 바로 반영, 놓으면 저장하고 들려 줌)
      const A = g.audio;
      // 단추·N 키 모두 afterSound 가 이 창을 다시 그림
      const setMode = (m) => { const st = A.setMode ? A.setMode(m) : m; this.afterSound?.(st); return st; };
      body.querySelectorAll('[data-snd]').forEach((b) => (b.onclick = () => {
        if (setMode(b.dataset.snd) !== 'off') A.play('click');
      }));
      body.querySelectorAll('[data-vol]').forEach((el) => {
        const k = el.dataset.vol, name = VOL_ROWS.find((r) => r[0] === k)[1];
        el.oninput = () => { A.volume[k] = +el.value / 100; A.apply?.(); el.nextElementSibling.textContent = el.value + '%'; el.setAttribute('aria-valuetext', `${name} ${el.value}%`); };
        el.onchange = () => {
          A.save?.();
          // 꺼진 칸을 움직이면 소리를 다시 켬 (움직여도 안 들리면 고장 난 것처럼 보임)
          if (volDimmed(k, A.mode ?? 'all')) setMode('all');
          // 미리 듣기는 그 버스로: 주변 소리는 새·물소리, 음악은 쉬는 중이면 짧은 화음, 나머지는 딸깍
          if (k === 'amb') g.music?.ambience?.preview?.();
          else if (k === 'music') g.music?.preview?.();
          else A.play('click');
        };
      });
      const sk = body.querySelector('[data-pref="shake"]');
      sk.onchange = () => { shakePrefs.set(sk.checked); if (g.juice) g.juice.screenShake = sk.checked; if (sk.checked) g.juice?.shake?.(0.3); };
      body.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        const commit = () => {
          let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value / 100 : el.value;
          const next = { ...g.gfx, [k]: v };
          if (k !== 'showFps') next.preset = matchPreset(next);
          g.setGraphics(next);
          render();
        };
        if (el.type === 'range') el.oninput = () => (el.nextElementSibling.textContent = el.value + '%');
        el.onchange = commit;
      });
      this.updateFps();
    };
    this._settingsRender = render;
    render();
    p.append(this.farmMoveSection());
  },

  /** '내 농장 옮기기·보관': 코드 복사·파일 저장·불러오기(비교 후)·휴대폰으로 이어하기(QR)·오래 보관 (+ 앱 설치·업데이트 자리) */
  farmMoveSection() {
    const g = this.game;
    const sec = h('div', 'farm-move', `
      <h3>💾 내 농장 옮기기·보관</h3>
      <p class="gfx-tip">농장은 이 브라우저에만 저장돼요. 다른 기기로 옮기거나 지켜 두려면 농장 코드나 파일로 보관하세요.</p>
      <div class="fm-btns">
        <button class="gold fm-main" data-fm="copy">📋 농장 코드 복사</button>
        <button class="ghost" data-fm="file">💾 파일로 저장</button>
        <button class="ghost" data-fm="load">📥 코드·파일로 불러오기</button>
        <button class="ghost fm-wide" data-fm="qr">📱 휴대폰으로 이어하기</button>
        <button class="ghost fm-wide" data-fm="keep" hidden>🛡️ 이 브라우저에 오래 보관</button>
      </div>
      <p class="gfx-tip fm-keep-st" hidden></p>
      <div class="fm-out" aria-live="polite"></div>
      <div class="pwa-slot"></div>`);
    const out = sec.querySelector('.fm-out');
    const say = (text, cls = '') => { out.replaceChildren(h('p', `gfx-tip fm-note ${cls}`.trim(), esc(text))); };
    const code = async () => {
      const c = await g.farmCode?.();
      if (!c) say('아직 저장된 농장이 없어요. 조금 놀고 나서 다시 해 주세요', 'warn');
      return c;
    };
    sec.querySelector('[data-fm="copy"]').onclick = async () => {
      const r = await copyFarmCode(g); // await 전에 복사를 시작 (사파리)
      if (!r.code) { say('아직 저장된 농장이 없어요. 조금 놀고 나서 다시 해 주세요', 'warn'); return; }
      if (r.ok) { say(`✅ 농장 코드를 복사했어요 (${r.code.length.toLocaleString()}자). 다른 기기의 ⚙️ 환경설정 → '코드·파일로 불러오기'에 붙여 넣으세요`); return; }
      // 복사가 막힌 브라우저: 직접 고를 수 있게 보여 줌
      const ta = codeBox(r.code);
      out.replaceChildren(h('p', 'gfx-tip fm-note', '아래 코드를 모두 골라 복사해 주세요'), ta);
      ta.focus(); ta.select();
    };
    sec.querySelector('[data-fm="file"]').onclick = async () => {
      if (!(await code())) return;
      const raw = g.farmRaw?.();
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = farmFileName(); a.rel = 'noopener';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      say(`✅ '${a.download}' 파일로 저장했어요. 다른 기기에서 '코드·파일로 불러오기'로 열면 돼요`);
    };
    sec.querySelector('[data-fm="load"]').onclick = () => {
      const form = h('div', 'fm-load', `
        <textarea class="fm-code" placeholder="농장 코드(UF1.…)를 붙여 넣으세요" aria-label="농장 코드 붙여 넣기"></textarea>
        <div class="fm-load-row"><button class="ghost fm-pick">📄 파일 고르기</button><input type="file" accept=".json,application/json,text/plain" hidden aria-hidden="true"><button class="gold fm-go">코드 확인</button></div>
        <p class="gfx-tip fm-note" aria-live="polite"></p>`);
      const ta = form.querySelector('textarea'), note = form.querySelector('.fm-note');
      const check = async (text) => {
        note.textContent = '확인하는 중…';
        const r = await parseCode(text);
        if (!r.ok) { note.textContent = `⚠️ ${CODE_ERR[r.reason] || CODE_ERR.format}`; note.classList.add('warn'); return; }
        const card = compareCard(r.summary, {
          onOk: () => { g.save?.(); say('🔄 가져온 농장으로 바꾸는 중…'); importSave(r.data); },
          onNo: () => say('취소했어요. 이 기기 농장은 그대로예요'),
        });
        out.replaceChildren(card);
        card.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); // 긴 창 아래에 생겨도 보이게
        card.querySelector('.fc-ok')?.focus({ preventScroll: true });
      };
      form.querySelector('.fm-go').onclick = () => check(ta.value);
      form.querySelector('.fm-pick').onclick = () => form.querySelector('input[type=file]').click();
      form.querySelector('input[type=file]').onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 256 * 1024) { note.textContent = `⚠️ ${CODE_ERR.toolong}`; return; }
        check(await f.text());
      };
      out.replaceChildren(form);
      ta.focus();
    };
    sec.querySelector('[data-fm="qr"]').onclick = async () => {
      if (isLocal()) { say('지금 주소(내 컴퓨터)는 휴대폰에서 열 수 없어요. 농장 코드를 복사해 옮겨 주세요', 'warn'); return; }
      const c = await code();
      if (!c) return;
      if (c.length > QR_MAX) { say('농장이 커서 QR 에 다 담기지 않아요. 농장 코드 복사나 파일로 옮겨 주세요', 'warn'); return; }
      const box = h('div', 'fm-qr');
      box.append(farmQrCanvas(c, 300), h('p', 'gfx-tip fm-note', '📷 휴대폰 카메라로 찍으면 이 농장을 휴대폰에서 이어서 해요. 농장 코드는 주소 # 뒤에 실려 서버로 보내지 않아요.'));
      out.replaceChildren(box);
    };
    // 오래 보관 (Firefox 등 묻는 브라우저는 여기서 직접 누를 때만)
    const keep = sec.querySelector('[data-fm="keep"]'), keepSt = sec.querySelector('.fm-keep-st'), st = globalThis.navigator?.storage;
    const kept = () => {
      keep.disabled = true; keep.textContent = '🛡️ 오래 보관 켜짐 ✓';
      keepSt.hidden = false; keepSt.textContent = '저장 공간이 모자라도 브라우저가 이 농장을 지우지 않아요';
    };
    if (st?.persist && st.persisted) {
      st.persisted().then((on) => { keep.hidden = false; if (on) kept(); }).catch(() => {});
      keep.onclick = async () => {
        let on = false;
        try { on = await st.persist(); } catch { /* 거절 */ }
        if (on) kept();
        else say('이 브라우저가 오래 보관을 허락하지 않았어요. 가끔 농장 코드를 저장해 두세요', 'warn');
      };
    }
    if (globalThis.navigator?.standalone === false) sec.querySelector('.gfx-tip').textContent += ' 아이폰 사파리는 오래 접속하지 않으면 기록을 지울 수 있어요.';
    try { g.pwa?.renderSettings?.(sec.querySelector('.pwa-slot')); } catch { /* 앱 설치·업데이트 단추 없이 */ }
    return sec;
  },

  /** 아이폰 사파리 안내: 홈 화면에 추가하면 오래 보관 — 홈 화면 앱은 새 농장으로 시작하므로 코드를 먼저 복사 */
  openKeepTip() {
    const g = this.game;
    const p = this.openPanel('📲 농장을 오래 지키려면');
    p.dataset.kind = 'keeptip';
    p.append(h('div', 'rows', [
      '<div class="row">아이폰 사파리는 한동안 들어오지 않으면 농장 기록을 지울 수 있어요. 홈 화면에 추가한 앱은 오래 보관돼요.</div>',
      '<div class="row"><b>1.</b>&nbsp;아래 <b>농장 코드 복사</b>를 눌러요 (홈 화면 앱은 새 농장으로 시작해요)</div>',
      '<div class="row"><b>2.</b>&nbsp;사파리 아래 <b>공유</b> 단추(네모에 위쪽 화살표) → <b>홈 화면에 추가</b></div>',
      '<div class="row"><b>3.</b>&nbsp;홈 화면의 유니코 팜을 열고 ⚙️ 환경설정 → <b>코드·파일로 불러오기</b>에 붙여 넣어요</div>',
    ].join('')));
    const note = h('p', 'gfx-tip fm-note', '');
    note.setAttribute('aria-live', 'polite');
    const copy = h('button', 'gold', '📋 농장 코드 복사');
    const box = h('div', 'fm-tipbox', '');
    copy.onclick = async () => {
      const r = await copyFarmCode(g); // await 전에 복사를 시작 (사파리)
      if (!r.code) { note.textContent = '아직 저장된 농장이 없어요'; return; }
      if (r.ok) { box.replaceChildren(); note.textContent = '✅ 복사했어요. 이제 공유 → 홈 화면에 추가를 눌러 주세요'; return; }
      // 복사가 막힘: 여기서 바로 골라 복사
      const ta = codeBox(r.code);
      box.replaceChildren(ta);
      note.textContent = '복사가 막혔어요. 위 코드를 길게 눌러 모두 선택 → 복사해 주세요';
      ta.focus(); ta.select();
    };
    const later = h('button', 'ghost', '나중에');
    later.onclick = () => this.closePanel();
    p.append(copy, later, box, note);
  },

  openHelp() {
    const p = this.openPanel('❔ 유니코 팜 도움말');
    p.append(h('div', 'rows', [
      '🚶 <b>이동</b> 키보드 WASD/방향키 · 마우스 클릭 또는 터치 탭으로 그 자리까지 이동 · 모바일 왼쪽 조이스틱',
      '👆 <b>상호작용</b> E 키 · 밭/동물/NPC/트랙터를 클릭·탭하면 걸어가서 자동 실행 · 하단 안내 말풍선을 눌러도 실행',
      '🎥 <b>시점</b> 마우스 드래그(왼쪽/오른쪽) 또는 오른쪽 화면 드래그로 회전 · 휠 또는 두 손가락으로 확대/축소 · 나무·건물이 가리면 그 부분만 투명해져요',
      '⚙️ <b>환경설정</b> 오른쪽 위 ⚙️ 버튼 → 그래픽 품질(자동·낮음·보통·높음)과 해상도·그림자·풀 양 조절. 화면이 끊기면 \'낮음\'을 골라 보세요',
      '🗺️ <b>지도</b> 오른쪽 위 미니맵을 누르거나 M 키 → 큰 지도에서 원하는 곳이나 장소 버튼을 누르면 바로 이동',
      '🔊 <b>소리</b> N 키 또는 행동 막대 소리 버튼: 모두 켬 → 음악 끔 → 모두 끔. 환경설정에서 전체·음악·효과음·주변 소리 크기를 따로 맞출 수 있고, 다음에 와도 그대로예요',
      '🌱 <b>농사</b> 밭 근처에서 E: 갈기 → 씨앗 심기 → 물 주기 → 수확. 물을 주면 3배 빨리 자라요',
      '🛒 <b>장터</b> 북쪽 장터 여우에게 씨앗·사료를 사고 작물을 팔아요. 시세는 매일 바뀌고 수요 이벤트가 생겨요',
      '🚜 <b>탈것</b> 마을의 트랙터·자전거·농장 카트 앞에서 E 로 타요. 트랙터는 쟁기를 내려(SPACE·🪓 버튼) 밭을 갈 수 있어요',
      '📱 <b>스마트팜</b> 서쪽 비닐하우스 센서에서 환경제어 미니게임 → 성공하면 작물 성장 부스트',
      '🐄 <b>목장</b> 동쪽 울타리 안 동물에게 사료를 주면 달걀·우유·양털이 생겨요. 말·당나귀·알파카와 반려견 콩이는 쓰다듬을 수 있어요',
      '📜 <b>퀘스트</b> Q 키. 보상을 받으면 레벨이 오르고 새 작물이 해금돼요',
      '🌦️ <b>날씨</b> 내 위치의 실제 날씨가 반영돼요. 비가 오면 밭에 자동으로 물이 뿌려지고, 눈이 오면 작물이 천천히 자라요 (상단 날씨 칩을 눌러 확인·체험)',
      '🏢 <b>KOAT 체험관</b> 북동쪽 광장 (첫 수확을 하면 하단 🏢 버튼이 열려요). 6개 본부(기술사업·벤처창업·종자사업·스마트농업·농기계검정·농업환경분석) 부스에서 미니게임으로 하는 일을 체험하고 스탬프를 모아요',
      '✨ <b>새 버튼</b> 해 보면 하나씩 열려요: 🛒 장터(여우에게 처음 팔면) · 📖 도감(물고기·곤충을 처음 잡으면) · 🏢 체험관(첫 수확) · 🪑 꾸미기(레벨 3) · 🤖 자동(첫 수확·첫 판매 보상을 받으면, P 키)',
      '🌐 <b>메타버스</b> 서버에 접속하면 다른 유니코가 보이고 💬 말하기·🦄 행동·🏡 농장 방 버튼과 채팅이 나타나요 (좌하단)',
      '💾 <b>저장</b> 10초마다 이 브라우저에 자동 저장 · 다른 기기로 옮기거나 지켜 두려면 ⚙️ 환경설정 → 내 농장 옮기기·보관',
    ].map((t) => {
      const m = t.match(/^(\S+)\s+<b>(.*?)<\/b>\s*(.*)$/);
      return m ? `<div class="row help-row"><span class="ic">${m[1]}</span><b>${m[2]}</b><span class="ds">${m[3]}</span></div>` : `<div class="row">${t}</div>`;
    }).join('')));
    const reset = h('button', 'ghost', '🗑 저장 데이터 초기화');
    reset.style.marginTop = '10px';
    reset.onclick = () => { if (confirm('저장된 농장을 지우고 처음부터 시작할까요?')) this.game.resetSave(); };
    p.append(reset);
  },
};

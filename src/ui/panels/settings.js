// 환경설정(그래픽 품질·글자 크기)·도움말 창
import { h } from '../dom.js';
import { PRESETS, PRESET_INFO, SHADOWS, applyPreset, UI_SCALES, uiScaleOf } from '../../game/quality.js';

/** 세부 항목이 어느 프리셋과 똑같은지 (아니면 사용자 지정) */
function matchPreset(s) {
  const keys = Object.keys(PRESETS.high);
  return Object.keys(PRESETS).find((p) => keys.every((k) => PRESETS[p][k] === s[k])) || 'custom';
}

/** 환경설정·도움말 창 메서드 (UI.prototype 에 합쳐짐) */
export const SettingsPanel = {
  /** 환경설정: 그래픽 품질 프리셋 + 세부 항목 (바로 적용, 브라우저에 저장) */
  openSettings() {
    const g = this.game;
    const p = this.openPanel('⚙️ 환경설정');
    p.dataset.kind = 'settings';
    const render = () => {
      const s = g.gfx;
      const cur = s.preset;
      const lvl = cur === 'auto' ? s.autoLevel : cur;
      const presetBtns = ['auto', 'low', 'medium', 'high'].map((k) => `<button class="gfx-preset ${cur === k ? 'on' : ''}" data-p="${k}"><b>${PRESET_INFO[k].name}</b>${k === 'auto' && cur === 'auto' ? `<small>지금: ${PRESET_INFO[s.autoLevel].name}</small>` : ''}</button>`).join('');
      p.querySelector('.gfx-body')?.remove();
      const body = h('div', 'gfx-body', `
        <h3>🖥️ 그래픽 품질 <span class="gfx-fps">측정 중…</span></h3>
        <div class="gfx-presets">${presetBtns}</div>
        <p class="gfx-desc">${PRESET_INFO[cur]?.desc || ''}${cur === 'custom' ? '' : lvl === 'low' ? ' · 저사양 PC 는 이 단계를 권장해요' : ''}</p>
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
        <p class="gfx-tip">💡 끊긴다면: 품질 '낮음' → 해상도 낮추기 → 그림자 끄기 순으로 시도해 보세요. 설정은 이 브라우저에 저장돼요.</p>`);
      p.append(body);
      body.querySelectorAll('.gfx-preset[data-p]').forEach((b) => (b.onclick = () => { g.setGraphics(applyPreset(g.gfx, b.dataset.p)); render(); }));
      body.querySelectorAll('[data-ui]').forEach((b) => (b.onclick = () => { g.setGraphics({ ...g.gfx, uiScale: +b.dataset.ui }); g.audio.play('click'); render(); }));
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
    render();
  },

  openHelp() {
    const p = this.openPanel('❔ 유니코 팜 도움말');
    p.append(h('div', 'rows', [
      '🚶 <b>이동</b> 키보드 WASD/방향키 · 마우스 클릭 또는 터치 탭으로 그 자리까지 이동 · 모바일 왼쪽 조이스틱',
      '👆 <b>상호작용</b> E 키 · 밭/동물/NPC/트랙터를 클릭·탭하면 걸어가서 자동 실행 · 하단 안내 말풍선을 눌러도 실행',
      '🎥 <b>시점</b> 마우스 드래그(왼쪽/오른쪽) 또는 오른쪽 화면 드래그로 회전 · 휠 또는 두 손가락으로 확대/축소 · 나무·건물이 가리면 그 부분만 투명해져요',
      '⚙️ <b>환경설정</b> 오른쪽 위 ⚙️ 버튼 → 그래픽 품질(자동·낮음·보통·높음)과 해상도·그림자·풀 양 조절. 화면이 끊기면 \'낮음\'을 골라 보세요',
      '🗺️ <b>지도</b> 오른쪽 위 미니맵을 누르거나 M 키 → 큰 지도에서 원하는 곳이나 장소 버튼을 누르면 바로 이동',
      '🌱 <b>농사</b> 밭 근처에서 E: 갈기 → 씨앗 심기 → 물 주기 → 수확. 물을 주면 3배 빨리 자라요',
      '🛒 <b>장터</b> 북쪽 장터 여우에게 씨앗·사료를 사고 작물을 팔아요. 시세는 매일 바뀌고 수요 이벤트가 생겨요',
      '🚜 <b>트랙터</b> 60초 밭갈이 미니게임. 키보드 W/S/A/D·SPACE 또는 화면의 ◀ ▶ ▲ ▼·쟁기 버튼 (바위 주의)',
      '📱 <b>스마트팜</b> 서쪽 비닐하우스 센서에서 환경제어 미니게임 → 성공하면 작물 성장 부스트',
      '🐄 <b>목장</b> 동쪽 울타리 안 동물에게 사료를 주면 달걀·우유·양털이 생겨요. 말·당나귀·알파카와 반려견 콩이는 쓰다듬을 수 있어요',
      '📜 <b>퀘스트</b> Q 키. 보상을 받으면 레벨이 오르고 새 작물이 해금돼요',
      '🌦️ <b>날씨</b> 내 위치의 실제 날씨가 반영돼요. 비가 오면 밭에 자동으로 물이 뿌려지고, 눈이 오면 작물이 천천히 자라요 (상단 날씨 칩을 눌러 확인·체험)',
      '🏢 <b>KOAT 체험관</b> 하단 🏢 버튼 또는 북동쪽 광장. 6개 본부(기술사업·벤처창업·종자사업·스마트농업·농기계검정·농업환경분석) 부스에서 미니게임으로 하는 일을 체험하고 스탬프를 모아요',
      '🌐 <b>메타버스</b> 같은 서버의 다른 유니코가 보이고 채팅할 수 있어요 (좌하단)',
      '💾 자동 저장(10초) · 로컬 브라우저 저장',
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

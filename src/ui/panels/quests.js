// 퀘스트 창: 우리 마을 별점 줄 → 편지함 → 탭 [📜 이야기 | 🗓️ 계절 도전]
//  이야기: 받을 보상 → 지금 장 → 다음 장(잠김) → 업적·장기 목표(접힘) (+ 미니게임 최고 기록), 모든 장을 마치면 마을 카드
//  계절 도전: 이번 계절 3개 + 세 개 모두 보상 + 도전 도장
import { h, esc } from '../dom.js';
import { recordsHtml } from '../minigame_frame.js';
import { touchUI } from '../../game/input.js';
import { QUESTS } from '../../game/sim/quests.js';
import { CHAPTERS, QMETA, currentChapter, chapterProgress } from '../../game/sim/chapters.js';
import { starLine, STAR_REWARDS, MAX_STARS } from '../../game/sim/town_rating.js';
import { daysLeft, STAMP_EVERY } from '../../game/sim/weekly.js';
import { seasonOf } from '../../game/sim/season.js';
import { unreadLetters } from '../letters.js';

const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/** 퀘스트 창 메서드 (UI.prototype 에 합쳐짐) */
/** 마을 별점 줄 (접힘) / 카드 (펼침): 별·막대·다음 별 할 일 */
export function townHtml(R, { full = false } = {}) {
  const max = R.stars >= MAX_STARS;
  const next = max ? '<div class="tw-next done">별 다섯 개 마을이에요! 🎉 계속 농사지을 수 있어요</div>'
    : full ? `<div class="tw-reward">다음 별 선물: ${STAR_REWARDS[R.stars + 1].icon} ${esc(STAR_REWARDS[R.stars + 1].text)}</div><div class="tw-list">${R.next.slice(0, 3).map((n, i) => `<div class="tw-it"><span class="ic">${n.icon}</span><span class="tx">${esc(n.label)}${i === 0 ? '' : ' <small>또는</small>'}</span><span class="qty">${n.have}/${n.need}</span></div>`).join('')}</div>`
      : `<div class="tw-next">다음 별: ${R.next[0] ? `${R.next[0].icon} ${esc(R.next[0].short)}` : ''}</div>`;
  return `<div class="tw-head"><span class="tw-name">🏘️ 우리 마을</span><span class="tw-stars" aria-label="마을 별 ${R.stars}개">${starLine(R.stars)}</span></div>`
    + `<div class="tw-bar" role="progressbar" aria-label="다음 별까지" aria-valuenow="${Math.round(R.frac * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.round(R.frac * 100)}%"></i></div>${next}`;
}

/**
 * 위 마을 별 줄을 보일까: 모든 장을 마친 이야기 탭은 아래 마을 카드가 같은 내용 → 줄 숨김
 * → { strip, open } (open: 줄을 펼칠지)
 */
export function townStrip(tab, hasChapter, wantOpen) {
  if (tab === 'story' && !hasChapter) return { strip: false, open: false };
  return { strip: true, open: !!wantOpen };
}

/** 계절 도전 보상 칩 글: '🪙120 · ✨56 XP · 🥕' */
export function rewardChip(r) {
  if (!r) return '';
  return [`🪙${r.money}`, `✨${r.xp} XP`, r.item?.icon].filter(Boolean).join(' · ');
}

export const QuestsPanel = {
  /** tab: 'story' | 'season' | 'town' (마을 카드를 펼친 이야기 탭). 없으면 이야기, 이야기가 비면 계절 도전 */
  openQuests(tab) {
    const g = this.game;
    const p = this.openPanel('📜 퀘스트');
    p.classList.add('qpanel');
    const rec = h('div', 'mg-records', `<h3>🎮 미니게임 최고 기록</h3><div class="rows">${recordsHtml()}</div>`);
    let openAch = false, openDone = false; // 업적·완료 칸 펼침 (다시 그려도 유지)
    let townOpen = tab === 'town';
    const W = g.seasonChallenges?.();
    if (W && !W.key) g.progressNewDay?.(g.world.day);
    const storyEmpty = () => {
      const Q = g.quests;
      return !currentChapter(Q) && !QUESTS.some((x) => !Q.claimed[x.id] && (Q.isComplete(x) || QMETA[x.id].wait || QMETA[x.id].peers));
    };
    let tabNow = tab === 'season' || (!tab && W && (storyEmpty() || (W.claimable > 0 && !QUESTS.some((x) => !g.quests.claimed[x.id] && g.quests.isComplete(x))))) ? 'season' : 'story';
    // 마을 별점 줄 (누르면 펼침)
    const town = h('button', 'tw-strip ghost');
    town.setAttribute('aria-expanded', 'false');
    const paintTown = () => {
      const R = g.checkTown?.() || g.townRating;
      const m = townStrip(tabNow, !!currentChapter(g.quests), townOpen);
      town.hidden = !R || !m.strip;
      town.style.display = town.hidden ? 'none' : '';
      if (town.hidden) return;
      town.innerHTML = townHtml(R, { full: m.open });
      town.classList.toggle('open', m.open);
      town.setAttribute('aria-expanded', String(m.open));
    };
    town.onclick = () => { townOpen = !townOpen; paintTown(); };
    // 편지함
    const mail = h('details', 'lt-box');
    const paintMail = () => {
      const got = g.flags.letters?.got?.length || 0, unread = unreadLetters(g.flags).length;
      mail.style.display = got ? '' : 'none';
      if (!got) return;
      mail.innerHTML = '';
      mail.append(h('summary', '', `📬 편지함 <span class="qprog">${unread ? `새 편지 ${unread}` : got}</span>`));
      mail.append(this.letterList());
      if (unread) mail.open = true;
    };
    // 탭
    const tabs = h('div', 'qt-tabs');
    tabs.setAttribute('role', 'tablist');
    const tabBtn = (id, label) => {
      const b = h('button', 'qt-tab', label);
      b.setAttribute('role', 'tab');
      b.onclick = () => { if (tabNow === id) return; tabNow = id; g.audio?.play?.('click', 0.5); render(); };
      b.dataset.tab = id;
      return b;
    };
    tabs.append(tabBtn('story', '📜 이야기'), tabBtn('season', '🗓️ 계절 도전'));
    p.append(town, mail, tabs);
    const fold = (cls, title, n, rows, get, set) => {
      const d = h('details', cls);
      d.open = get();
      d.ontoggle = () => set(d.open);
      d.append(h('summary', '', `${title} <span class="qprog">${n}</span>`));
      d.append(rows);
      return d;
    };
    const row = (base, { claimed = false, peers = false } = {}) => {
      const Q = g.quests, q = { ...base, count: Math.min(base.goal, Q.progress[base.id] || 0), complete: Q.isComplete(base) };
      const desc = (touchUI() && q.descTouch) || q.desc;
      const pinned = g.flags.pinQuest === q.id;
      const r = h('div', `row quest${claimed ? ' claimed' : q.complete ? ' done' : ''}${pinned ? ' pinned' : ''}`,
        `<div class="qmain"><div class="nm">${claimed ? '✅ ' : ''}${q.title}${peers ? ' <span class="qtag">친구와 함께</span>' : ''}</div>${claimed ? '' : `<div class="desc">${desc}</div><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div>`}</div>${claimed ? '' : `<span class="qty">${q.count}/${q.goal}</span>`}`);
      if (claimed) return r;
      if (!q.complete) {
        const pin = h('button', `ghost qpin${pinned ? ' on' : ''}`, pinned ? '📌 추적 중' : '추적');
        pin.title = pinned ? '추적 그만하기' : '이 퀘스트를 목표 칩에 띄우기';
        pin.setAttribute('aria-label', pin.title);
        pin.onclick = () => { if (pinned) delete g.flags.pinQuest; else g.flags.pinQuest = q.id; g.saveTimer = Math.max(g.saveTimer || 0, 9); render(); };
        r.append(pin);
      }
      const b = h('button', q.complete ? 'gold' : 'ghost', q.complete ? `받기 +${q.reward.money}🪙` : `+${q.reward.money}🪙 ${q.reward.xp}XP`);
      b.disabled = !q.complete;
      b.onclick = () => { g.claimQuest(q.id); render(); };
      r.append(b);
      return r;
    };
    const renderSeason = () => {
      const wrap = h('div', 'qrows wk');
      const day = g.world.day, s = seasonOf(day), d = daysLeft(day);
      wrap.append(h('h3', 'qhead', `🗓️ 이번 계절 도전 <span class="qprog">${s.icon} ${s.name} · ${d ? `D-${d}` : '오늘 마감'}</span>`));
      wrap.append(h('div', 'wk-note', `계절 축제 날(7일째)까지 · 다 하고 못 받은 보상은 다음 계절에 자동으로 받아요`));
      const rows = h('div', 'rows');
      (W?.view() || []).forEach((c, i) => {
        // 보상 칩은 늘 보이고, 금빛 '받기' 단추는 다 했을 때만. 막대는 줄 전체 너비
        const chip = c.reward ? `<span class="wk-rw" aria-label="보상 ${c.reward.money}코인, 경험치 ${c.reward.xp}${c.reward.item ? `, ${esc(c.reward.item.name)}` : ''}">${esc(rewardChip(c.reward))}</span>` : '';
        const r = h('div', `row quest wk-row${c.claimed ? ' claimed' : c.complete ? ' done' : ''}`,
          `<div class="wk-top"><span class="wk-ic">${c.icon}</span><div class="qmain"><div class="nm">${c.claimed ? '✅ ' : ''}${esc(c.title)}</div>${c.claimed ? '' : chip}</div><span class="qty">${c.complete && !c.claimed ? '<b class="wk-ok" aria-hidden="true">✓</b> ' : ''}${c.count}/${c.goal}</span></div>`
          + (c.claimed ? '' : `<div class="bar wk-bar"><i style="width:${Math.round((c.count / c.goal) * 100)}%"></i></div>`));
        if (c.complete && !c.claimed) {
          const b = h('button', 'gold wk-get', '받기');
          b.setAttribute('aria-label', `${c.title} 보상 받기`);
          b.onclick = () => { g.claimChallenge?.(i); render(); };
          r.querySelector('.wk-top').append(b);
        }
        rows.append(r);
      });
      wrap.append(rows);
      const n = W?.list.filter((c) => c.claimed).length || 0, st = W?.stamps || 0;
      wrap.append(h('div', `wk-bonus${W?.bonus ? ' got' : ''}`, `<span class="ic">${W?.bonus ? '🎉' : '🎁'}</span><span>${W?.bonus ? '이번 계절 도전을 모두 마쳤어요!' : `세 개 모두 받으면 꾸미기 소품 + 도전 도장 (${n}/3)`}<small>도전 도장 ${st}개 · ${STAMP_EVERY}개마다 귀한 선물 (다음까지 ${STAMP_EVERY - (st % STAMP_EVERY)}개)</small></span>`));
      p.insertBefore(wrap, rec);
      rec.style.display = 'none';
    };
    const render = () => {
      p.querySelectorAll('.qrows').forEach((e) => e.remove());
      paintTown(); paintMail(); // 모든 장을 마친 이야기 탭이면 위 줄은 숨김 (아래 마을 카드와 같은 내용)
      const wkn = W?.claimable || 0;
      for (const b of tabs.children) {
        const on = b.dataset.tab === tabNow;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
        if (b.dataset.tab === 'season') b.innerHTML = `🗓️ 계절 도전${wkn ? ` <i>${wkn}</i>` : ''}`;
      }
      if (tabNow === 'season') { renderSeason(); return; }
      rec.style.display = '';
      const Q = g.quests, wrap = h('div', 'qrows');
      // 받을 보상 (HUD 의 빨간 수와 같은 목록)
      const ready = QUESTS.filter((x) => !Q.claimed[x.id] && Q.isComplete(x));
      if (ready.length) {
        wrap.append(h('h3', 'qhead gift', `🎁 받을 보상 ${ready.length}`));
        const rows = h('div', 'rows');
        for (const x of ready) rows.append(row(x));
        wrap.append(rows);
      }
      const cur = currentChapter(Q);
      if (cur) {
        const pr = chapterProgress(Q, cur);
        wrap.append(h('h3', 'qhead', `📖 ${cur.n}장 ${cur.title} <span class="qprog">${pr.done}/${pr.total}</span>`));
        const rows = h('div', 'rows'), done = h('div', 'rows');
        for (const id of cur.ids) {
          const x = BY_ID[id], m = QMETA[id];
          if (!x || m.wait || m.peers) continue;
          if (!Q.claimed[id] && Q.isComplete(x)) continue; // 위 받을 보상 칸에
          if (Q.claimed[id]) done.append(row(x, { claimed: true }));
          else rows.append(row(x));
        }
        wrap.append(rows);
        // 받은 퀘스트는 한 줄로 접음
        if (done.children.length) wrap.append(fold('qdone', '✅ 완료', done.children.length, done, () => openDone, (v) => { openDone = v; }));
        const next = CHAPTERS.find((c) => c.n === cur.n + 1);
        if (next) wrap.append(h('div', 'row quest qlock', `<span class="nm">🔒 다음 장: ${next.n}장 ${next.title}</span><small>${cur.n}장을 마치면 열려요 (${pr.done}/${pr.total})</small>`));
      } else {
        // 모든 장을 마침: 마을 꿈 카드 (별·막대·다음 별 할 일)
        const R = g.townRating;
        wrap.append(h('h3', 'qhead', '📖 모든 장을 마쳤어요! 이제 마을의 꿈 ⭐'));
        if (R) wrap.append(h('div', 'tw-card', townHtml(R, { full: true })));
        const go = h('button', 'ghost tw-go', '🗓️ 이번 계절 도전 보기');
        go.onclick = () => { tabNow = 'season'; render(); };
        wrap.append(go);
      }
      // 업적·장기 목표: 기다리는 목표·친구 목표·끝낸 장의 남은 것·뒷장인데 이미 시작한 것 (예전 저장도 고정할 수 있게)
      const ach = QUESTS.filter((x) => {
        if (Q.claimed[x.id] || Q.isComplete(x)) return false;
        const m = QMETA[x.id];
        return m.wait || m.peers || !cur || m.ch < cur.n || (m.ch > cur.n && (Q.progress[x.id] || 0) > 0);
      });
      if (ach.length) {
        const rows = h('div', 'rows');
        for (const x of ach) rows.append(row(x, { peers: !!QMETA[x.id].peers }));
        wrap.append(fold('qach', '🏅 업적·장기 목표', ach.length, rows, () => openAch, (v) => { openAch = v; }));
      }
      p.insertBefore(wrap, rec);
    };
    p.append(rec);
    // 'town' 으로 열었는데 모든 장을 마쳤으면: 줄 대신 이야기 탭의 마을 카드로 스크롤
    if (tab === 'town' && !currentChapter(g.quests)) townOpen = false;
    render();
    if (tab === 'town' && !currentChapter(g.quests)) p.querySelector('.tw-card')?.scrollIntoView?.({ block: 'center' });
  },
};

// 편지: 마을 별(0~5)과 큰 첫걸음(첫 수확·첫 건물·스탬프 완주)마다 KOAT 안내데스크·안내 강아지가 보내는 종이 편지
// 받은 편지는 flags.letters { got, read } 에 (저장됨). 안 읽은 편지는 📜 버튼·☰ 에 📬 표시, 퀘스트 창 위 편지함에서 다시 읽음
import { h, esc } from './dom.js';
import { starLine, STAR_REWARDS, MAX_STARS } from '../game/sim/town_rating.js';

const DESK = 'KOAT 안내데스크';
const GUIDE = '안내 강아지';

/** 편지 내용: from, icon, title, body(문단), star(별 편지면 별 수) */
export const LETTERS = {
  star0: { from: DESK, icon: '💌', title: '유니코 마을 살리기', body: ['유니코 팜에 온 걸 환영해요!', '이 마을은 아직 작고 조용해요. 밭을 일구고, 건물을 짓고, 이웃과 친해지고, 도감을 채울수록 마을에 별이 하나씩 늘어요.', '언젠가 별 다섯 개 마을이 되는 날, 마을 사람 모두가 축하하러 모일 거예요. 우리 함께 해 봐요!'] },
  star1: { from: GUIDE, icon: '🚩', star: 1, title: '첫 번째 별이 떴어!', body: ['마을 표지판에 별이 하나 생겼어! 입구에 알록달록 깃발도 달았어.', '지나가는 사람들이 "여기 좋아졌네" 하더라. 다음 별을 향해 가 보자!'] },
  star2: { from: DESK, icon: '🪑', star: 2, title: '별 두 개 마을 축하 선물', body: ['마을 별이 두 개가 되었어요. 축하해요!', '마을을 더 아늑하게 꾸미라고 벤치·가로등·꽃밭 꾸러미를 꾸미기 보관함에 넣어 두었어요.'] },
  star3: { from: DESK, icon: '👗', star: 3, title: '별 세 개! 마을의 자랑', body: ['벌써 별 세 개라니, 마을이 몰라보게 달라졌어요.', '마을 사람들이 돈을 모아 옷 한 벌을 선물로 마련했어요. 옷장에서 입어 보세요!'] },
  star4: { from: GUIDE, icon: '🗿', star: 4, title: '광장에 동상이 섰어!', body: ['장터 옆 광장에 유니콘 동상이 세워졌어! 다들 사진 찍느라 바빠.', '이제 딱 하나 남았어. 별 다섯 개까지 힘내자!'] },
  star5: { from: DESK, icon: '🏅', star: 5, title: '별 다섯 개 마을이 되었어요', body: ['드디어 유니코 마을이 별 다섯 개 마을이 되었어요!', '마을 사람 모두의 마음을 담아 “유니코 마을 이장” 칭호를 드려요.', '앞으로도 계속 농사짓고, 계절 도전을 즐기며 마을을 가꿔 주세요. 고마워요!'] },
  harvest1: { from: GUIDE, icon: '🥕', title: '첫 수확 축하해!', body: ['네가 처음 거둔 당근, 정말 반짝반짝하더라!', '수확물은 장터 여우에게 팔거나 주문 게시판에 납품할 수 있어. 밭이 비면 또 심자!'] },
  build1: { from: DESK, icon: '🏗️', title: '마을에 첫 건물이 생겼어요', body: ['서쪽 새 마을 부지에 첫 건물이 완공되었어요.', '건물이 늘수록 마을 별점이 쑥쑥 올라가요. 다섯 채를 모두 지어 보세요!'] },
  koat6: { from: DESK, icon: '🏢', title: 'KOAT 스탬프 투어 완주!', body: ['여섯 본부의 체험을 모두 마치셨군요. 정말 대단해요!', '한국농업기술진흥원은 농업 기술이 농부의 밭까지 닿도록 돕는 곳이에요. 체험관에서 배운 것을 마을에서도 마음껏 써 보세요.'] },
};

const box = (g) => {
  const f = (g.flags ||= {});
  const L = (f.letters ||= { got: [], read: [] });
  if (!Array.isArray(L.got)) L.got = [];
  if (!Array.isArray(L.read)) L.read = [];
  return L;
};

/** 편지 보내기 (한 번만) → 새로 보냈으면 true */
export function sendLetter(g, id) {
  if (!LETTERS[id]) return false;
  const L = box(g);
  if (L.got.includes(id)) return false;
  L.got.push(id);
  g.saveTimer = Math.max(g.saveTimer || 0, 9);
  return true;
}

/** 안 읽은 편지 id 목록 (받은 순서) */
export function unreadLetters(flags) {
  const L = flags?.letters;
  if (!L || !Array.isArray(L.got)) return [];
  const read = Array.isArray(L.read) ? L.read : [];
  return L.got.filter((id) => LETTERS[id] && !read.includes(id));
}

/** 편지 UI 메서드 (objective.js 를 거쳐 UI.prototype 에 합쳐짐) */
export const LettersUI = {
  /**
   * 편지 한 통 (종이 카드). o.celebrate: 별이 막 올랐을 때 (도장·별 터짐·보상 칸)
   * 읽음 표시하고 연 창을 돌려줌
   */
  openLetter(id, o = {}) {
    const g = this.game, Lt = LETTERS[id];
    if (!Lt) return null;
    const L = box(g);
    if (!L.read.includes(id)) { L.read.push(id); g.saveTimer = Math.max(g.saveTimer || 0, 9); }
    const p = this.openPanel(o.celebrate && Lt.star ? `⭐ 마을 별 ${Lt.star}개!` : '📬 편지');
    p.classList.add('letter');
    p.dataset.kind = o.celebrate ? 'result' : 'letter'; // 자동 진행 중엔 축하 카드를 잠시 보여 주고 닫음
    let head = '';
    if (Lt.star) {
      const burst = o.celebrate ? `<div class="lt-burst">${Array.from({ length: 10 }, (_, k) => `<i style="--a:${k * 36}deg;--d:${(k % 3) * 0.06}s"></i>`).join('')}</div>` : '';
      head = `<div class="lt-stars${o.celebrate ? ' pop' : ''}" aria-label="마을 별 ${Lt.star}개">${burst}${esc(starLine(Lt.star))}</div>`;
    }
    const rw = Lt.star && STAR_REWARDS[Lt.star];
    const gift = rw ? `<div class="lt-gift"><span class="ic">${rw.icon}</span><span><small>선물</small>${esc(o.giftText || rw.text)}</span></div>` : '';
    p.append(h('div', 'lt-paper', `${head}<div class="lt-to">${esc(g.playerName || '유니코')}에게</div>`
      + `<div class="lt-title">${Lt.icon} ${esc(Lt.title)}</div>`
      + Lt.body.map((t) => `<p>${esc(t)}</p>`).join('')
      + gift
      + `<div class="lt-from">— ${esc(Lt.from)}</div>`
      + (Lt.star === MAX_STARS ? '<div class="lt-more">계속 농사지을 수 있어요 🌱 계절 도전은 계절마다 새로 열려요</div>' : '')));
    const row = h('div', 'lt-btns');
    if (Lt.star && Lt.star < MAX_STARS) {
      const t = h('button', 'ghost lt-town', '⭐ 다음 별 보기');
      t.onclick = () => { this.closePanel(); this.openQuests?.('town'); };
      row.append(t);
    }
    const b = h('button', 'gold lt-ok', '확인');
    b.onclick = () => this.closePanel();
    row.append(b);
    p.append(row);
    return p;
  },

  /** 받은 편지 목록 (퀘스트 창 편지함): 안 읽은 것 먼저 */
  letterList() {
    const L = box(this.game);
    const unread = unreadLetters(this.game.flags);
    const ids = [...unread, ...L.got.filter((id) => !unread.includes(id)).reverse()];
    const wrap = h('div', 'lt-list');
    for (const id of ids) {
      const Lt = LETTERS[id];
      if (!Lt) continue;
      const new_ = unread.includes(id);
      const b = h('button', `lt-row${new_ ? ' new' : ''}`, `<span class="ic">${new_ ? '📬' : Lt.icon}</span><span class="nm">${esc(Lt.title)}<small>${esc(Lt.from)}</small></span>${new_ ? '<b class="lt-new">새 편지</b>' : ''}`);
      b.onclick = () => this.openLetter(id);
      wrap.append(b);
    }
    return wrap;
  },
};

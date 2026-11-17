// 터치 E 버튼이 지금 무엇을 할지: 모드·아이콘·짧은 동사 (DOM 없이 계산만)
// mode: go(하기) · idle(할 것 없음, 흐리게) · next(대화 넘기기) · urgent(지금 당기기!) · hold(꾹 누르기)

/** 눌러도 아무 일 없는 안내 (기다리기·자는 중·호미질 중 등) */
export const PASSIVE = new Set(['wait', 'sleep', 'tree', 'hoeing', 'hive', 'driving', 'diving']);

/** 안내 열쇠 → [아이콘, 동사]. 아이콘이 null 이면 안내 글의 첫 이모지 */
export const ACTION = {
  till: ['⛏️', '갈기'], plant: ['🌱', '심기'], water: ['💧', '물주기'], weed: ['🌿', '김매기'], fert: ['🧪', '퇴비'], harvest: ['🧺', '수확'],
  need_seed: ['🛒', '씨앗 사기'],
  npc: ['💬', '대화'], feed: ['🌾', '먹이'], brush: ['🪮', '빗질'], pet: ['💕', '쓰다듬기'], petfind: ['🎁', '받기'], collect: ['🧺', '줍기'],
  fish: ['🎣', '낚시'], shake: ['🌳', '흔들기'], bug: ['🦋', '잡기'], shoo: ['👋', '쫓기'], honey: ['🍯', '거두기'], chest: ['🎁', '열기'],
  lookout: ['🔭', '구경'], dive: ['🤿', '잠수'], thresh: ['🌾', '탈곡'], rice: [null, '논일'],
  door: ['🚪', '들어가기'], inside: ['🚪', '들어가기'], home: ['🏠', '들어가기'],
  home_door: ['🚪', '나가기'], home_bed: ['🛏️', '잠자기'], home_calendar: ['📅', '보기'], home_desk: ['📒', '보기'], home_wardrobe: ['👗', '갈아입기'], home_books: ['📚', '보기'],
  tractor: ['🚜', '타기'], ride: [null, '타기'],
  barn: ['🐄', '열기'], workshop: ['🧀', '열기'], trough: ['🌾', '채우기'], lakeshop: ['🎣', '열기'], smart: ['📡', '열기'], market: ['🛒', '열기'],
  orders: ['📋', '보기'], jars: ['🏺', '가공'], compost: ['🟫', '열기'], lakeboard: ['🏆', '보기'], wardrobe: ['👗', '열기'],
  eggcatch: ['🥚', '시작'], herd: ['🐑', '시작'], decor: ['🪑', '놓기'], koat: [null, '체험'],
  build: ['🏗️', '짓기'], rush: ['🔨', '완성'], player: ['👋', '인사'],
};

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
let seg = null;
/** 글에서 첫 이모지 한 덩어리 (조합 이모지·변형 선택자 포함) */
export function firstEmoji(s) {
  const str = String(s ?? '');
  if (!str) return '';
  try { seg ||= typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : false; } catch { seg = false; }
  const parts = seg ? Array.from(seg.segment(str), (x) => x.segment) : Array.from(str);
  return parts.find((g) => EMOJI.test(g)) || '';
}

const IDLE = { mode: 'idle', icon: '✋', verb: '' };

/**
 * @param p 지금 안내 ({ key, label, onInteract } 또는 null)
 * @param dlg 대화창 ({ active, choosing })
 * @param extra { bite, reel, seedEmoji, cropEmoji }
 */
export function touchAction(p, dlg, extra = {}) {
  if (dlg?.active) return dlg.choosing ? { mode: 'idle', icon: '💬', verb: '' } : { mode: 'next', icon: '▶', verb: '다음' };
  if (extra.bite) return { mode: 'urgent', icon: '❗', verb: '당기기!' };
  if (extra.reel) return { mode: 'hold', icon: '🎣', verb: '꾹 누르기' };
  if (!p) return IDLE;
  const key = p.key == null ? '' : String(p.key);
  if (key === 'fishing') return { mode: 'idle', icon: '🎣', verb: '' }; // 찌를 기다리는 중
  if (!p.onInteract || PASSIVE.has(key)) return { ...IDLE, icon: firstEmoji(p.label) || IDLE.icon };
  const a = ACTION[key];
  if (a) {
    let icon = a[0] || firstEmoji(p.label) || '👆';
    if (key === 'plant' && extra.seedEmoji) icon = extra.seedEmoji;
    if (key === 'harvest' && extra.cropEmoji) icon = extra.cropEmoji;
    return { mode: 'go', icon, verb: a[1] };
  }
  return { mode: 'go', icon: firstEmoji(p.label) || '👆', verb: '확인' };
}

/** 톡 튀길지 판단용 표시: 같은 대상이면 글이 바뀌어도 같음 */
export function touchSig(a, p) {
  return `${a.mode}|${a.mode === 'next' ? 'dlg' : p?.key ?? ''}`;
}

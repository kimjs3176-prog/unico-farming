/**
 * 한국어 조사 자동 맞춤 (테스트: tests/josa.test.js)
 *  josa('사과', '을/를') → '를' · josa('당근', '이/가') → '이' · josa('서울', '으로/로') → '로'
 *  - 끝 글자의 받침으로 고름 (으로/로 는 ㄹ 받침도 '로')
 *  - 숫자는 읽는 소리로 (1·3·6·7·8·0 받침 있음, 1·7·8 은 ㄹ)
 *  - 끝에 붙은 이모지·공백·따옴표·괄호는 건너뛰고 앞 글자를 봄, 판단할 수 없으면 '을(를)' 처럼 둘 다
 */
const PAIRS = { '을/를': ['을', '를'], '이/가': ['이', '가'], '은/는': ['은', '는'], '와/과': ['과', '와'], '으로/로': ['으로', '로'], '아/야': ['아', '야'] };
const DIGIT_BATCHIM = { 0: 'o', 1: 'l', 2: '', 3: 'o', 4: '', 5: '', 6: 'o', 7: 'l', 8: 'l', 9: '' }; // o 받침, l ㄹ받침, '' 없음

/** 끝 글자 받침: 'none' | 'rieul' | 'other' | null(모름) */
function finalSound(word) {
  const chars = [...String(word ?? '')];
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i], c = ch.codePointAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) { const jong = (c - 0xac00) % 28; return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other'; }
    if (ch >= '0' && ch <= '9') { const b = DIGIT_BATCHIM[ch]; return b === '' ? 'none' : b === 'l' ? 'rieul' : 'other'; }
    if (/[\s'"’”)\]}!?.~·,]/.test(ch) || c > 0x2000) continue; // 공백·따옴표·괄호·이모지 등은 건너뜀
    return null; // 영어 등은 판단하지 않음
  }
  return null;
}

/** 단어에 붙을 조사만 */
export function josa(word, pair) {
  const p = PAIRS[pair];
  if (!p) return '';
  const f = finalSound(word);
  if (f === null) return pair === '으로/로' ? '(으)로' : `${p[0]}(${p[1]})`;
  if (pair === '으로/로') return f === 'other' ? '으로' : '로';
  if (pair === '와/과') return f === 'none' ? '와' : '과';
  return f === 'none' ? p[1] : p[0];
}

/** 단어 + 조사 */
export const withJosa = (word, pair) => `${word}${josa(word, pair)}`;

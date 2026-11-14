import { LINE, bg, mouthOpen } from './portrait_parts.js';

/**
 * 주민 동물 2D 초상화 (SVG 문자열, 200×200, 다운로드 0)
 *  - 머리 중심 ≈ (100, 106), 선 #5B4434 불투명 0.45 굵기 2.6, 단색 채움 + 그늘 하나, 볼 홍조
 *  - 3D 모델과 같은 표식·옷 (여우 턱받이·전대, 너구리 가면·고글, 강아지 귀·눈 얼룩, 곰 반달·머릿수건·안경, 고양이 줄무늬·밀짚모자, 토끼 접힌 귀·멜빵)
 *  - 눈 p2-eye(깜빡임), 입 p2-mc/p2-mo(말할 때), 귀 p2-ear, 토끼 코 p2-nose (CSS 애니메이션)
 *  - 대화창은 64–112px 로 작게 보이므로 선·표식은 굵고 크게
 */

const OL = `stroke="${LINE}" stroke-opacity="0.45" stroke-width="2.6" stroke-linejoin="round"`;
const EYE = '#1d1512';

/** 귀·코 움직임 (style.css 를 건드리지 않게 SVG 안에 둠, 줄이기 설정이면 멈춤) */
const STYLE = `<style>.p2 .p2-ear{animation:p2ear 5.2s ease-in-out infinite}.p2 .p2-ear2{animation-delay:-2.6s}
@keyframes p2ear{0%,90%,100%{transform:rotate(0)}93%{transform:rotate(-5deg)}96%{transform:rotate(4deg)}}
.p2 .p2-nose{animation:p2nose 2.6s infinite}@keyframes p2nose{0%,80%,100%{transform:scale(1)}85%{transform:scale(1.22)}90%{transform:scale(1)}95%{transform:scale(1.18)}}
@media (prefers-reduced-motion:reduce){.p2 .p2-ear,.p2 .p2-nose{animation:none}}</style>`;

/** 감정 → 눈 모양: happy(^^), startle(큰 눈), think(눈 위로·눈썹 기울임), normal */
export function moodOf(sp, emote) {
  if (emote === 'startle') return 'startle';
  if (emote === 'think') return 'think';
  if (emote === 'heart' || emote === 'cheer') return 'happy';
  if (sp === 'bear') return 'happy'; // 곰 할머니는 늘 눈웃음 (놀람·생각 빼고)
  return 'normal';
}
/** 감정 → 팔·소품: wave(든 손), cheer(만세), heart(하트), think(턱 괴기), 그 외 = 역할 기본 */
const poseOf = (emote) => (['wave', 'cheer', 'heart', 'think', 'startle'].includes(emote) ? emote : 'role');

const f1 = (v) => Math.round(v * 10) / 10;
/** ^^ 눈 */
const happyEye = (x, y, w = 10, c = EYE) => `<path class="p2-hp" d="M${x - w} ${y + 3} Q${x} ${y - 9} ${x + w} ${y + 3}" fill="none" stroke="${c}" stroke-width="4.2" stroke-linecap="round"/>`;
/** 볼 홍조 */
const blush = (x, y, a = 0.7, r = 9, c = '#f7a1b5') => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f1(r * 0.66)}" fill="${c}" fill-opacity="${a}"/>`;
/** 머리 그늘 + 이마 하이라이트 (부피감) */
const shade = (id, cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}sh)"/><ellipse cx="${cx - rx * 0.28}" cy="${cy - ry * 0.55}" rx="${f1(rx * 0.32)}" ry="${f1(ry * 0.16)}" fill="#fff" fill-opacity="0.16"/>`;
/** 새싹 브로치 (KOAT 새싹, 유니코와의 연결고리) */
const brooch = (x, y) => `<path d="M${x} ${y - 3} L${x} ${y - 9}" stroke="#4f9a36" stroke-width="1.8" stroke-linecap="round"/><path d="M${x} ${y - 8} Q${x - 7} ${y - 14} ${x - 8} ${y - 8} Q${x - 4} ${y - 6} ${x} ${y - 8} Z M${x} ${y - 9} Q${x + 6} ${y - 16} ${x + 8} ${y - 10} Q${x + 4} ${y - 7} ${x} ${y - 9} Z" fill="#7ac943" stroke="#4f9a36" stroke-width="1.2" stroke-linejoin="round"/><circle cx="${x}" cy="${y}" r="5" fill="#fac03e" stroke="#c48a12" stroke-width="1.6"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.4" fill="#fff" fill-opacity="0.7"/>`;

/**
 * 눈 한 쌍. o: { rx, ry, iris, ring, hl3, lid(고양이 느긋한 눈꺼풀 색), happyC }
 * 놀람은 1.15배, 생각은 위로 2px. 깜빡임 그룹 안에 홍채·테가 같이 들어감
 */
function eyes(m, xs, y, o) {
  if (m === 'happy') return xs.map((x) => happyEye(x, y, o.rx * 1.2, o.happyC || EYE)).join('');
  const s = m === 'startle' ? 1.15 : 1, yy = m === 'think' ? y - 2 : y, rx = f1(o.rx * s), ry = f1(o.ry * s);
  return xs.map((x, i) => {
    let g = `<g class="p2-eye" style="transform-origin:${x}px ${yy}px">`;
    if (o.tilt) g += `<g transform="rotate(${i ? -o.tilt : o.tilt} ${x} ${yy})">`;
    if (o.ring) g += `<ellipse cx="${x}" cy="${yy}" rx="${f1(rx * 1.4)}" ry="${f1(ry * 1.25)}" fill="${o.ring}"/>`;
    if (o.iris) g += `<ellipse cx="${x}" cy="${yy}" rx="${f1(rx * 1.5)}" ry="${f1(ry * 1.08)}" fill="${o.iris}"/>`;
    g += `<ellipse cx="${x}" cy="${yy}" rx="${rx}" ry="${ry}" fill="${EYE}"/>`;
    g += `<ellipse cx="${f1(x + rx * 0.3)}" cy="${f1(yy - ry * 0.38)}" rx="${f1(rx * 0.42)}" ry="${f1(ry * 0.36)}" fill="#fff"/><circle cx="${f1(x - rx * 0.35)}" cy="${f1(yy + ry * 0.42)}" r="${f1(rx * 0.2)}" fill="#fff" fill-opacity="0.85"/>`;
    if (o.hl3) g += `<circle cx="${f1(x - rx * 0.45)}" cy="${f1(yy - ry * 0.2)}" r="${f1(rx * 0.13)}" fill="#fff"/>`;
    if (o.lid && m === 'normal') g += `<path d="M${f1(x - rx * 1.6)} ${f1(yy - ry * 0.55)} Q${x} ${f1(yy - ry * 0.95)} ${f1(x + rx * 1.6)} ${f1(yy - ry * 0.55)} L${f1(x + rx * 1.6)} ${f1(yy - ry * 1.6)} L${f1(x - rx * 1.6)} ${f1(yy - ry * 1.6)} Z" fill="${o.lid}"/>`;
    if (o.tilt) g += '</g>';
    return g + '</g>';
  }).join('');
}

/** 생각·놀람 눈썹 (종마다 색) */
function brows(m, xs, y, c, w = 3.4) {
  if (m === 'think') return `<path d="M${xs[0] - 9} ${y - 2} L${xs[0] + 8} ${y + 2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/><path d="M${xs[1] - 8} ${y - 1} Q${xs[1]} ${y - 9} ${xs[1] + 9} ${y - 5}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  if (m === 'startle') return xs.map((x) => `<path d="M${x - 8} ${y - 4} Q${x} ${y - 11} ${x + 8} ${y - 4}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`).join('');
  return '';
}

/** 팔 하나 (털 막대 + 손바닥) */
function arm(x0, y0, x1, y1, fur, paw, w = 19) {
  return `<path d="M${x0} ${y0} L${x1} ${y1}" stroke="${LINE}" stroke-opacity="0.45" stroke-width="${w + 5}" stroke-linecap="round"/><path d="M${x0} ${y0} L${x1} ${y1}" stroke="${fur}" stroke-width="${w}" stroke-linecap="round"/>
    <ellipse cx="${x1}" cy="${y1 - 2}" rx="${f1(w * 0.66)}" ry="${f1(w * 0.6)}" fill="${paw}" ${OL}/>`;
}

/** 감정 장식: 든 손·만세·하트·턱 괴기·땀방울 (역할 기본 소품은 종마다 따로) */
function extras(pose, S) {
  let s = '';
  if (pose === 'wave') s += arm(152, 204, 170, 146, S.fur, S.paw) + `<path d="M182 132 Q190 140 186 152 M188 122 Q200 134 194 152" fill="none" stroke="${LINE}" stroke-opacity="0.5" stroke-width="2.6" stroke-linecap="round"/>`;
  if (pose === 'cheer') s += arm(50, 204, 28, 148, S.fur, S.paw) + arm(150, 204, 172, 148, S.fur, S.paw) + star(22, 118, 7) + star(178, 116, 8) + star(166, 92, 5);
  if (pose === 'heart') s += `<path d="M168 46 c-4 -9 -18 -7 -16 4 c1 7 16 15 16 15 c0 0 15 -8 16 -15 c2 -11 -12 -13 -16 -4 Z" fill="#ff6f91" stroke="#d94a6e" stroke-width="2" stroke-linejoin="round"/><ellipse cx="160" cy="44" rx="3" ry="2" fill="#fff" fill-opacity="0.8"/>`;
  if (pose === 'think') s += arm(146, 206, 132, 164, S.fur, S.paw, 17) + `<circle cx="170" cy="56" r="4" fill="#fff" ${OL}/><circle cx="180" cy="42" r="6" fill="#fff" ${OL}/>`;
  if (pose === 'startle') s += `<path d="M166 58 Q176 74 166 82 Q156 74 166 58 Z" fill="#bfe6ff" stroke="#6aa8d8" stroke-width="2" stroke-linejoin="round"/><ellipse cx="163" cy="74" rx="2" ry="3" fill="#fff"/>`;
  return s;
}
const star = (x, y, r) => `<path d="M${x} ${y - r} Q${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y} Q${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r} Q${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y} Q${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r} Z" fill="#fac03e"/>`;

/** 종별 그림: (mood, pose, id) → SVG 조각 */
const DRAW = {
  // 장터 여우: 주황 + 크림 볼 갈기(V 얼굴), 끝이 짙은 큰 귀, 빨강 머리띠, 크림 턱받이 + 남색 전대·주황 주머니
  fox(m, pose, id) {
    const fur = '#e8843c', cream = '#fff3e2', dark = '#5a3a2e', S = { fur, paw: dark };
    let s = `<path d="M38 204 Q44 152 100 146 Q156 152 162 204 Z" fill="${fur}" ${OL}/><path d="M72 204 Q76 160 100 154 Q124 160 128 204 Z" fill="${cream}"/>
      <path d="M42 204 L46 184 Q100 196 154 184 L158 204 Z" fill="#34495e"/><rect x="110" y="180" width="26" height="19" rx="6" fill="#f28c28" stroke="#b85f12" stroke-width="2"/><circle cx="123" cy="186" r="3.2" fill="#fac03e"/>`;
    s += brooch(78, 168);
    for (const f of [1, -1]) {
      const x = f > 0 ? 50 : 150;
      s += `<g class="p2-ear${f < 0 ? ' p2-ear2' : ''}" style="transform-origin:${x + 22 * f}px 78px"><path d="M${x} 88 Q${x - 9 * f} 50 ${x - 6 * f} 14 Q${x + 24 * f} 34 ${x + 48 * f} 64 Z" fill="${fur}" ${OL}/>
        <path d="M${x - 3 * f} 40 Q${x - 7 * f} 26 ${x - 6 * f} 14 Q${x + 6 * f} 22 ${x + 16 * f} 36 Q${x + 6 * f} 34 ${x - 3 * f} 40 Z" fill="${dark}"/>
        <path d="M${x + 6 * f} 78 Q${x + 1 * f} 60 ${x + 2 * f} 42 Q${x + 18 * f} 52 ${x + 32 * f} 66 Z" fill="${cream}"/></g>`;
    }
    const head = 'M40 104 Q42 62 100 56 Q158 62 160 104 Q166 132 140 150 Q120 162 100 162 Q80 162 60 150 Q34 132 40 104 Z';
    s += `<path d="${head}" fill="${fur}" ${OL}/>
      <path d="M34 110 Q58 118 80 132 Q92 116 100 114 Q108 116 120 132 Q142 118 166 110 Q162 146 128 158 Q100 168 72 158 Q38 146 34 110 Z" fill="${cream}"/>
      <path d="${head}" fill="url(#${id}sh)"/><ellipse cx="80" cy="72" rx="20" ry="7" fill="#fff" fill-opacity="0.16"/>
      <path d="M58 77 Q100 62 142 77 L139 88 Q100 75 61 88 Z" fill="#e35d5d"/><path d="M138 80 Q150 70 156 74 Q154 84 142 88 Z M140 86 Q152 92 152 100 Q144 98 136 90 Z" fill="#e35d5d" stroke="#b8403f" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += eyes(m, [76, 124], 106, { rx: 8.5, ry: 11, tilt: 12 });
    if (m === 'normal') s += `<path d="M63 93 Q76 87 89 94" fill="none" stroke="${dark}" stroke-width="3.2" stroke-linecap="round"/><path d="M111 94 Q124 87 137 93" fill="none" stroke="${dark}" stroke-width="3.2" stroke-linecap="round"/>`;
    s += brows(m, [76, 124], 90, dark);
    s += `<ellipse cx="100" cy="127" rx="8.5" ry="5.8" fill="#2a1d18"/><ellipse cx="97" cy="125" rx="2.6" ry="1.6" fill="#fff" fill-opacity="0.7"/>` + blush(58, 128, m === 'happy' ? 0.8 : 0.5) + blush(142, 128, m === 'happy' ? 0.8 : 0.5);
    s += m === 'startle' ? `<ellipse class="p2-mc" cx="100" cy="142" rx="4.5" ry="5.5" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.2"/>` : `<path class="p2-mc" d="M89 138 Q100 147 112 135" fill="none" stroke="${LINE}" stroke-width="3.2" stroke-linecap="round"/>`;
    s += mouthOpen(100, 142, 11);
    // 역할 기본: 동전 한 닢 들고 으쓱
    if (pose === 'role') s += arm(150, 206, 156, 182, fur, dark, 18) + `<circle cx="164" cy="164" r="12" fill="#fac03e" stroke="#c48a12" stroke-width="2.4"/><circle cx="164" cy="164" r="6.5" fill="none" stroke="#c48a12" stroke-width="1.8"/><path d="M158 158 l3 -2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
    return s + extras(pose, S);
  },

  // 연구원 너구리: 회갈색 털 + 크림 배, 검은 눈가 가면·볼 털·흰 미간, 이마 위 고글(보라 끈), 보라 스카프
  raccoon(m, pose, id) {
    const fur = '#9a8d7e', light = '#f1ebe1', dark = '#3f3631', S = { fur, paw: dark };
    let s = `<path d="M36 204 Q42 150 100 144 Q158 150 164 204 Z" fill="${fur}" ${OL}/><path d="M70 204 Q76 166 100 160 Q124 166 130 204 Z" fill="${light}"/>
      <path d="M56 150 Q100 172 144 150 L141 165 Q100 186 59 165 Z" fill="#8e7cc3" stroke="#6b5aa3" stroke-width="2" stroke-linejoin="round"/><path d="M90 168 L100 196 L112 168 Z" fill="#8e7cc3" stroke="#6b5aa3" stroke-width="2" stroke-linejoin="round"/>`;
    s += brooch(100, 172);
    for (const f of [1, -1]) {
      const x = f > 0 ? 52 : 148;
      s += `<g class="p2-ear${f < 0 ? ' p2-ear2' : ''}" style="transform-origin:${x + 12 * f}px 70px"><ellipse cx="${x}" cy="58" rx="22" ry="22" fill="${light}" ${OL}/><ellipse cx="${x + 2 * f}" cy="61" rx="13" ry="13" fill="${dark}"/></g>`;
    }
    s += `<ellipse cx="100" cy="106" rx="64" ry="52" fill="${fur}" ${OL}/>`;
    // 볼 털: 둥근 물결 두 덩이씩 (네모난 턱이 아니라 둥근 머리 옆으로 삐져나온 털)
    for (const f of [1, -1]) {
      const x = 100 - 52 * f;
      s += `<path d="M${x + 16 * f} 116 Q${x - 6 * f} 112 ${x - 18 * f} 124 Q${x - 26 * f} 134 ${x - 16 * f} 140 Q${x - 20 * f} 150 ${x - 6 * f} 150 Q${x + 6 * f} 156 ${x + 20 * f} 142 Z" fill="${light}" ${OL}/>`;
    }
    s += `<path d="M44 100 Q60 86 84 96 Q96 104 100 104 Q104 104 116 96 Q140 86 156 100 Q150 124 124 121 Q108 118 100 116 Q92 118 76 121 Q50 124 44 100 Z" fill="${dark}"/>
      <path d="M96.5 88 Q100 85.5 103.5 88 L103 111 Q100 114 97 111 Z" fill="${light}"/>
      <path d="M74 126 Q100 116 126 126 Q122 152 100 155 Q78 152 74 126 Z" fill="${light}"/>
      <ellipse cx="100" cy="106" rx="64" ry="52" fill="url(#${id}sh)"/>`;
    // 이마 위로 올린 고글 (보라 끈이 머리를 감쌈)
    s += `<path d="M40 70 Q100 46 160 70 L160 80 Q100 58 40 80 Z" fill="#8e7cc3"/>
      <circle cx="80" cy="62" r="14" fill="#3a3f45"/><circle cx="80" cy="62" r="9.5" fill="#bfe3f5"/><path d="M75 57 l5 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="120" cy="62" r="14" fill="#3a3f45"/><circle cx="120" cy="62" r="9.5" fill="#bfe3f5"/><path d="M115 57 l5 -3" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><rect x="93" y="59" width="14" height="6" rx="3" fill="#3a3f45"/>`;
    s += eyes(m, [76, 124], 106, { rx: 8, ry: 10, ring: '#8c847c', happyC: light });
    s += brows(m, [76, 124], 89, light);
    s += `<ellipse cx="100" cy="131" rx="8.5" ry="5.8" fill="#2a1d18"/><ellipse cx="97" cy="129" rx="2.6" ry="1.6" fill="#fff" fill-opacity="0.7"/>
      <path d="M76 136 L58 132 M76 142 L59 145 M124 136 L142 132 M124 142 L141 145" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>`;
    s += m === 'startle' ? `<ellipse class="p2-mc" cx="100" cy="144" rx="4.5" ry="5.5" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.2"/>` : `<path class="p2-mc" d="M89 141 Q94.5 148 100 141 Q105.5 148 111 141" fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>`;
    s += mouthOpen(100, 145, 10);
    // 역할 기본: 태블릿
    if (pose === 'role') s += arm(144, 206, 140, 180, fur, dark, 17) + `<g transform="rotate(8 156 176)"><rect x="140" y="156" width="32" height="42" rx="5" fill="#4a90d9" stroke="#2f6aa8" stroke-width="2"/><rect x="144" y="161" width="24" height="31" rx="2" fill="#bfe8ff"/><path d="M148 182 l5 -6 l5 4 l6 -9" fill="none" stroke="#4a90d9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>` + `<ellipse cx="146" cy="186" rx="9" ry="8" fill="${dark}" ${OL}/>`;
    return s + extras(pose, S);
  },

  // 안내 강아지 (바둑이): 비스킷색 + 밤색 늘어진 귀, 오른쪽 눈 얼룩, 흰 주둥이, 초록 스카프, 확성기
  puppy(m, pose, id) {
    const fur = '#f0d09a', white = '#fffaf1', brown = '#a96a3f', S = { fur, paw: white };
    let s = `<path d="M40 204 Q46 154 100 148 Q154 154 160 204 Z" fill="${fur}" ${OL}/><path d="M74 204 Q80 166 100 160 Q120 166 126 204 Z" fill="${white}"/>
      <path d="M58 152 Q100 172 142 152 L138 166 Q100 184 62 166 Z" fill="#7ac943" stroke="#4f9a36" stroke-width="2" stroke-linejoin="round"/><path d="M88 168 L100 194 L112 168 Z" fill="#7ac943" stroke="#4f9a36" stroke-width="2" stroke-linejoin="round"/>`;
    s += brooch(100, 172);
    s += `<ellipse cx="100" cy="102" rx="60" ry="56" fill="${fur}" ${OL}/><ellipse cx="124" cy="99" rx="21" ry="19" fill="${brown}" fill-opacity="0.85"/>
      <ellipse cx="100" cy="131" rx="35" ry="26" fill="${white}"/><ellipse cx="100" cy="102" rx="60" ry="56" fill="url(#${id}sh)"/><ellipse cx="82" cy="66" rx="20" ry="8" fill="#fff" fill-opacity="0.18"/>`;
    for (const f of [1, -1]) {
      const x = f > 0 ? 44 : 156;
      s += `<g class="p2-ear${f < 0 ? ' p2-ear2' : ''}" style="transform-origin:${x + 8 * f}px 66px"><path d="M${x + 8 * f} 62 Q${x - 24 * f} 68 ${x - 18 * f} 124 Q${x - 6 * f} 142 ${x + 10 * f} 122 Q${x + 20 * f} 92 ${x + 8 * f} 62 Z" fill="${brown}" ${OL}/></g>`;
    }
    const by = m === 'think' || m === 'startle' ? 78 : 82;
    s += `<ellipse cx="78" cy="${by}" rx="5" ry="3.6" fill="${brown}"/><ellipse cx="122" cy="${by}" rx="5" ry="3.6" fill="${brown}"/>`;
    s += eyes(m, [78, 124], 102, { rx: 10.5, ry: 13, hl3: true });
    s += `<path d="M89 119 Q100 112 111 119 Q109 130 100 132 Q91 130 89 119 Z" fill="#2a1d18"/><ellipse cx="96" cy="119" rx="3.6" ry="2" fill="#fff" fill-opacity="0.75"/>`;
    s += `<circle cx="82" cy="138" r="1.8" fill="${brown}"/><circle cx="77" cy="133" r="1.8" fill="${brown}"/><circle cx="84" cy="131" r="1.8" fill="${brown}"/><circle cx="118" cy="138" r="1.8" fill="${brown}"/><circle cx="123" cy="133" r="1.8" fill="${brown}"/><circle cx="116" cy="131" r="1.8" fill="${brown}"/>`;
    s += blush(60, 124, m === 'happy' ? 0.85 : 0.7) + blush(140, 124, m === 'happy' ? 0.85 : 0.7);
    if (m === 'happy') s += `<g class="p2-mc"><path d="M86 137 Q100 134 114 137 Q112 157 100 157 Q88 157 86 137 Z" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="100" cy="151" rx="8" ry="5" fill="#f27c8c"/></g>`;
    else if (m === 'startle') s += `<ellipse class="p2-mc" cx="100" cy="143" rx="5" ry="6" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.2"/>`;
    else s += `<path class="p2-mc" d="M86 136 Q93 145 100 137 Q107 145 114 136" fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>`;
    s += mouthOpen(100, 141, 12);
    // 역할 기본: 확성기
    if (pose === 'role') s += arm(146, 206, 146, 184, fur, white, 18) + `<path d="M150 182 L180 160 L190 194 Z" fill="#fac03e" stroke="#c48a12" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="185" cy="177" rx="5" ry="17" transform="rotate(-18 185 177)" fill="#ffe08a" stroke="#c48a12" stroke-width="2"/><rect x="140" y="182" width="14" height="16" rx="3" fill="#e35d5d"/>`;
    return s + extras(pose, S);
  },

  // 곰 할머니 (반달가슴곰): 코코아 몸, 황갈 주둥이, 눈가 패치, 머릿수건, 금테 안경, 늘 눈웃음, 목깃 크림 반달
  bear(m, pose, id) {
    const fur = '#4f423b', tan = '#c9a27c', cream = '#f3e6cc', patch = '#8a7464', cloth = '#f3e9d2', S = { fur, paw: '#3a302b' };
    let s = `<path d="M30 204 Q36 146 100 140 Q164 146 170 204 Z" fill="${fur}" ${OL}/><path d="M60 164 Q100 196 140 164 Q134 184 100 188 Q66 184 60 164 Z" fill="${cream}"/>`;
    s += brooch(62, 186);
    s += `<ellipse cx="100" cy="104" rx="66" ry="56" fill="${fur}" ${OL}/>
      <path d="M36 92 Q40 46 100 42 Q160 46 164 92 Q130 72 100 74 Q70 72 36 92 Z" fill="${cloth}" ${OL}/>
      <path d="M38 90 Q70 70 100 72 Q130 70 162 90" fill="none" stroke="#ddd0b2" stroke-width="2.4" stroke-linecap="round"/>
      ${[[60, 70], [84, 58], [114, 55], [140, 66], [48, 84], [126, 77], [98, 66], [72, 82], [70, 56], [132, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#eb9094"/>`).join('')}
      <path d="M160 86 Q172 76 176 82 Q172 90 162 90 Z M160 90 Q170 98 166 104 Q160 100 158 92 Z" fill="${cloth}" ${OL}/><ellipse cx="160" cy="89" rx="5" ry="4.2" fill="#e6d9bc" ${OL}/>`;
    for (const f of [1, -1]) {
      const x = f > 0 ? 48 : 152;
      s += `<g class="p2-ear${f < 0 ? ' p2-ear2' : ''}" style="transform-origin:${x + 10 * f}px 68px"><circle cx="${x}" cy="58" r="19" fill="${fur}" ${OL}/><circle cx="${x + 1 * f}" cy="60" r="9.5" fill="${tan}"/></g>`;
    }
    s += `<ellipse cx="100" cy="108" rx="46" ry="19" fill="${patch}"/><ellipse cx="100" cy="133" rx="30" ry="22" fill="${tan}"/>
      <ellipse cx="100" cy="104" rx="66" ry="56" fill="url(#${id}sh)"/>`;
    s += `<ellipse cx="76" cy="${m === 'happy' ? 92 : 88}" rx="6.5" ry="2.3" fill="${cream}"/><ellipse cx="124" cy="${m === 'happy' ? 92 : 88}" rx="6.5" ry="2.3" fill="${cream}"/>`;
    s += eyes(m, [76, 124], 108, { rx: 7, ry: 9, happyC: '#2a1d18' });
    if (m === 'happy') s += `<path d="M61 110 l-5 3 M62 104 l-6 -1 M139 110 l5 3 M138 104 l6 -1" stroke="#3a302b" stroke-width="2" stroke-linecap="round"/>`;
    s += brows(m, [76, 124], 86, cream);
    // 동그란 금테 안경
    s += `<circle cx="76" cy="107" r="15" fill="#fff" fill-opacity="0.12" stroke="#c9a23e" stroke-width="2.8"/><circle cx="124" cy="107" r="15" fill="#fff" fill-opacity="0.12" stroke="#c9a23e" stroke-width="2.8"/>
      <path d="M91 105 Q100 100 109 105 M61 104 L42 98 M139 104 L158 98" fill="none" stroke="#c9a23e" stroke-width="2.6" stroke-linecap="round"/>`;
    s += `<ellipse cx="100" cy="125" rx="11.5" ry="7.8" fill="#2a1d18"/><ellipse cx="96" cy="122.5" rx="3.6" ry="2" fill="#fff" fill-opacity="0.6"/>` + blush(56, 130, 0.75, 10, '#f2a0a0') + blush(144, 130, 0.75, 10, '#f2a0a0');
    s += m === 'startle' ? `<ellipse class="p2-mc" cx="100" cy="144" rx="5" ry="6" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.2"/>` : `<path class="p2-mc" d="M86 140 Q100 152 114 140" fill="none" stroke="${LINE}" stroke-width="3.2" stroke-linecap="round"/>`;
    s += mouthOpen(100, 144, 12);
    return s + extras(pose, S);
  },

  // 낚시꾼 고양이 (고등어 태비): 청회색 + 흰 주둥이, 이마 M·볼 줄무늬, 호박색 눈, 귀 뒤로 젖힌 밀짚모자(파랑 띠), 파랑 목수건, 낚싯대
  cat(m, pose, id) {
    const fur = '#9ba7b7', white = '#fbf8f2', str = '#5f6b7d', S = { fur, paw: white };
    // 모자는 머리 뒤 (젖혀 씀): 챙·크라운을 먼저 그리고 귀·머리가 앞을 가림
    let s = `<ellipse cx="100" cy="60" rx="80" ry="17" transform="rotate(-5 100 60)" fill="#e8c872" ${OL}/><path d="M60 54 Q78 54 84 50 M118 50 Q126 54 142 52" fill="none" stroke="#c9a24e" stroke-width="2" stroke-linecap="round"/>
      <path d="M66 56 Q66 20 100 18 Q134 20 134 56 Z" fill="#e8c872" ${OL}/><path d="M66 46 Q100 38 134 46 L134 56 Q100 48 66 56 Z" fill="#3a7bd5"/>`;
    s += `<path d="M40 204 Q46 154 100 148 Q154 154 160 204 Z" fill="${fur}" ${OL}/><path d="M76 204 Q80 166 100 160 Q120 166 124 204 Z" fill="${white}"/>
      <path d="M58 154 Q100 172 142 154 L139 167 Q100 184 61 167 Z" fill="#3a7bd5" stroke="#2b62b0" stroke-width="2" stroke-linejoin="round"/><path d="M88 170 L100 194 L112 170 Z" fill="#3a7bd5" stroke="#2b62b0" stroke-width="2" stroke-linejoin="round"/>`;
    s += brooch(100, 174);
    for (const f of [1, -1]) {
      const x = f > 0 ? 48 : 152;
      s += `<g class="p2-ear${f < 0 ? ' p2-ear2' : ''}" style="transform-origin:${x + 20 * f}px 82px"><path d="M${x} 92 Q${x - 2 * f} 60 ${x + 4 * f} 30 Q${x + 26 * f} 44 ${x + 44 * f} 64 Z" fill="${fur}" ${OL}/><path d="M${x + 8 * f} 80 Q${x + 8 * f} 62 ${x + 10 * f} 46 Q${x + 22 * f} 54 ${x + 31 * f} 65 Z" fill="#f2b5c4"/></g>`;
    }
    s += `<ellipse cx="100" cy="108" rx="64" ry="52" fill="${fur}" ${OL}/>
      <path d="M86 62 L88 84 M100 58 L100 82 M114 62 L112 84" stroke="${str}" stroke-width="5" stroke-linecap="round"/>
      <path d="M38 104 L58 106 M38 116 L58 114 M162 104 L142 106 M162 116 L142 114" stroke="${str}" stroke-width="4" stroke-linecap="round"/>
      <path d="M70 130 Q74 112 100 114 Q126 112 130 130 Q126 154 100 156 Q74 154 70 130 Z" fill="${white}"/>
      <ellipse cx="100" cy="108" rx="64" ry="52" fill="url(#${id}sh)"/>`;
    s += eyes(m, [76, 124], 106, { rx: 8, ry: 11.5, iris: '#c9a33a', lid: fur });
    s += brows(m, [76, 124], 90, str);
    s += `<path d="M94 123 L106 123 L100 130 Z" fill="#f09aa8" stroke="#d07a88" stroke-width="1.4" stroke-linejoin="round"/>` + blush(60, 128, m === 'happy' ? 0.75 : 0.5) + blush(140, 128, m === 'happy' ? 0.75 : 0.5);
    s += m === 'startle' ? `<ellipse class="p2-mc" cx="100" cy="139" rx="4.5" ry="5.5" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.2"/>` : `<path class="p2-mc" d="M88 133 Q94 140 100 133 Q106 140 112 133" fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>`;
    s += mouthOpen(100, 139, 10);
    s += `<path d="M68 128 L30 121 M68 134 L32 138 M132 128 L170 121 M132 134 L168 138" stroke="#fff" stroke-opacity="0.95" stroke-width="2.2" stroke-linecap="round"/>`;
    // 역할 기본: 어깨에 멘 낚싯대 끝 + 찌
    if (pose === 'role') s += `<path d="M150 204 L194 66" stroke="#8a5a3c" stroke-width="4.5" stroke-linecap="round"/><path d="M194 66 Q198 96 190 118" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="1.4"/><circle cx="190" cy="122" r="5" fill="#e35d5d" stroke="#fff" stroke-width="1.6"/>` + arm(146, 206, 158, 178, fur, white, 17);
    return s + extras(pose, S);
  },

  // 꼬마 토끼: 밀크티색, 테 위로 잘린 긴 귀 (왼쪽 귀 = 화면 왼쪽, 끝이 접힘 + 분홍 리본), 앞니, 진한 볼, 분홍 멜빵
  rabbit(m, pose, id) {
    const fur = '#ddbba0', white = '#fffaf3', inner = '#f6b8c8', tip = '#b88f6c', S = { fur, paw: '#f4e4cf' };
    let s = `<path d="M44 204 Q50 160 100 154 Q150 160 156 204 Z" fill="${fur}" ${OL}/><path d="M64 204 L66 174 Q100 168 134 174 L136 204 Z" fill="#f28bb0" stroke="#d96b93" stroke-width="2" stroke-linejoin="round"/>
      <path d="M71 176 L64 156 M129 176 L136 156" stroke="#f28bb0" stroke-width="7.5" stroke-linecap="round"/><circle cx="72" cy="180" r="4.4" fill="#fac03e" stroke="#c48a12" stroke-width="1.4"/><circle cx="128" cy="180" r="4.4" fill="#fac03e" stroke="#c48a12" stroke-width="1.4"/>`;
    s += brooch(100, 188);
    // 접힌 왼쪽 귀(화면 왼쪽) + 리본, 곧은 오른쪽 귀
    s += `<g class="p2-ear" style="transform-origin:80px 80px"><path d="M86 80 Q88 46 74 16 Q62 4 50 2 Q40 14 60 30 Q70 52 74 80 Z" fill="${fur}" ${OL}/><path d="M82 74 Q82 46 70 22 Q60 12 54 10 Q56 22 66 32 Q76 52 78 74 Z" fill="${inner}"/><path d="M60 2 Q40 14 60 30 Q56 14 60 2 Z" fill="${tip}"/></g>
      <g class="p2-ear p2-ear2" style="transform-origin:121px 80px"><path d="M114 80 Q108 34 120 -8 Q140 -12 140 30 Q138 60 128 80 Z" fill="${fur}" ${OL}/><path d="M118 74 Q114 36 123 2 Q134 2 134 32 Q132 58 124 74 Z" fill="${inner}"/></g>
      <path d="M64 76 Q54 64 60 58 Q72 60 78 72 Z M84 72 Q96 62 102 68 Q98 80 86 80 Z" fill="#f28bb0" stroke="#d96b93" stroke-width="1.8" stroke-linejoin="round"/><circle cx="80" cy="75" r="5" fill="#f9b5cd" stroke="#d96b93" stroke-width="1.6"/>`;
    s += `<ellipse cx="100" cy="114" rx="58" ry="50" fill="${fur}" ${OL}/><ellipse cx="100" cy="138" rx="28" ry="20" fill="${white}"/>
      <ellipse cx="100" cy="114" rx="58" ry="50" fill="url(#${id}sh)"/><ellipse cx="84" cy="82" rx="18" ry="7" fill="#fff" fill-opacity="0.18"/>`;
    s += eyes(m, [78, 122], 112, { rx: 11, ry: 14, hl3: true });
    s += brows(m, [78, 122], 93, tip);
    s += `<g class="p2-nose" style="transform-origin:100px 129px"><path d="M95 127 Q100 123 105 127 Q102 132 100 132 Q98 132 95 127 Z" fill="#f09aa8"/></g>`;
    s += `<path d="M70 136 L40 131 M70 141 L42 145 M130 136 L160 131 M130 141 L158 145" stroke="#fff" stroke-opacity="0.95" stroke-width="2" stroke-linecap="round"/>`;
    s += m === 'startle'
      ? `<g class="p2-mc"><path d="M100 132 L100 136" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="100" cy="142" rx="5" ry="6" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.2"/></g>`
      : `<g class="p2-mc"><path d="M100 132 L100 137 M100 137 Q94 143 89 139 M100 137 Q106 143 111 139" fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/><rect x="95.5" y="138.5" width="4" height="7" rx="1.5" fill="#fff" stroke="${LINE}" stroke-width="1"/><rect x="100.5" y="138.5" width="4" height="7" rx="1.5" fill="#fff" stroke="${LINE}" stroke-width="1"/></g>`;
    s += mouthOpen(100, 141, 10);
    s += blush(62, 132, 0.9, 11) + blush(138, 132, 0.9, 11);
    // 역할 기본: 만세
    if (pose === 'role') s += arm(52, 206, 32, 150, fur, S.paw) + arm(148, 206, 168, 150, fur, S.paw);
    return s + extras(pose, S);
  },
};

/** 그림이 있는 종 */
export const PORTRAIT_SPECIES = Object.keys(DRAW);

/**
 * @param sp 종 id (fox|raccoon|puppy|bear|cat|rabbit)
 * @param accent 말하는 사람 색 (배경)
 * @param emote 감정 (heart·cheer = ^^, think, startle, wave, 그 외 = 역할 기본)
 * @param id SVG 안 id 접두어 (한 화면에 여러 장이어도 겹치지 않게)
 * @returns SVG 안쪽 문자열 (viewBox 0 0 200 200)
 */
export function speciesSVG(sp, accent, emote, id = 'p2s_') {
  const draw = DRAW[sp];
  if (!draw) return '';
  if (!/^#[0-9a-f]{6}$/i.test(accent || '')) accent = '#30b6aa';
  return STYLE + bg(id, accent) + draw(moodOf(sp, emote), poseOf(emote), id);
}

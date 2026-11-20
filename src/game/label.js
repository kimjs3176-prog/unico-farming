import * as THREE from 'three';
import { fixEmoji, icoBitmap } from '../ui/icons.js';

const FAMILY = `'Unico Coin', Jua, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

/**
 * 머리 위 글자 스프라이트(이름표·말풍선·감정 아이콘·떠오르는 글자) 전부.
 * 후처리를 켠 화질은 이것들을 화면 효과(톤 매핑·색 보정·미니어처 흐림·비네팅·주변광 차폐·연못 반사) 뒤에 따로 그림 (postfx.js)
 * makeLabel 이 넣고 dispose 가 뺌. 이름표를 .clone() 한 것은 registerLabel 로 넣어야 함 (안 넣으면 화면 효과 안에서 그대로 그려짐)
 */
export const LABELS = new Set();
/**
 * 목록에 넣고, 부모에서 떼면(remove) 빼고 다시 붙이면(add) 다시 넣음 → dispose 없이 떼어 버린 이름표가 목록에 남아 쌓이지 않음
 * (조상째 떼면 그대로 남으므로 버릴 때는 userData.dispose 를 부르는 것이 맞음)
 */
const TRACKED = new WeakSet(), DEAD = new WeakSet(); // userData 는 .clone() 때 복사되므로 따로 둠
export function registerLabel(sprite) {
  if (DEAD.has(sprite)) return sprite;
  LABELS.add(sprite);
  if (!TRACKED.has(sprite)) {
    TRACKED.add(sprite);
    sprite.addEventListener?.('removed', () => LABELS.delete(sprite));
    sprite.addEventListener?.('added', () => { if (!DEAD.has(sprite)) LABELS.add(sprite); });
  }
  return sprite;
}

/** 겹칠 때 가장 먼저 자리를 잡는 이름표 (내 캐릭터). npcs.js 가 매 프레임 알려 줌 */
let HERO = null;
export function setHeroLabel(sprite) { HERO = sprite || null; }

/**
 * 글꼴 조각(한글 서브셋)을 아직 안 받았으면 받은 뒤 cb 실행 → 캔버스 글자를 다시 그리게 함.
 * 이미 받았거나 확인할 수 없는 환경이면 아무것도 하지 않음. 다시 그리기를 예약했으면 true
 * (미리 알 수 없는 글자: 다른 플레이어 이름·말풍선·동물 이름이 대체 글꼴로 굳지 않게)
 */
export function whenFontReady(font, text, cb) {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (!fonts?.check || !fonts.load) return false;
  try { if (fonts.check(font, text)) return false; } catch { return false; }
  Promise.resolve(fonts.load(font, text)).then(() => cb(), () => {});
  return true;
}

/** 배경이 투명한 글자 (감정 아이콘·떠오르는 +코인 글자) */
const clearBg = (bg) => /^transparent$|rgba\([^)]*,\s*0(\.0+)?\s*\)$/.test(String(bg).trim());
/** 글자·숫자가 있으면 테두리 (이모지만 있으면 그림자만: 컬러 이모지 글꼴은 테두리가 안 그려지거나 상자로 그려짐) */
const hasLetters = (t) => /[\p{L}\p{N}+\-]/u.test(t);

/**
 * 캔버스 텍스트 스프라이트 (이름표 / 말풍선)
 * icon: 자체 아이콘 이름 (icons.svg) — 글 왼쪽에 그림, 그림이 늦게 읽히면 읽힌 뒤 다시 그림
 * 오래된 기기에 없는 새 이모지(🪱·🫏 등)는 옛 이모지로 바꿔 그림 (fixEmoji)
 */
export function makeLabel(text, { color = '#ffffff', bg = 'rgba(35,25,22,0.75)', size = 42, scale = 0.0055, icon = null } = {}) {
  text = fixEmoji(text);
  const font = `${size}px ${FAMILY}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const clear = clearBg(bg);
  let tex = null, sprite = null, dead = false;
  const isz = Math.round(size * 1.05), igap = icon ? Math.round(size * 0.22) : 0;
  const bmp = icon ? icoBitmap(icon, isz * 2, () => { if (!dead) draw(); }) : null;
  const iw = icon ? isz + igap : 0; // 아이콘 자리 (그림이 아직이어도 미리 비워 둠 → 읽힌 뒤 크기가 안 바뀜)
  const draw = () => {
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(text).width);
    const w = tw + 40 + iw;
    const h = size + 28;
    if (canvas.width !== w || canvas.height !== h) {
      tex?.dispose(); // 크기가 바뀌면 GPU 텍스처를 새로 잡아야 함 (크기 고정 저장)
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.font = font; // 캔버스 크기를 바꾸면 그리기 상태가 초기화됨
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    if (!clear) {
      ctx.fillStyle = bg;
      roundRect(ctx, 0, 0, w, h, 16);
      ctx.fill();
    } else {
      // 밝은 풀밭·하늘 위에서도 읽히게: 짙은 갈색 테두리 + 부드러운 그림자
      ctx.shadowColor = 'rgba(52,30,14,0.55)';
      ctx.shadowBlur = Math.round(size * 0.12);
      ctx.shadowOffsetY = Math.round(size * 0.04);
      if (hasLetters(text)) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(4, Math.round(size * 0.13));
        ctx.strokeStyle = '#4a2c18';
        ctx.strokeText?.(text, w / 2 + iw / 2, h / 2 + 2);
        ctx.shadowColor = 'rgba(0,0,0,0)';
      }
    }
    const tx = w / 2 + iw / 2;
    if (bmp?.ready) ctx.drawImage(bmp.img, tx - tw / 2 - iw, (h - isz) / 2, isz, isz);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, h / 2 + 2);
    ctx.shadowColor = 'rgba(0,0,0,0)';
    sprite?.scale.set(w * scale, h * scale, 1);
    if (tex) tex.needsUpdate = true;
  };
  draw();
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 글자는 화면 색 그대로: 톤 매핑·안개를 받지 않고, 깊이도 쓰지 않음 (뒤 물체·주변광 차폐에 상자 자국을 남기지 않게)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  sprite = new THREE.Sprite(mat);
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sprite.renderOrder = 999;
  sprite.userData.tag = !clear; // 배경 있는 이름표만 겹침 정리 대상
  sprite.userData.dispose = () => { dead = true; DEAD.add(sprite); LABELS.delete(sprite); tex.dispose(); mat.dispose(); };
  registerLabel(sprite);
  whenFontReady(font, text, () => { if (!dead) draw(); }); // 한글 조각이 늦게 오면 받은 뒤 다시 그림
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 지금 화면에 그릴 글자 스프라이트: 자신과 모든 조상이 보이고, 맨 위가 root(월드 장면)인 것 */
export function visibleLabels(root, out = []) {
  out.length = 0;
  for (const s of LABELS) {
    let o = s, top = s;
    for (; o; o = o.parent) { if (!o.visible) break; top = o; }
    if (!o && top === root) out.push(s);
  }
  return out;
}

/** 겹쳐 흐려질 때 불투명도 배율, 바뀌는 빠르기(초), 겹침 판정 여유(px): 또렷한 것은 2px 넘게 겹쳐야 흐려지고, 흐린 것은 4px 떨어져야 또렷 */
export const LABEL_FADE = { mul: 0.3, tau: 0.05, enter: 2, leave: 4 };

/**
 * 겹침 정리 (자리는 옮기지 않고 흐리게만): 우선순위(내 이름표 → 카메라에 가까운 순) 대로 자리를 잡고,
 * 이미 잡힌 자리에 겹치면 fade = true. 같은 캐릭터의 이름표·말풍선·아이콘끼리는 비교하지 않음 (group)
 * rects: [{ x0, y0, x1, y1, pri, depth, group, tag, fade }] (px) → 같은 배열 (fade 채움)
 */
const _order = [], _placed = [];
const byPri = (a, b) => b.pri - a.pri || a.depth - b.depth;
export function overlapFade(rects, { enter = LABEL_FADE.enter, leave = LABEL_FADE.leave } = {}) {
  // 매 프레임 도는 것이라 새 배열을 만들지 않음 (저사양 폰 가비지 줄이기)
  const order = _order, placed = _placed;
  order.length = 0; placed.length = 0;
  for (const r of rects) { if (r.tag) order.push(r); else r.fade = false; }
  order.sort(byPri);
  for (const r of order) {
    const pad = r.fade ? leave : -enter;
    let hit = false;
    for (const p of placed) if (p.group !== r.group && r.x0 - pad < p.x1 && r.x1 + pad > p.x0 && r.y0 - pad < p.y1 && r.y1 + pad > p.y0) { hit = true; break; }
    r.fade = hit;
    if (!hit) placed.push(r);
  }
  order.length = 0; placed.length = 0;
  return rects;
}

const _c = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
/** 스프라이트의 화면 사각형(px, 위가 0). 카메라 뒤면 null. out 을 주면 그 객체에 채움 */
export function labelRect(sprite, camera, W, H, out = {}) {
  const e = sprite.matrixWorld.elements;
  _c.set(e[12], e[13], e[14]).applyMatrix4(camera.matrixWorldInverse);
  if (_c.z > -(camera.near || 0.1)) return null;
  _s.setFromMatrixScale(sprite.matrixWorld);
  const hx = _s.x / 2, hy = _s.y / 2;
  _v.set(_c.x - hx, _c.y - hy, _c.z).applyMatrix4(camera.projectionMatrix);
  const x0 = (_v.x + 1) * W / 2, y1 = (1 - _v.y) * H / 2;
  _v.set(_c.x + hx, _c.y + hy, _c.z).applyMatrix4(camera.projectionMatrix);
  out.x0 = x0; out.x1 = (_v.x + 1) * W / 2; out.y0 = (1 - _v.y) * H / 2; out.y1 = y1; out.depth = -_c.z;
  return out;
}

/**
 * 가림막: 건물처럼 큰 고정 물체의 상자 [{ x, z, hx, hz, h, y0? }] (world.placed 와 같은 모양, 바닥 y0(없으면 0) ~ 그 위 높이 h).
 * 카메라→이름표 선이 이 상자를 지나면 그 이름표를 흐리게 (건물 뒤 주민 이름표가 건물 위에 떠 보이지 않게). npcs.js 가 한 번 알려 줌
 */
let OCCLUDERS = [];
export function setLabelOccluders(list) {
  OCCLUDERS = (list || []).filter((o) => o.collide !== false && o.h > 2 && Math.max(o.hx, o.hz) > 1.75)
    .map((o) => ({ x0: o.x - o.hx + 0.2, x1: o.x + o.hx - 0.2, z0: o.z - o.hz + 0.2, z1: o.z + o.hz - 0.2, y0: o.y0 || 0, h: (o.y0 || 0) + o.h * 0.92 }));
}
/** 가림막에 가려 흐려질 때 불투명도 배율, 다시 재는 간격(초) */
export const LABEL_OCC = { mul: 0.35, every: 0.2 };

/** 선분 (ox,oy,oz)→(tx,ty,tz) 가 끝 3% 앞에서 상자를 지나나 (시작점이 상자 안이면 아님: 집 안에서 보는 화면) */
export function segHitsBox(ox, oy, oz, tx, ty, tz, b) {
  const y0 = b.y0 || 0;
  if (ox > b.x0 && ox < b.x1 && oz > b.z0 && oz < b.z1 && oy < b.h && oy > y0) return false;
  let t0 = 0, t1 = 0.97;
  const d = [tx - ox, ty - oy, tz - oz], o = [ox, oy, oz], lo = [b.x0, y0, b.z0], hi = [b.x1, b.h, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return false; continue; }
    let a = (lo[i] - o[i]) / d[i], z = (hi[i] - o[i]) / d[i];
    if (a > z) { const t = a; a = z; z = t; }
    if (a > t0) t0 = a;
    if (z < t1) t1 = z;
    if (t0 > t1) return false;
  }
  return true;
}
let _occT = 0;
/** 이름표마다 가림 여부(userData.occ)를 다시 잼 (내 이름표는 빼고) */
function updateOcclusion(shown, camera) {
  const p = camera.matrixWorld.elements, ox = p[12], oy = p[13], oz = p[14];
  for (const s of shown) {
    const u = s.userData;
    if (s === HERO || !OCCLUDERS.length) { u.occ = false; continue; }
    const e = s.matrixWorld.elements;
    let hit = false;
    for (const b of OCCLUDERS) if (segHitsBox(ox, oy, oz, e[12], e[13], e[14], b)) { hit = true; break; }
    u.occ = hit;
  }
}

/**
 * 화면에 보이는 이름표들의 흐림 배율(userData.fadeMul)을 맞춤: 다른 이름표(반려견·주민·다른 접속자)가 내 이름표나 더 가까운 이름표에
 * 겹치면 150ms 동안 0.3 으로, 비키면 다시 1. 내 이름표가 이미 흐리면(주민 뒤를 가릴 때, npcs.js) 자리를 잡지 않음.
 * 건물 같은 큰 고정 물체 뒤에 있는 이름표는 0.35 (0.2초마다 잼)
 */
const _rects = [], _pool = [];
export function declutterLabels(shown, camera, W, H, dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) / LABEL_FADE.tau), rects = _rects;
  rects.length = 0;
  camera.updateMatrixWorld?.();
  if ((_occT -= Math.max(0, dt)) <= 0) { _occT = LABEL_OCC.every; updateOcclusion(shown, camera); }
  for (const s of shown) {
    // 거의 투명한 이름표(거리에 따라 사라지는 중)는 자리를 잡지 않음: 안 보이는 것이 보이는 이름표를 흐리게 하지 않게
    const u = s.userData, op = s.material?.opacity ?? 1;
    const r = u.tag && (s === HERO || op >= 0.15) ? labelRect(s, camera, W, H, _pool[rects.length] ||= {}) : null;
    if (r) {
      const hero = s === HERO;
      r.s = s; r.tag = !(hero && (s.material.opacity ?? 1) < 0.6); r.pri = hero ? 1 : 0; r.group = s.parent; r.fade = !!u.faded;
      rects.push(r);
    } else u.faded = false;
  }
  overlapFade(rects);
  for (const r of rects) { r.s.userData.faded = r.fade && r.s !== HERO; r.s = null; r.group = null; }
  rects.length = 0;
  for (const s of shown) {
    const u = s.userData, want = Math.min(u.faded ? LABEL_FADE.mul : 1, u.occ ? LABEL_OCC.mul : 1), m = u.fadeMul ?? 1;
    u.fadeMul = Math.abs(want - m) < 0.005 ? want : m + (want - m) * k;
  }
}

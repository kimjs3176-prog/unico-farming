import * as THREE from 'three';

const FAMILY = `'Unico Coin', Jua, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

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

/** 캔버스 텍스트 스프라이트 (이름표 / 말풍선) */
export function makeLabel(text, { color = '#ffffff', bg = 'rgba(35,25,22,0.75)', size = 42, scale = 0.0055 } = {}) {
  const font = `${size}px ${FAMILY}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let tex = null, sprite = null, dead = false;
  const draw = () => {
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    const h = size + 28;
    if (canvas.width !== w || canvas.height !== h) {
      tex?.dispose(); // 크기가 바뀌면 GPU 텍스처를 새로 잡아야 함 (크기 고정 저장)
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.font = font; // 캔버스 크기를 바꾸면 그리기 상태가 초기화됨
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h, 16);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2 + 2);
    sprite?.scale.set(w * scale, h * scale, 1);
    if (tex) tex.needsUpdate = true;
  };
  draw();
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  sprite = new THREE.Sprite(mat);
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sprite.renderOrder = 999;
  sprite.userData.dispose = () => { dead = true; tex.dispose(); mat.dispose(); };
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

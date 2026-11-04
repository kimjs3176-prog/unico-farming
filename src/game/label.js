import * as THREE from 'three';

/** 캔버스 텍스트 스프라이트 (이름표 / 말풍선) */
export function makeLabel(text, { color = '#ffffff', bg = 'rgba(35,25,22,0.75)', size = 42, scale = 0.0055 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${size}px 'Unico Coin', Jua, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  const h = size + 28;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${size}px 'Unico Coin', Jua, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, w, h, 16);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.renderOrder = 999;
  sprite.userData.dispose = () => { tex.dispose(); mat.dispose(); };
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

import { ramp } from './pxl.js';

/**
 * 도트 팔레트 — 재질마다 어두움 → 밝음 램프.
 * 그림자 쪽은 차갑게(파랑·보라 쪽), 빛 쪽은 따뜻하게(노랑 쪽) 색상을 살짝 돌려 HD-2D 풍의 부드러운 빛을 냄
 */
let done = false;
export function definePalette() {
  if (done) return;
  done = true;
  ramp('ink', ['#140f22', '#2a2140']);
  ramp('white', ['#4e4c7a', '#7f83b4', '#b6bde0', '#e4e9f7', '#ffffff']);
  ramp('mane', ['#0d3442', '#145e68', '#1f8b88', '#36b9a4', '#7fe2c8']);
  ramp('gold', ['#5e2f10', '#a6621a', '#dc9a34', '#f7cf62', '#fff0ae']);
  ramp('band', ['#6e2216', '#bc4a26', '#ef7a38', '#ffab6a']);
  ramp('pink', ['#6e2a44', '#b45474', '#e68ca4', '#ffc4cf']);
  ramp('eye', ['#0f0a1c', '#2a2146', '#4a3e76']);
  ramp('leaf', ['#123326', '#235a30', '#3f8f3a', '#7cc04a', '#c8ea80']);
  ramp('scarf', ['#4e1222', '#9a2434', '#d8443e', '#ff8670']);
  ramp('apron', ['#5a2a10', '#a8541c', '#e8862e', '#ffbf6a']);
  ramp('purple', ['#24163e', '#432a6e', '#6c4aa6', '#9c7ad6', '#d2b8f6']);
  ramp('silver', ['#3c3a4e', '#686a80', '#9a9db0', '#cfd2dc', '#f4f5f8']);
  ramp('rose', ['#5e1c3e', '#a23a68', '#de6a98', '#ffa6c6', '#ffe0ea']);
  ramp('glass', ['#1e2a40', '#4a6a8c', '#a8d8f0', '#ffffff']);

  // 지형
  ramp('grass', ['#173d30', '#24593a', '#357a40', '#4e9846', '#73b652', '#a6d468']);
  ramp('path', ['#3e2820', '#6a4532', '#956a46', '#bd9462', '#dcbd8a', '#f2dcb0']);
  ramp('soil', ['#21130e', '#3d2418', '#5c3824', '#7d5032', '#9c6a44']);
  ramp('water', ['#0b2240', '#123b6a', '#1a5c98', '#2d84bc', '#62b6de', '#c8eefc']);
  ramp('sand', ['#6a5034', '#a6845a', '#d2b47e', '#efd9a6', '#fff2d0']);

  // 재료
  ramp('wood', ['#2a1812', '#4f2d1c', '#7c4b2c', '#a97142', '#d29e62', '#f0c98a']);
  ramp('bark', ['#1e110d', '#3a2116', '#5e3620', '#84532e']);
  ramp('stone', ['#25243a', '#43445a', '#686c84', '#9399ac', '#c4c9d4', '#eceef2']);
  ramp('roof', ['#38101e', '#6c1e30', '#a2333a', '#d25e4c', '#f2967a']);
  ramp('roofb', ['#121a3a', '#1f3068', '#304f96', '#4c7cc0', '#86b4e4']);
  ramp('roofg', ['#122a22', '#1e4a36', '#2f6e48', '#4c965a', '#84c27a']);
  ramp('wall', ['#4e3e48', '#8a7268', '#c2a88a', '#e8d2ae', '#fff1d6']);
  ramp('barn', ['#3a0f16', '#6e1c24', '#a42e30', '#d0503e', '#ec8462']);
  ramp('iron', ['#16141e', '#2e2c3a', '#4c4a5c', '#76768a']);
  ramp('cloth', ['#8a2a2a', '#d24a3e', '#f6f0e4', '#ffffff']);
  ramp('hay', ['#6a4816', '#a8781e', '#d8aa3a', '#f4d46a', '#fff0a8']);

  // 식물
  ramp('fol', ['#0c2622', '#174430', '#256638', '#3d8c3e', '#69b04a', '#a6d466']);
  ramp('pine', ['#0a1e26', '#133634', '#1d5444', '#2e7452', '#4f9a5e']);
  ramp('autumn', ['#3a140e', '#7a2a16', '#c0501e', '#ec8a2e', '#ffc45a']);
  ramp('carrot', ['#621e0e', '#ae421a', '#ea7428', '#ffa654']);
  ramp('cabbage', ['#1a4228', '#357236', '#62a24c', '#9ed06c', '#daf2aa']);
  ramp('tomato', ['#4e0e18', '#981e26', '#dc3a32', '#ff7a5a', '#ffc2a6']);
  ramp('corn', ['#704c0e', '#b88c1c', '#eac43a', '#fff07e', '#fffbd2']);
  ramp('flowp', ['#36184e', '#62348c', '#9a64c8', '#d2a6ee']);
  ramp('flowy', ['#7a4a0c', '#d6941c', '#fcd040', '#fff4a0']);
  ramp('floww', ['#7c7a9c', '#c6c8e0', '#ffffff']);
  ramp('flowr', ['#5a1020', '#b02a3c', '#ee5a62', '#ffa0a0']);

  // 동물
  ramp('shiba', ['#4e220e', '#90421a', '#cc7230', '#eca254', '#ffd49c']);
  ramp('cream', ['#6e5a4a', '#b49c82', '#e2d2b8', '#fff6e4']);
  ramp('patch', ['#120f18', '#24202e', '#3c3848']);
  ramp('wool', ['#5c546c', '#968ca6', '#cec6d6', '#f2eef2', '#ffffff']);
  ramp('face', ['#1c1620', '#3a3040', '#5a4c5c']);
  ramp('hoof', ['#2a1e1c', '#4c3a34', '#6c5a50']);

  // 빛나는 재질 (밤 조명·블룸)
  ramp('lamp', ['#8a4a10', '#f0a030', '#ffd870', '#fffbe0'], { glow: true });
  ramp('win', ['#6a3a12', '#d8902a', '#ffcc5c', '#fff2b8'], { glow: true });
  ramp('spark', ['#a87a20', '#ffe070', '#ffffff'], { glow: true });
  ramp('fly', ['#5a8a10', '#c8f050', '#f8ffc0'], { glow: true });
}

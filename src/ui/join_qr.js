import qrcode from 'qrcode-generator';

/**
 * 접속 QR: 지금 열려 있는 게임 주소(쿼리 제외)를 QR 로 그려 휴대폰으로 바로 들어오게
 * - qrcode-generator (MIT, 의존성 없음)를 빌드에 함께 묶음 → 외부 QR 서비스에 주소를 보내지 않음
 * - 캔버스에 직접 칸을 칠함 (innerHTML 없이)
 */
export function joinUrl() {
  return `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
}

/**
 * @param ecc 오류 정정 단계 ('M' 기본, 긴 농장 옮기기 주소는 'L' 로 칸을 줄임)
 * @param label 읽어 주기 글 (긴 주소를 그대로 읽지 않게)
 */
export function joinQrCanvas(url = joinUrl(), size = 132, ecc = 'M', label = `접속 QR 코드: ${url}`) {
  const qr = qrcode(0, ecc);
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount(), margin = 2, cell = Math.max(2, Math.floor(size / (n + margin * 2)));
  const px = cell * (n + margin * 2), dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = px * dpr;
  c.style.width = c.style.height = `${px}px`;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, px, px);
  g.fillStyle = '#231916';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + margin) * cell, (r + margin) * cell, cell, cell);
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', label);
  return c;
}

/** QR + 안내 문구 묶음 */
export function joinQrBox(caption = '📱 휴대폰으로 찍으면 바로 접속', size = 132) {
  const box = document.createElement('div');
  box.className = 'join-qr';
  const url = joinUrl();
  box.append(joinQrCanvas(url, size));
  const t = document.createElement('div');
  t.className = 'join-qr-txt';
  const b = document.createElement('b'); b.textContent = caption;
  const s = document.createElement('small'); s.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  t.append(b, s);
  box.append(t);
  return box;
}

/**
 * 휴대폰으로 이어하기 QR: 주소 뒤 '#farm=<농장 코드>' (# 뒤는 서버·기록·Referer 로 가지 않음)
 * 칸이 작아도 찍히게 오류 정정 L, 260~320px
 */
export function farmQrCanvas(code, size = 300) {
  return joinQrCanvas(`${joinUrl()}#farm=${code}`, Math.max(260, Math.min(320, size)), 'L', '휴대폰으로 이어하기 QR 코드');
}

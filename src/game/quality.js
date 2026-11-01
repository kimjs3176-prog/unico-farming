/** 기기별 그래픽 품질 프리셋 (?quality=low|high 로 강제 가능) */
export function pickQuality() {
  const q = new URLSearchParams(location.search).get('quality');
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const level = q || (mobile ? 'low' : 'high');
  return level === 'low'
    ? { level, grass: 3500, shadowMap: 1024, bloom: false, smaa: false, ao: false, tiltShift: false, pixelRatio: Math.min(devicePixelRatio, 1.5) }
    : { level, grass: 9000, shadowMap: 3072, bloom: true, smaa: true, ao: true, tiltShift: true, pixelRatio: Math.min(devicePixelRatio, 2) };
}

/**
 * 코스튬 아이콘: 그 옷을 입은 두 발 유니코의 상반신 (게임 캐릭터와 같은 메시·옷 모양)
 *  - 굽기 전에 prepareBust() 로 캐릭터 메시를 한 번 받음 (브라우저에서만)
 *  - userData.clipFrac: 몸 높이의 이 비율 아래는 자르고 칸 맞춤에서도 뺌 (허리 위 머리·가슴이 칸을 채우게, 월드 좌표)
 */
let ready = null;
export function prepareBust(base = '/models/') {
  return (ready ||= (async () => {
    const { loadUnicoMesh } = await import('../unico.js');
    await loadUnicoMesh(base + 'unico_biped.bin', 'biped');
  })());
}

export const BUST_CLIP_FRAC = 0.2;

export async function costumeBust(id) {
  const [{ Unico }, { COSTUME }] = await Promise.all([import('../unico.js'), import('../sim/costume.js')]);
  if (!COSTUME[id]) return null;
  const u = new Unico(null, { rig: 'biped', outfit: { costume: id, sprout: false } });
  u.setOutfit({ costume: id, sprout: false });
  if (u.label) u.label.visible = false;
  const g = u.group;
  g.rotation.y = 0.3; // 몸을 살짝 돌려 3/4
  g.userData.clipFrac = BUST_CLIP_FRAC;
  g.userData.dispose = () => u.dispose?.();
  return g;
}

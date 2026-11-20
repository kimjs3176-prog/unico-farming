/**
 * 코스튬 아이콘: 그 옷을 입은 두 발 유니코의 상반신 (게임 캐릭터와 같은 메시·옷 모양)
 *  - 굽기 전에 prepareBust() 로 캐릭터 메시를 한 번 받음 (브라우저에서만)
 *  - userData.clipY: 이 높이 아래는 자르고 칸 맞춤에서도 뺌 (무릎 위까지만 보이게)
 */
let ready = null;
export function prepareBust(base = '/models/') {
  return (ready ||= (async () => {
    const { loadUnicoMesh } = await import('../unico.js');
    await loadUnicoMesh(base + 'unico_biped.bin', 'biped');
  })());
}

export const BUST_CLIP_Y = 0.3;

export async function costumeBust(id) {
  const [{ Unico }, { COSTUME }] = await Promise.all([import('../unico.js'), import('../sim/costume.js')]);
  if (!COSTUME[id]) return null;
  const u = new Unico(null, { rig: 'biped', outfit: { costume: id, sprout: false } });
  u.setOutfit({ costume: id, sprout: false });
  if (u.label) u.label.visible = false;
  const g = u.group;
  g.rotation.y = 0.3; // 몸을 살짝 돌려 3/4
  g.userData.clipY = BUST_CLIP_Y;
  g.userData.dispose = () => u.dispose?.();
  return g;
}

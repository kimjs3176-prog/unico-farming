import { DECOR, DECOR_BY_ID } from '../sim/decor.js';
import { grainSack } from './goods.js';

/**
 * 꾸미기 소품 아이콘: 게임에서 놓는 모델 그대로 (직접 만든 모델 · CC0 묶음, docs/ASSETS_CC0.md)
 *  - 굽기 전에 prepareDecor() 로 모델을 한 번 받음 (브라우저에서만)
 *  - 게임용 재질 손질(계절 잎색·카메라 구멍 등)은 화면 상태에 따라 모양이 잘려서, 받은 원래 재질 그대로 씀
 */
const models = new Map();
export async function prepareDecor() {
  if (models.size) return;
  const { Assets, ENV_MODELS, PACK_MODELS } = await import('../assets.js');
  const a = new Assets();
  const want = new Set(DECOR.map((d) => d.model));
  // 한 파일짜리 모델
  await Promise.all([...want].filter((n) => ENV_MODELS.includes(n)).map(async (n) => {
    try { models.set(n, (await a.loadGlb(n)).scene); } catch { /* 없으면 그 칸만 빠짐 */ }
  }));
  // 묶음 안의 노드
  await Promise.all(PACK_MODELS.map(async (p) => {
    try {
      const gltf = await a.loadGlb(p);
      for (const node of [...gltf.scene.children]) if (want.has(node.name) && !models.has(node.name)) { node.position.set(0, 0, 0); models.set(node.name, node); }
    } catch { /* 없으면 그 칸만 빠짐 */ }
  }));
}

// 누운 곡식 자루 모델은 위에서 보면 방석처럼 보여서, 아이콘만 묶은 자루(아이템 아이콘과 같은 모양)로
const OWN = { sack: () => grainSack() };
export function decorIcon(id) {
  if (OWN[id]) return OWN[id]();
  const d = DECOR_BY_ID[id];
  const src = d && models.get(d.model);
  if (!src) return null;
  const obj = src.clone(true);
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, -0.45, 0);
  obj.scale.multiplyScalar(d.scale);
  return obj;
}

import * as THREE from 'three';
import { ITEMS } from './sim/items.js';

/** 물고기 종류별 색·몸 비율 (낚은 물고기 들어 보이기, 호수에서 튀어 오르는 물고기) */
const LOOK = {
  fish_crucian: { c: 0x8a8f5a, belly: 0xd9d2a0, h: 0.42 },
  fish_loach: { c: 0x8b6b45, belly: 0xc9b089, h: 0.22 },
  fish_minnow: { c: 0xb7c3c8, belly: 0xeef2f2, h: 0.3 },
  fish_carp: { c: 0xc9a24a, belly: 0xf0dca0, h: 0.38 },
  fish_catfish: { c: 0x4b4f4a, belly: 0x9a9a8a, h: 0.3, whisker: true },
  fish_goldfish: { c: 0xf2b233, belly: 0xffe08a, h: 0.4, shine: true },
  fish_smelt: { c: 0xcfe3ea, belly: 0xffffff, h: 0.22 },
  fish_trout: { c: 0x9fb09a, belly: 0xf3c9c2, h: 0.3, stripe: 0xe58f8f },
  fish_mandarin: { c: 0xb59a4a, belly: 0xe8dcb0, h: 0.36, stripe: 0x5a4a22 },
  fish_masu: { c: 0x8fa6b5, belly: 0xf2f2ee, h: 0.3, stripe: 0x6b7f9a },
  fish_snakehead: { c: 0x3d4635, belly: 0x9aa088, h: 0.26 },
  fish_eel: { c: 0x4a4a3a, belly: 0xb8b48a, h: 0.12 },
  fish_sturgeon: { c: 0x6b7580, belly: 0xc9ced2, h: 0.2, snout: true },
};

const geoCache = {};
const unitGeo = (k) => (geoCache[k] ||= {
  body: new THREE.SphereGeometry(0.5, 18, 12),
  tail: new THREE.ConeGeometry(0.28, 0.32, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.18),
  fin: new THREE.ConeGeometry(0.14, 0.22, 3).scale(1, 1, 0.15),
  eye: new THREE.SphereGeometry(0.045, 8, 6),
});

/**
 * 물고기 메시 (머리 = +x). len: 몸길이(m)
 */
export function makeFish(id, len = 0.4) {
  const L = LOOK[id] || LOOK.fish_crucian;
  const G = unitGeo('base');
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: L.c, roughness: L.shine ? 0.25 : 0.45, metalness: L.shine ? 0.45 : 0.1, emissive: L.shine ? 0x553300 : 0x000000, emissiveIntensity: 0.4 });
  const belly = new THREE.MeshStandardMaterial({ color: L.belly, roughness: 0.5 });
  const body = new THREE.Mesh(G.body, mat);
  body.scale.set(1, L.h * 1.6, L.h * 0.9);
  const under = new THREE.Mesh(G.body, belly);
  under.scale.set(0.92, L.h * 1.2, L.h * 0.82);
  under.position.y = -L.h * 0.25;
  const tail = new THREE.Mesh(G.tail, mat);
  tail.position.x = -0.6;
  tail.scale.set(1, L.h * 2.2, 1);
  const dorsal = new THREE.Mesh(G.fin, mat);
  dorsal.position.set(-0.05, L.h * 0.75, 0);
  g.add(body, under, tail, dorsal);
  if (L.stripe) {
    const st = new THREE.Mesh(G.body, new THREE.MeshStandardMaterial({ color: L.stripe, roughness: 0.5 }));
    st.scale.set(0.9, L.h * 0.35, L.h * 0.92);
    g.add(st);
  }
  if (L.snout) { const sn = new THREE.Mesh(G.fin, mat); sn.rotation.z = -Math.PI / 2; sn.scale.set(1.2, 1.8, 3); sn.position.x = 0.55; g.add(sn); }
  for (const z of [-1, 1]) {
    const eye = new THREE.Mesh(G.eye, new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(0.36, L.h * 0.15, z * L.h * 0.38);
    g.add(eye);
    if (L.whisker) { const w = new THREE.Mesh(G.fin, mat); w.rotation.z = -Math.PI / 2; w.scale.set(0.25, 1.4, 1); w.position.set(0.55, -0.02, z * 0.1); g.add(w); }
  }
  g.scale.setScalar(len);
  g.userData.tail = tail;
  g.userData.dispose = () => { mat.dispose(); belly.dispose(); };
  return g;
}

/** 화면에 들어 보일 몸길이(m): 실제 cm 를 보기 좋게 압축 */
export const showLength = (id, size) => Math.min(1.5, Math.max(0.16, (size / 100) * (ITEMS[id]?.legend ? 0.8 : 1.1)));

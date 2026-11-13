import * as THREE from 'three';

/**
 * 코드로 만든 마을 탈것 모델 (트랙터는 GLB, 자전거·농장 카트는 여기서)
 * 진행 방향 +Z, 바닥 y=0. 바퀴는 이름이 Wheel… 인 묶음(rotation.x 로 굴림), 앞바퀴 조향은 Steer… 묶음(rotation.y)
 */
const mats = new Map();
const mat = (color, o = {}) => {
  const k = `${color}|${o.rough ?? 0.7}|${o.metal ?? 0}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0 }));
  return mats.get(k);
};
const C = { teal: 0x30b6aa, tealD: 0x1f8a80, cream: 0xf6efe3, rubber: 0x2b2b30, steel: 0xb9c0c9, brown: 0x7a4b2a, wicker: 0xc89a5a, red: 0xd9534a, yellow: 0xffd84a, leaf: 0x6dbb4f, carrot: 0xf28c28 };

function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** a→b 사이 둥근 관 */
function tube(a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), m);
  o.position.copy(A).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}

/** 자전거 바퀴: 타이어 + 테 + 살 (축 = X) */
function bikeWheel(name, z) {
  const w = new THREE.Group();
  w.name = name;
  w.position.set(0, 0.36, z);
  const tire = mesh(new THREE.TorusGeometry(0.32, 0.045, 10, 28), mat(C.rubber, { rough: 0.9 }));
  tire.rotation.y = Math.PI / 2;
  const rim = mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 28), mat(C.steel, { rough: 0.35, metal: 0.6 }));
  rim.rotation.y = Math.PI / 2;
  w.add(tire, rim);
  for (let i = 0; i < 4; i++) { const s = mesh(new THREE.BoxGeometry(0.012, 0.56, 0.012), mat(C.steel, { rough: 0.35, metal: 0.6 })); s.rotation.x = (i * Math.PI) / 4; s.castShadow = false; w.add(s); }
  w.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10).rotateZ(Math.PI / 2), mat(C.steel, { metal: 0.5 })));
  return w;
}

/** 민트색 마을 자전거 (앞 바구니에 당근·꽃) */
export function makeBike() {
  const g = new THREE.Group();
  g.name = 'bike';
  const frame = mat(C.teal, { rough: 0.45, metal: 0.15 }), dark = mat(C.tealD, { rough: 0.5 });
  const rearHub = [0, 0.36, -0.56], frontHub = [0, 0.36, 0.56], bb = [0, 0.4, -0.04], seatTop = [0, 0.9, -0.2], headTop = [0, 0.92, 0.42], headBot = [0, 0.72, 0.46];
  g.add(bikeWheel('WheelB', -0.56));
  g.add(tube(rearHub, seatTop, 0.025, frame), tube(rearHub, bb, 0.028, frame), tube(bb, seatTop, 0.035, frame), tube(bb, headBot, 0.04, frame), tube(seatTop, headTop, 0.032, frame));
  // 안장
  const seat = mesh(new THREE.BoxGeometry(0.17, 0.06, 0.3), mat(C.brown, { rough: 0.8 }), 0, 0.96, -0.22);
  seat.geometry.translate(0, 0, 0);
  g.add(seat, tube([0, 0.9, -0.2], [0, 0.95, -0.21], 0.02, mat(C.steel, { metal: 0.5 })));
  // 페달 (크랭크)
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14).rotateZ(Math.PI / 2), mat(C.steel, { metal: 0.6, rough: 0.4 }), 0, 0.4, -0.04));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.025, 0.06), mat(C.rubber), s * 0.1, 0.4 - s * 0.12, -0.04));
  // 뒤 짐받이·흙받이
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.025, 0.36), dark, 0, 0.72, -0.5));
  const fender = mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 16, Math.PI * 0.6), dark, 0, 0.36, -0.56);
  fender.rotation.set(0, Math.PI / 2, Math.PI * 0.25);
  g.add(fender);
  // 앞: 조향되는 부분 (포크·핸들·바구니·앞바퀴)
  const steer = new THREE.Group();
  steer.name = 'SteerF';
  steer.position.set(0, 0, 0.46);
  steer.add(tube([0, 0.72, 0], [0, 0.36, 0.1], 0.025, frame), tube([0, 0.72, 0], [0, 1.02, -0.04], 0.026, frame));
  steer.add(tube([-0.27, 1.04, -0.08], [0.27, 1.04, -0.08], 0.02, mat(C.steel, { metal: 0.6, rough: 0.35 })));
  for (const s of [-1, 1]) steer.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 10).rotateZ(Math.PI / 2), mat(C.brown), s * 0.26, 1.04, -0.08));
  steer.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(C.yellow, { rough: 0.3 }), 0.17, 1.07, -0.08)); // 따르릉 종
  // 바구니 (등나무) + 당근·잎·꽃
  const basket = new THREE.Group();
  basket.position.set(0, 0.88, 0.14);
  basket.add(mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), mat(C.wicker, { rough: 0.95 })));
  basket.add(mesh(new THREE.BoxGeometry(0.38, 0.03, 0.28), mat(0xa77a40, { rough: 0.95 }), 0, 0.1, 0));
  for (const [x, z, r] of [[-0.08, 0.02, 0.5], [0.06, -0.04, -0.4]]) {
    const c = mesh(new THREE.ConeGeometry(0.035, 0.2, 8), mat(C.carrot), x, 0.16, z);
    c.rotation.set(Math.PI, 0, r);
    basket.add(c, mesh(new THREE.ConeGeometry(0.04, 0.08, 6), mat(C.leaf), x - Math.sin(r) * 0.12, 0.3, z));
  }
  basket.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(0xf28bb0), 0.12, 0.14, 0.06), mesh(new THREE.SphereGeometry(0.02, 8, 6), mat(C.yellow), 0.12, 0.18, 0.1));
  steer.add(basket);
  const fw = bikeWheel('WheelF', 0.1);
  steer.add(fw);
  g.add(steer);
  return g;
}

/** 자동차 바퀴 (축 = X) */
function carWheel(name, x, z, r = 0.33) {
  const w = new THREE.Group();
  w.name = name;
  w.position.set(x, r, z);
  w.add(mesh(new THREE.CylinderGeometry(r, r, 0.22, 20).rotateZ(Math.PI / 2), mat(C.rubber, { rough: 0.9 })));
  w.add(mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.235, 14).rotateZ(Math.PI / 2), mat(C.cream, { rough: 0.4, metal: 0.2 })));
  const bolt = mesh(new THREE.BoxGeometry(0.24, r * 0.7, 0.05), mat(C.steel, { metal: 0.5 }));
  bolt.castShadow = false;
  w.add(bolt); // 굴러가는 게 보이게
  return w;
}

/** 농장 운반 카트: 2인승 좌석, 지붕, 뒤 짐칸에 상자·양배추 */
export function makeCart() {
  const g = new THREE.Group();
  g.name = 'cart';
  const body = mat(C.cream, { rough: 0.5 }), trim = mat(C.teal, { rough: 0.45, metal: 0.1 }), dark = mat(0x3a3f45, { rough: 0.7 });
  // 바닥 차대 + 앞 보닛
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.22, 2.5), dark, 0, 0.42, 0));
  g.add(mesh(new THREE.BoxGeometry(1.26, 0.42, 0.75), trim, 0, 0.72, 0.85));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), body, 0, 0.96, 0.85));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.08, 12, 8), mat(0xfff3b0, { rough: 0.2 }), s * 0.42, 0.78, 1.23)); // 전조등
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.06), mat(C.steel, { metal: 0.5, rough: 0.4 }), 0, 0.5, 1.27)); // 범퍼
  // 좌석 (2인)
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5), mat(C.brown, { rough: 0.8 }), 0, 0.82, -0.05));
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.12), mat(C.brown, { rough: 0.8 }), 0, 1.1, -0.33));
  // 핸들
  const steer = new THREE.Group();
  steer.name = 'SteerWheel';
  steer.position.set(-0.28, 1.12, 0.38);
  steer.rotation.x = -0.9;
  steer.add(mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 20), dark));
  g.add(steer, tube([-0.28, 0.9, 0.55], [-0.28, 1.1, 0.4], 0.025, dark));
  // 뒤 짐칸 + 짐
  g.add(mesh(new THREE.BoxGeometry(1.26, 0.08, 0.95), body, 0, 0.72, -0.85));
  for (const [x, z, w, d] of [[0, -1.3, 1.26, 0.06], [-0.6, -0.85, 0.06, 0.95], [0.6, -0.85, 0.06, 0.95]]) g.add(mesh(new THREE.BoxGeometry(w, 0.3, d), trim, x, 0.9, z));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.3, 0.36), mat(0xb98a55, { rough: 0.9 }), -0.28, 0.91, -0.8));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.36), mat(C.carrot), -0.28, 1.07, -0.8));
  g.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(0x8fd05e, { rough: 0.8 }), 0.25, 0.92, -0.72), mesh(new THREE.SphereGeometry(0.13, 12, 10), mat(0x6dbb4f, { rough: 0.8 }), 0.3, 0.9, -1.05));
  // 지붕 (줄무늬 차양) + 기둥 4개
  for (const [x, z] of [[-0.58, 0.45], [0.58, 0.45], [-0.58, -0.4], [0.58, -0.4]]) g.add(tube([x, 0.9, z], [x, 1.85, z * 0.95], 0.03, mat(C.steel, { metal: 0.5, rough: 0.4 })));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.28, 0.06, 1.1), mat(i % 2 ? C.cream : C.red, { rough: 0.6 }), -0.56 + i * 0.28, 1.88, 0.02));
  // 바퀴: 앞 두 개는 조향
  for (const [n, x] of [['L', -0.62], ['R', 0.62]]) {
    const s = new THREE.Group();
    s.name = `Steer${n}`;
    s.position.set(x, 0, 0.8);
    const w = carWheel(`WheelF${n}`, 0, 0);
    s.add(w);
    g.add(s, carWheel(`WheelB${n}`, x, -0.8));
  }
  return g;
}

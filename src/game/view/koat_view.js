import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { Unico, PALETTES } from '../unico.js';
import { DIVISIONS, divisionById, StampBook } from '../sim/koat.js';
import { makeLabel } from '../label.js';

/** 간판 텍스처 (캔버스) */
function signTexture(text, sub, bg = '#ffffff', fg = '#231916', w = 1024, h = 192) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${sub ? 78 : 96}px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
  if (sub) { g.font = `600 44px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`; g.globalAlpha = 0.8; g.fillText(sub, w / 2, h * 0.78); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 모델 안 SignBoard 박스 앞면에 글자 판을 붙임 (GLB 에 UV 가 없어 별도 평면) */
function attachSign(model, tex, aspect) {
  const sb = model.getObjectByName('SignBoard');
  if (!sb) return;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sb);
  const size = box.getSize(new THREE.Vector3());
  const wid = Math.max(size.x, size.z), hgt = size.y;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.97, hgt * 0.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const c = box.getCenter(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion);
  plane.position.copy(c).addScaledVector(fwd, (size.x > size.z ? size.z : size.x) / 2 + 0.012);
  plane.quaternion.copy(model.quaternion);
  model.parent.add(plane);
  void aspect;
}

/**
 * KOAT 체험관: 본관(기획운영본부·홍보관) + 본부별 체험 부스 6곳 + 안내데스크 + 스탬프 투어
 */
export class KoatView {
  constructor(game) {
    this.game = game;
    const K = LAYOUT.koat, W = game.world;
    this.book = new StampBook();
    // 본관
    this.hq = W.place('koat_hq', K.hq.x, K.hq.z, 0, 0.85); // 안쪽 부스 앞이 막히지 않게 조금 작게, 뒤로
    attachSign(this.hq, signTexture('한국농업기술진흥원 KOAT', '체험관 · 기획운영본부 · 홍보실', '#ffffff', '#1f6f69', 1536, 192));
    // 입구 표지
    const gateSign = W.place('sign', K.gate.x + 2.2, K.gate.z, 0.15, 1.3, { collide: false });
    const gl = makeLabel('🏢 KOAT 체험관', { color: '#ffffff', bg: 'rgba(36,157,146,0.95)', size: 40 });
    gl.position.set(K.gate.x + 2.2, 2.2, K.gate.z + 0.6);
    W.scene.add(gl);
    void gateSign;
    // 부스
    this.booths = K.booths.map((b) => {
      const d = divisionById(b.id);
      const m = W.place('booth', b.x, b.z, b.rot, 1);
      m.traverse((o) => {
        if (o.isMesh && o.parent?.name === 'RoofTint' || o.name === 'RoofTint') { o.material = o.material.clone(); o.material.color.setHex(d.color); }
      });
      const roof = m.getObjectByName('RoofTint');
      roof?.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setHex(d.color); } });
      attachSign(m, signTexture(`${d.emoji} ${d.name}`, d.game.title, '#ffffff', '#231916'));
      const fwd = new THREE.Vector3(Math.sin(b.rot), 0, Math.cos(b.rot));
      // 부스 담당 유니코 (네 발, 본부 색 갈기)
      PALETTES[`koat_${d.id}`] = { body: 0xffffff, snout: 0xf7e1ec, mane: d.color, maneD: new THREE.Color(d.color).multiplyScalar(0.8).getHex(), hoof: new THREE.Color(d.color).multiplyScalar(0.75).getHex() };
      const npc = new Unico(game.assets, { name: `${d.emoji} ${d.name.replace('본부', '')} 담당`, labelColor: '#231916', labelBg: 'rgba(255,255,255,0.92)', palette: `koat_${d.id}`, outfit: OUTFIT[d.id] || {} });
      npc.group.position.set(b.x - fwd.x * 0.3, 0.16, b.z - fwd.z * 0.3);
      npc.facing = npc.yaw = b.rot;
      W.scene.add(npc.group);
      this.props(d.id, b, fwd);
      return { ...b, d, model: m, npc, front: new THREE.Vector3(b.x + fwd.x * 2.7, 0, b.z + fwd.z * 2.7), fwd, idle: Math.random() * 5 };
    });
    // 안내데스크 유니코 (기획운영본부)
    PALETTES.koat_desk = { body: 0xffffff, snout: 0xf7e1ec, mane: 0x30b6aa, maneD: 0x249d92, hoof: 0x2aa79b };
    this.desk = new Unico(game.assets, { name: '🏢 안내데스크 (기획운영본부)', labelColor: '#ffffff', labelBg: 'rgba(36,157,146,0.95)', palette: 'koat_desk', outfit: { scarf: 'green', sprout: true } });
    this.desk.group.position.set(K.desk.x, 0, K.desk.z);
    this.desk.facing = this.desk.yaw = 0;
    W.scene.add(this.desk.group);
    W.obstacles.push({ x: K.desk.x, z: K.desk.z, r: 0.7 });
    this.t = 0;
  }

  /** 부스 옆 소품 (본부 특징) */
  props(id, b, fwd) {
    const W = this.game.world;
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const at = (s, f) => [b.x + side.x * s + fwd.x * f, b.z + side.z * s + fwd.z * f];
    const put = (name, s, f, scale = 1, rot = 0) => { const [x, z] = at(s, f); return W.place(name, x, z, b.rot + rot, scale, { collide: false, dynamic: true }); };
    switch (id) {
      case 'tech': put('crate', 1.6, 1.0, 0.8); put('planter', -1.5, 1.2, 0.7); break;
      case 'venture': put('barrel', 1.6, 1.0, 0.8); put('crate', -1.6, 1.0, 0.7, 0.4); break;
      case 'seed': put('hay_bale', 1.7, 1.1, 0.6); put('crate', -1.6, 1.0, 0.8); break;
      case 'smart': { const dr = put('drone', 0, 1.2, 0.8); dr.position.y = 2.9; this.drone = dr; put('planter', -1.6, 1.1, 0.7); break; }
      case 'machine': put('tractor', 2.2, 2.4, 0.38, -Math.PI / 2); break;
      case 'env': put('planter', 1.6, 1.1, 0.7); put('rock', -1.6, 1.1, 0.6); break;
    }
  }

  update(dt, playerPos) {
    this.t += dt;
    const cam = this.game.followCam.camera;
    let best = null;
    for (const b of this.booths) {
      const d = Math.hypot(b.front.x - playerPos.x, b.front.z - playerPos.z);
      if (d < 2.4) {
        const st = this.book.stamps[b.d.id] ? ' ✅' : '';
        if (!best || d < best.d) best = { d, label: `${b.d.emoji} ${b.d.name} 체험: ${b.d.game.title}${st}`, key: 'koat', onInteract: () => this.game.ui.openKoatBooth(b.d) };
      }
      // 담당 유니코: 가까이 오면 바라보고, 가끔 손님 맞이 동작
      const np = b.npc.group.position;
      const dn = Math.hypot(np.x - playerPos.x, np.z - playerPos.z);
      b.npc.facing = dn < 6 ? Math.atan2(playerPos.x - np.x, playerPos.z - np.z) : b.rot;
      b.idle += dt;
      if (b.idle > 9) { b.idle = Math.random() * 3; b.npc.playAction(dn < 6 ? 'heart' : 'present', 1.8); }
      b.npc.update(dt, cam);
    }
    if (this.drone) { this.drone.position.y = 2.9 + Math.sin(this.t * 2) * 0.15; this.drone.traverse((o) => { if (/^Rotor/.test(o.name)) o.rotation.y += dt * 40; }); }
    const dp = this.desk.group.position;
    const dd = Math.hypot(dp.x - playerPos.x, dp.z - playerPos.z);
    this.desk.facing = dd < 6 ? Math.atan2(playerPos.x - dp.x, playerPos.z - dp.z) : 0;
    this.desk.update(dt, cam);
    if (dd < 2.4 && (!best || dd < best.d)) best = { d: dd, label: `🏢 KOAT 안내데스크 · 스탬프 ${this.book.count}/${DIVISIONS.length}`, key: 'koat', onInteract: () => this.game.ui.openKoatDesk() };
    return best;
  }

  /** 체험 결과 반영: 스탬프·보상·퀘스트 */
  record(id, score) {
    const g = this.game;
    const r = this.book.record(id, score);
    if (r.passed) { g.economy.earn(50 + Math.round(score / 2)); g.audio.play('win'); g.player.unico.playAction('cheer', 1.6); }
    else { g.audio.play('bump'); g.player.unico.playAction('think', 1.2); }
    if (r.newStamp) { g.onEvent('koatstamp', 1); g.onEvent('koatall', this.book.count); }
    return r;
  }

  toJSON() { return this.book.toJSON(); }
  load(d) { this.book.load(d); }
}

const OUTFIT = {
  tech: { goggles: true, scarf: 'red' },
  venture: { scarf: 'red', sprout: true },
  seed: { hat: 'straw', scarf: 'green' },
  smart: { goggles: true, scarf: 'blue' },
  machine: { hat: 'helmet', scarf: 'green' },
  env: { scarf: 'blue', sprout: true },
};

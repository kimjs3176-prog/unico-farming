import * as THREE from 'three';
import { QUESTS } from './sim/quests.js';
import { LAYOUT } from './world.js';

/** 퀘스트별 목표 위치 (없으면 안내만) */
function targetOf(id, g) {
  const L = LAYOUT;
  const nearestBug = () => {
    const p = g.player.position;
    let best = null, bd = Infinity;
    for (const b of g.nature.bugs) if (b.g.visible) { const d = b.g.position.distanceTo(p); if (d < bd) { bd = d; best = b.g.position; } }
    return best;
  };
  switch (id) {
    case 'till1': case 'plant3': case 'water3': case 'harvest5': return new THREE.Vector3(0, 0, 0);
    case 'sell10': return new THREE.Vector3(L.npcs.merchant.x, 0, L.npcs.merchant.z);
    case 'tractor1': return new THREE.Vector3(g.tractor.vehicle.x, 0, g.tractor.vehicle.z);
    case 'smart1': return new THREE.Vector3(L.sensor.x, 0, L.sensor.z);
    case 'feed3': case 'collect5': return new THREE.Vector3(22, 0, 2);
    case 'rice1': return new THREE.Vector3(g.rice.paddies[0].x, 0, g.rice.paddies[0].z);
    case 'riceharv': return g.economy.count('paddy') ? new THREE.Vector3(L.thresher.x, 0, L.thresher.z) : new THREE.Vector3(g.rice.paddies[0].x, 0, g.rice.paddies[0].z);
    case 'fish1': case 'book10': return new THREE.Vector3(L.dock.x, 0, L.dock.z);
    case 'care5': case 'heart3': return new THREE.Vector3(22, 0, 2);
    case 'buyanimal': return new THREE.Vector3(L.ranchWork.barn.x, 0, L.ranchWork.barn.z);
    case 'rprocess2': return new THREE.Vector3(L.ranchWork.x - 2, 0, L.ranchWork.z);
    case 'rgold1': return new THREE.Vector3(22, 0, 2);
    case 'fert3': return g.economy.count('compost') ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(L.craft.compost.x, 0, L.craft.compost.z);
    case 'star3': case 'giant1': return new THREE.Vector3(0, 0, 0);
    case 'process2': return new THREE.Vector3(L.craft.jars.x, 0, L.craft.jars.z);
    case 'order3': return new THREE.Vector3(L.craft.board.x, 0, L.craft.board.z);
    case 'swim1': return new THREE.Vector3(L.lake.x + 2.5, 0, L.lake.z - 3.5);
    case 'lake1': case 'fight3': return new THREE.Vector3(L.lake.x, 0, (L.lake.pier[1].z0 + L.lake.pier[1].z1) / 2);
    case 'weed2': { const i = g.farm.sim.plots.findIndex((p) => p.weeds); return i >= 0 ? new THREE.Vector3(g.farm.tiles[i].x, 0, g.farm.tiles[i].z) : new THREE.Vector3(0, 0, 0); }
    case 'dive3': { const t = g.lake?.treasures.find((x) => x.g.visible); return t ? t.g.position.clone() : new THREE.Vector3(L.lake.x, 0, L.lake.z); }
    case 'lakereq': return g.angling.today(g.world.day).done ? new THREE.Vector3(L.npcs.fisher.x, 0, L.npcs.fisher.z) : new THREE.Vector3(L.lake.board.x, 0, L.lake.board.z);
    case 'bug1': { const b = nearestBug(); return b ? b.clone().setY(0) : null; }
    case 'shake3': return new THREE.Vector3(L.orchard[0].x, 0, L.orchard[0].z);
    case 'friend2': return new THREE.Vector3(L.npcs.granny.x, 0, L.npcs.granny.z);
    case 'koat1': case 'koat6': return new THREE.Vector3(L.koat.gate.x, 0, L.koat.gate.z - 4);
    default: return null;
  }
}

/** 목표 안내: HUD 칩(할 일·거리·방향) + 월드 빛기둥 표시 */
export class Guide {
  constructor(game) {
    this.game = game;
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xfac03e) } },
      vertexShader: 'varying float vY; void main(){ vY = position.y / 7.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uColor; varying float vY; void main(){ float a = (1.0 - vY) * 0.55 * (0.75 + 0.25 * sin(uTime * 3.0 + vY * 8.0)); gl_FragColor = vec4(uColor, a); }',
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 7, 24, 1, true), beamMat);
    this.beam.position.y = 3.5;
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: 0xfac03e, emissive: 0xfac03e, emissiveIntensity: 0.8, roughness: 0.3 }));
    this.gem.scale.y = 1.4;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), new THREE.MeshBasicMaterial({ color: 0xfac03e, transparent: true, opacity: 0.7, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.marker = new THREE.Group();
    this.marker.add(this.beam, this.gem, this.ring);
    this.marker.visible = false;
    game.world.scene.add(this.marker);
    this.t = 0;
    this.acc = 1;
  }

  current() {
    const q = this.game.quests;
    for (const x of QUESTS) {
      if (q.claimed[x.id]) continue;
      return { ...x, complete: q.isComplete(x), count: Math.min(x.goal, q.progress[x.id] || 0) };
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.beam.material.uniforms.uTime.value = this.t;
    this.gem.position.y = 3.2 + Math.sin(this.t * 2.4) * 0.25;
    this.gem.rotation.y += dt * 1.8;
    const s = 1 + Math.sin(this.t * 3) * 0.08;
    this.ring.scale.set(s, s, s);
    this.acc += dt;
    if (this.acc < 0.15) return;
    this.acc = 0;
    const cur = this.current();
    const tgt = cur && !cur.complete ? targetOf(cur.id, g) : null;
    const pp = g.tractor.driving ? g.tractor.riderGroup.position : g.player.position;
    let dist = null, ang = 0;
    if (tgt) {
      this.marker.position.set(tgt.x, 0, tgt.z);
      dist = Math.hypot(tgt.x - pp.x, tgt.z - pp.z);
      this.marker.visible = dist > 3.5;
      // 화면 기준 방향: 카메라 앞을 위(0°)로
      const cam = g.followCam;
      const toT = Math.atan2(tgt.x - pp.x, tgt.z - pp.z);
      const fwd = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
      ang = -(toT - fwd) * 180 / Math.PI;
    } else this.marker.visible = false;
    g.ui.setObjective(cur, dist, ang);
  }
}

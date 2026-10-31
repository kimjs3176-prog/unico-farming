import * as THREE from 'three';
import { LAYOUT } from './world.js';

/**
 * 마우스 클릭 / 터치 탭 이동·상호작용
 * - 땅을 클릭하면 그 자리로 걸어감
 * - 밭·동물·NPC·트랙터·스마트팜 센서를 클릭하면 걸어가서 도착하면 자동으로 상호작용
 * - 마우스를 올리면 상호작용 가능한 대상 위에서 손가락 커서
 */
export class PointerNav {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hoverAcc = 0;
    // 목적지 표시 링
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 32),
      new THREE.MeshBasicMaterial({ color: 0xfac03e, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    game.world.scene.add(this.marker);
    this.markerT = 0;
  }

  /** 상호작용 대상 목록 { objs, pos(): Vector3, stop, pick } */
  targets() {
    const g = this.game, out = [];
    for (const e of g.ranch.ents) out.push({ objs: [e.m], pos: () => e.m.position, stop: 1.7 });
    for (const e of g.npcs.list) out.push({ objs: [e.u.group], pos: () => e.u.group.position, stop: 1.9 });
    if (!g.tractor.driving) out.push({ objs: [g.tractor.model], pos: () => new THREE.Vector3(g.tractor.vehicle.x, 0, g.tractor.vehicle.z), stop: 2.7 });
    const sensor = g.world.smartfarmModel?.getObjectByName('SensorPole');
    if (sensor) out.push({ objs: [sensor], pos: () => new THREE.Vector3(LAYOUT.sensor.x, 0, LAYOUT.sensor.z), stop: 1.8 });
    return out;
  }

  pick(sx, sy) {
    const g = this.game;
    this.ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, g.camera);
    const list = this.targets();
    const objs = list.flatMap((t) => t.objs);
    const hit = this.ray.intersectObjects(objs, true)[0];
    if (hit) {
      let o = hit.object;
      while (o) { const t = list.find((x) => x.objs.includes(o)); if (t) return { target: t }; o = o.parent; }
    }
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, p)) return null;
    // 밭 칸 위를 누르면 그 칸이 대상
    const tile = g.farm.tiles.find((t) => Math.abs(p.x - t.x) < 1.15 && Math.abs(p.z - t.z) < 1.15);
    if (tile) return { target: { pos: () => new THREE.Vector3(tile.x, 0, tile.z), stop: 0.35 } };
    return { point: p };
  }

  click(sx, sy) {
    const g = this.game;
    if (g.ui.panel || g.tractor.driving || g.smartfarm.active) return;
    const r = this.pick(sx, sy);
    if (!r) return;
    if (r.target) g.player.goTo(r.target.pos, r.target.stop, true);
    else g.player.goTo(() => r.point, 0.15, false);
    const p = r.target ? r.target.pos() : r.point;
    this.marker.position.set(p.x, 0.04, p.z);
    this.marker.visible = true;
    this.markerT = 0;
    g.audio.play('click', 0.4);
  }

  update(dt, input) {
    for (const c of input.clicks) this.click(c.x, c.y);
    // 목적지 링: 맥동 후 사라짐
    if (this.marker.visible) {
      this.markerT += dt;
      const s = 1 + Math.sin(this.markerT * 8) * 0.12;
      this.marker.scale.set(s, s, s);
      this.marker.material.opacity = Math.max(0, 0.9 - this.markerT * 0.5);
      if (!this.game.player.moveTarget && this.markerT > 0.4) this.marker.visible = false;
    }
    // 마우스 커서: 상호작용 대상 위에서 pointer
    this.hoverAcc += dt;
    if (input.hover && this.hoverAcc > 0.12) {
      this.hoverAcc = 0;
      const r = this.pick(input.hover.x, input.hover.y);
      this.game.renderer.domElement.style.cursor = r?.target ? 'pointer' : input.drag.active ? 'grabbing' : 'default';
    }
  }
}

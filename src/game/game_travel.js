// Game 믹스인: 체험관 이동·순간이동·빈자리 찾기
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import { LAYOUT } from './world.js';

export const GameTravel = {
  /** KOAT 체험관 입구로 이동 */
  goKoat() {
    if (this.tractor.driving || this.smartfarm.active || this.nature.fishing || this.rice.threshing) return this.ui.toast('지금은 이동할 수 없어요');
    this.teleport(25, -24, { yaw: 0, pitch: 0.62, distance: 13, facing: Math.PI });
    this.audio.play('levelup');
    if (!this.flags.koatIntro) { this.flags.koatIntro = true; this.koatCutscene(); }
    else this.ui.toast('🏢 KOAT 체험관에 도착! 본부별 부스에서 체험하고 안내데스크에서 스탬프를 확인하세요');
  },

  /** 순간이동 (지도·체험관 버튼). 카메라는 현재 각도 유지가 기본 */
  teleport(x, z, { yaw, pitch, distance, facing } = {}) {
    this.home?.leave(true); // 집 안에서 지도로 이동하면 먼저 밖으로
    this.ui.closePanel();
    this.player.position.set(x, 0, z);
    this.player.moveTarget = null;
    this.player.vel?.set(0, 0, 0);
    if (facing !== undefined) this.player.unico.facing = facing;
    if (yaw !== undefined) this.followCam.yaw = yaw;
    if (pitch !== undefined) this.followCam.pitch = pitch;
    if (distance !== undefined) this.followCam.distance = distance;
    this.followCam.first = true;
    this.fx.burst(x, 1.0, z, 0xbfe8ff, 16);
    this.audio.play('plant');
  },

  /** 막힌 자리(건물·연못·울타리)면 가까운 빈자리를 나선형으로 찾음 */
  findOpenSpot(x, z) {
    const B = LAYOUT.bounds - 2;
    x = Math.max(-B, Math.min(B, x)); z = Math.max(-B, Math.min(B, z));
    if (!this.world.isBlocked(x, z, 0.5)) return { x, z };
    for (let r = 0.8; r < 12; r += 0.8) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      if (Math.abs(nx) < B && Math.abs(nz) < B && !this.world.isBlocked(nx, nz, 0.5)) return { x: nx, z: nz };
    }
    return { x: 0, z: 6 };
  },
};

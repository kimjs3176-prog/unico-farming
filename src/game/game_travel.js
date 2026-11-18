// Game 믹스인: 체험관 이동·순간이동·빈자리 찾기
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import { LAYOUT } from './world.js';
import { Wipe } from '../ui/wipe.js';

/** 대화·컷신 중 이동을 막을 때 알림 */
export const BUSY_TRAVEL = '대화가 끝나면 이동할 수 있어요';
/** 같은 알림은 한 장만 (거듭 눌러도 쌓이지 않게), 경고 모양으로 보상 알림과 구분 */
export const BUSY_TOAST = { key: 'busy-travel', type: 'warn' };
/** 탈것·미니게임 중 이동을 막을 때 알림 */
export const NO_TRAVEL = '지금은 이동할 수 없어요';
/** 도착하면 카메라가 이만큼(m) 멀리서 시작해 원래 거리로 다가옴 */
export const WARP_DOLLY = 3;

export const GameTravel = {
  /** KOAT 체험관 입구로 이동 */
  goKoat() {
    // 도착 팡파르는 없음 (순간이동 소리만): 큰 축하 소리는 보상·레벨업에만
    return this.warpTo(25, -24, { yaw: 0, pitch: 0.62, distance: 13, facing: Math.PI }, {
      label: '🏢 KOAT 체험관',
      after: () => {
        if (!this.flags.koatIntro) { if (!this._koatCine) this.koatCutscene(); } // 표시는 컷신 마지막 스텝에서 (잃어버리지 않게)
        else this.ui.toast('🏢 KOAT 체험관에 도착! 본부별 부스에서 체험하고 안내데스크에서 스탬프를 확인하세요');
      },
    });
  },

  /** 지금 이동할 수 없는 까닭 (알림 문장과 모양), 이동할 수 있으면 null */
  travelBlock() {
    if (this.busy?.()) return [BUSY_TRAVEL, BUSY_TOAST];
    if (this.ride?.driving || this.smartfarm?.active || this.nature?.fishing || this.rice?.threshing || this.lake?.diving || this.farm?.job) return [NO_TRAVEL];
    return null;
  },

  /**
   * 장면 전환과 함께 이동 (지도·체험관): 동그란 막이 덮이는 동안 순간이동, 열릴 때 카메라가 살짝 멀리서 다가옴
   * 막는 조건은 누를 때와 막이 다 덮였을 때 두 번 봄. after: 도착해 막이 다 열린 뒤 (알림·컷신), label: 덮인 동안 보일 가는 곳
   * @returns 전환을 시작했으면 true
   */
  warpTo(x, z, opts = {}, { after, label } = {}) {
    if (this._warping) return false;
    const no = this.travelBlock();
    if (no) { this.ui.toast(...no); return false; }
    this._warping = true;
    this.ui.closePanel?.();
    this.player.hold?.('warp');
    this.audio.play('warp');
    const wipe = (this.wipe ||= new Wipe());
    let ok = false;
    const mid = () => {
      const still = this.travelBlock();
      if (still) { this.ui.toast(...still); return; }
      ok = this.teleport(x, z, opts);
      if (!ok) return;
      this.followCam.curDist = this.followCam.distance + WARP_DOLLY; // 원래 거리로 부드럽게 다가옴 (curDist 보간)
      this.fx.burst(x, 1.0, z, 0xbfe8ff, 16);
    };
    const done = () => {
      this.player.unhold?.('warp');
      this._warping = false;
      if (ok) after?.();
    };
    if (wipe.run(() => this.screenOf?.(this.player.position, 1.0), mid, done, { label }) === false) { mid(); done(); }
    return true;
  },

  /** 세계 점 p(+높이 dy)의 화면 위치 (CSS px) */
  screenOf(p, dy = 0) {
    const v = (this._scrV ||= p.clone()).copy(p);
    v.y += dy;
    v.project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  },

  /** 순간이동 (바로 옮김: 전환 연출·소리는 warpTo). 카메라는 현재 각도 유지가 기본 */
  teleport(x, z, { yaw, pitch, distance, facing } = {}) {
    if (this.busy?.()) { this.ui.toast(BUSY_TRAVEL, BUSY_TOAST); return false; }
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
    return true;
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

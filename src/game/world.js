import * as THREE from 'three';
import { heightAt, HILLS, CHESTS } from './terrain.js';
import { Scenery } from './scenery.js';
import { Precipitation } from './precip.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { enhanceMaterial, SURF, setSurfaceDetail, leafAttrValue, easeWet } from './surface.js';
import { timeOfDay, nightFactor } from './sim/tod.js';
import { Birds } from './birds.js';
import { whenFontReady } from './label.js';
import { shadowRadiusFor } from './shadow_soft.js';
import { peekTownStar } from './save.js';

/** 마을 별 4개 동상 자리 후보 (장터 앞 광장 큰길 옆: 기본 카메라가 앞에서 봄, 길·소품을 피한 첫 빈자리) */
export const STATUE_SPOTS = [[-4.6, -5.6], [-4.8, -7.2], [4.6, -12.6], [-5.8, -9.2], [-5.6, -13.4], [5.2, -13.6], [-6.2, -4.4], [4.2, -15.6], [-4.6, -16.4]];

/** 월드 레이아웃 상수 (m). +X 동쪽, +Z 남쪽, 스폰 (0,0,9) */
export const LAYOUT = {
  bounds: 40,
  farm: { cols: 6, rows: 3, tile: 2.4, origin: { x: 0, z: 0 } },
  market: { x: 0, z: -10 },
  well: { x: -9, z: 1 },
  ranch: { x0: 12, z0: -6, x1: 32, z1: 10, gate: { x: 12, z: 3 } },
  barn: { x: 19, z: -13 },
  silo: { x: 26, z: -13 },
  coop: { x: 28, z: 7 },
  trough: { x: 16, z: 7 },
  smartfarm: { x: -22, z: -8 },
  sensor: { x: -17, z: -12.5 },
  field: { x0: 6, z0: 14, cols: 10, rows: 6, cell: 2 },
  tractorHome: { x: 28.5, z: 17, heading: -Math.PI / 2 },
  // 트랙터 마당: 밭갈이 밭 + 트랙터 자리를 울타리로 두름. 북서쪽 문은 트랙터도 드나들 만큼 넓게 (트랙터는 마을 탈것)
  tractorYard: { x0: 6.0, z0: 12.0, x1: 31.6, z1: 27.8, gate: { x: 9.6, w: 6.0 } }, // 문은 농장에서 오는 흙길 끝(북서쪽)
  // 자전거·농장 카트를 세워 두는 자리 후보 (막히지 않은 첫 자리)
  rides: {
    bike: [{ x: 8.2, z: 6.2, heading: Math.PI / 2 }, { x: -4.4, z: 5.6, heading: -Math.PI / 2 }], // 밭(±7.2, ±3.6) 밖 길가
    cart: [{ x: 2.4, z: -16, heading: Math.PI }, { x: 1.8, z: -5.4, heading: Math.PI / 2 }],
  },
  windmill: { x: -27, z: 15 },
  pond: { x: -12, z: 18, r: 4.5 },
  // 논 (3x2), 탈곡장, 허수아비
  paddy: { cols: 3, rows: 2, size: 3.6, bund: 0.7, x0: -6.8, z0: -25.6 },
  thresher: { x: 10.2, z: -20.5 },
  scarecrow: { x: -8.6, z: -23 },
  // 과수원, 낚시 데크
  orchard: [
    { x: 7, z: -9, fruit: 'fruit_apple' }, { x: 10.5, z: -6.5, fruit: 'fruit_peach' },
    { x: 8.6, z: -4.4, fruit: 'fruit_pear' }, { x: 10.5, z: -1.5, fruit: 'fruit_persimmon' },
    { x: -7, z: 12, fruit: 'fruit_apple' }, { x: -3.5, z: 14.5, fruit: 'fruit_peach' },
  ],
  dock: { x: -8.9, z: 14.8, rot: 2.38 },
  // 유니코 낚시터 (남서쪽 호수): 물 위로 뻗은 부두(물에 뜬 나무 데크), 동쪽 물가에 낚시 가게·기록판
  lake: {
    x: -12.5, z: 31, r: 6,
    pier: [{ x0: -13.35, z0: 23.2, x1: -11.65, z1: 30.2 }, { x0: -14.4, z0: 29.4, x1: -10.6, z1: 32.6 }],
    shop: { x: -2.9, z: 28.6, rot: -Math.PI / 2 }, board: { x: -2.8, z: 24.2 }, entry: { x: -12.5, z: 23.2 },
  },
  npcs: {
    merchant: { x: 3.2, z: -8.4, pose: 'present', species: 'fox', name: '장터 여우' },
    researcher: { x: -14.5, z: -3.5, pose: 'lab', species: 'raccoon', name: '연구원 너구리' },
    guide: { x: 3.5, z: 10.8, pose: 'megaphone', species: 'puppy', name: '안내 강아지' }, // 시작 자리 오른쪽 앞 풀밭: 첫 화면에서 가로등 기둥과 겹치지 않게
    granny: { x: -9.6, z: -19.4, pose: 'think', species: 'bear', name: '곰 할머니' },
    kid: { x: -6, z: 5, pose: 'cheer', species: 'rabbit', name: '꼬마 토끼', wander: { x0: -12, z0: 3.5, x1: -3, z1: 8 } },
    fisher: { x: -5.2, z: 27.4, pose: 'wave', species: 'cat', name: '낚시꾼 고양이' },
  },
  // 흙길 (부드러운 곡선으로 지면에 칠함): [[x,z]...], 폭
  paths: [
    { pts: [[0, 12], [0, 5], [0, -3], [0, -9.5], [0, -14.5]], w: 3 },
    { pts: [[1, 5.5], [6, 5.0], [10, 3.8], [13, 3]], w: 2.6 },
    { pts: [[-1, 3], [-6, 2.6], [-11, 1.8], [-15, -1], [-17, -3.6]], w: 2.6 },
    { pts: [[-13, 9.4], [-5, 9.2], [4, 9], [12, 9.6]], w: 2.6 },
    { pts: [[4.5, 9], [5.6, 11.4], [6.6, 13.6]], w: 2.4 },
    { pts: [[-5.5, 9.4], [-7.4, 11.6], [-8.6, 14.2]], w: 2 },
    { pts: [[0.5, -2], [3.5, -3.4], [6, -5.2]], w: 2 },
    { pts: [[1, -14.5], [5, -16], [9, -19]], w: 2.2 },
    { pts: [[12, 9.6], [19, 11], [25.5, 13.6], [28.5, 15.2]], w: 2.4 },
    { pts: [[9.5, -19.5], [14, -18.6], [20, -18.2], [25, -18.6]], w: 2.6 },
    // 연못 동쪽을 지나 낚시터 부두로, 갈림길은 낚시 가게로
    { pts: [[-5.5, 9.4], [-5.4, 13], [-5.0, 17.5], [-6.8, 21.2], [-10, 23.1], [-12.5, 23.6]], w: 2.2 },
    { pts: [[-6.8, 21.2], [-5.4, 23.8], [-4.8, 26.2]], w: 1.9 },
    { pts: [[-15, -1], [-18.5, 1.6], [-22.5, 3.6], [-26.5, 5.6], [-29.5, 7.8]], w: 2.2 }, // 새 마을 부지 가는 길
    { pts: [[-22.5, 3.6], [-22.8, 9], [-22.4, 13.8]], w: 1.8 },
    { pts: [[0, 12], [1.1, 14.2], [2.6, 16.2]], w: 1.8 }, // 유니코 집 가는 길
  ],
  // 소품 배치
  props: [
    ['lamp', 3.4, 7.6, 0], ['lamp', -1.9, -4.7, Math.PI], ['lamp', 1.9, -12.5, 0], ['lamp', -6, 10.8, Math.PI / 2], ['lamp', 6.5, 7.6, 0],
    ['lamp', -11, 3.4, Math.PI], ['lamp', 11.5, 5.4, 0], ['lamp', -1.9, -16, Math.PI],
    ['bench', -3.2, 11.6, Math.PI], ['bench', 3.6, -12.4, 0], ['bench', -2.7, 18.4, -2.0], ['bench', -17.6, 27.2, Math.PI / 2 + 0.3], ['bench', -17.4, 34.6, Math.PI / 2 + 1.1],
    ['lamp', -10.4, 23.4, 0], ['lamp', -6.9, 25.6, 0], ['lamp', -14.15, 32.35, 0], ['lamp', -10.85, 32.35, 0], ['barrel', -1.7, 26.6, 0], ['crate', -1.5, 30.6, 0.3], ['crate', -1.9, 31.4, -0.2],
    // 장터 가판대 양옆은 길이 지나는 자리라 소품을 바깥으로 (통로 폭 1.4m 이상)
    ['crate', -3.1, -10.4, 0.3], ['crate', -3.3, -9.4, -0.2], ['barrel', -3.4, -11.5, 0], ['barrel', 16.2, -10.2, 0], ['barrel', 16.9, -9.6, 0],
    ['crate', 8.7, -18.6, 0.4], ['barrel', 11.8, -19, 0], ['mailbox', 1.9, 11.2, 0],
    ['planter', -2.4, 7.4, Math.PI / 2], ['planter', 2.4, 7.4, Math.PI / 2], ['planter', -2.6, -7.6, 0],
  ],
  // 무작위 장식이 들어가면 안 되는 구역
  // KOAT 체험관 (북동쪽): 본관 + 본부별 체험 부스 6 + 안내데스크
  koat: {
    rect: [13.5, -38.6, 36.5, -18.8], plaza: [15.5, -33, 34.5, -19.6],
    // 본관은 뒤로(정면 z≈-32.6), 부스 줄은 앞으로 당겨 안쪽 부스(기술사업·스마트농업) 앞에도 넉넉히 설 수 있게
    hq: { x: 25, z: -36.6 }, desk: { x: 25, z: -29.3 }, gate: { x: 25, z: -19.6 },
    booths: [
      { id: 'tech', x: 17.2, z: -30.6, rot: Math.PI / 2 }, { id: 'venture', x: 17.2, z: -25.7, rot: Math.PI / 2 }, { id: 'seed', x: 17.2, z: -20.8, rot: Math.PI / 2 },
      { id: 'smart', x: 32.8, z: -30.6, rot: -Math.PI / 2 }, { id: 'machine', x: 32.8, z: -25.7, rot: -Math.PI / 2 }, { id: 'env', x: 32.8, z: -20.8, rot: -Math.PI / 2 },
    ],
  },
  // CC0 건물 (Quaternius): 물탱크, 트랙터 창고, 논 옆 방앗간 풍차
  waterTower: { x: 31, z: -13 },
  // 양봉: 서쪽 들꽃 근처 벌통 3개
  hives: [{ x: -18.2, z: 6.8 }, { x: -19.8, z: 4.9 }, { x: -17, z: 4.4 }],
  // 양 몰이 들판 (밭 남쪽): 놀이 영역과 3면이 막힌 우리 (서쪽이 입구)
  herd: { x0: 12.5, z0: 28, x1: 30, z1: 35.5, pen: { x0: 25, z0: 29.5, x1: 29.5, z1: 34 }, sign: { x: 13.6, z: 29 } },
  shed: { x: 35, z: 17 }, // 주차된 트랙터와 3m 띄움
  // 밭 서쪽 농사 시설: 퇴비통, 주문 게시판, 장독대(가공)
  // 목장 가공소(치즈 공방, 축사 동쪽) · 축사 앞 '우리 목장' 관리 자리
  ranchWork: { x: 31.8, z: -9.2, rot: -Math.PI / 2, barn: { x: 19.5, z: -8.4 } },
  craft: { compost: { x: -9.7, z: -2.3 }, board: { x: -10.3, z: -4.6 }, jars: { x: -12.4, z: -7.3 } },
  mill: { x: -15, z: -24 },
  // 유니코 집 (밭 남쪽, 처음 서 있는 곳 바로 아래): 문은 북쪽(길 쪽)을 봄
  home: { x: 2.6, z: 18.6, door: { x: 2.6, z: 16.0 } },
  // 새 마을 부지 (서쪽): 코인으로 건물을 짓는 건설 부지 5곳 (sim/town.js · view/town_view.js)
  town: { sites: [{ x: -25.5, z: 2.4 }, { x: -25.5, z: 8.6 }, { x: -30.6, z: 5.2 }, { x: -30.6, z: 10.8 }, { x: -22, z: 16.6 }], sign: { x: -21.6, z: 0.4 }, entry: { x: -21.5, z: 4.6 } },
  reserved: [
    // 언덕 전망대·숨은 보물 상자 자리 (나무가 막지 않게)
    ...HILLS.map((H) => [H.lookout.x - 3.5, H.lookout.z - 3.5, H.lookout.x + 3.5, H.lookout.z + 3.5]),
    ...CHESTS.map((c) => [c.x - 1.4, c.z - 1.4, c.x + 1.4, c.z + 1.4]),
    [12, 27.5, 30.5, 36],
    [-19.5, 23.2, -1, 38.5], // 낚시터
    [-14.2, -9.5, -7.4, -1.4], // 농사 시설 (나무가 가리지 않게)
    [27.5, -11.2, 34, -6.5], // 목장 가공소
    [-21, 3.4, -15.8, 8.2],
    [13, -39, 37, -18.4], [29.5, -14.5, 32.5, -11.5], [32, 14, 38, 20], [-18, -27, -12, -21], [-8.5, -27.5, 8.5, -14], [5, -11, 13, 0.5], [7.5, -23, 13, -17], [-11, -25, -7.5, -17.5], [-9, 10, -2, 16.5],
    [-33.5, -1.2, -19.2, 19.4, 'trees'], // 새 마을 부지 5곳 + 안내판 (지은 건물·공사 자리에 나무·바위가 겹치지 않게)
    [-1.6, 15.2, 6.0, 23.6, 'trees'], // 유니코 집 (커진 집과 마당에 나무가 겹치지 않게, 풀은 남김)
    [6.0, 12.0, 31.6, 27.8, 'trees']], // 트랙터 마당(밭갈이) — 나무만 막음
};

/** 흙길(LAYOUT.paths) 중심선까지 거리 ≤ 폭/2 + pad 이면 true (나무·바위·덤불이 길을 막거나 길 위에 서지 않게) */
export function pathNear(x, z, pad = 0) {
  for (const { pts, w } of LAYOUT.paths) {
    const lim = w / 2 + pad;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) <= lim) return true;
    }
  }
  return false;
}

const DAY_LENGTH = 360; // 실제 초 = 게임 하루
// 애니메이션·상호작용이 있어 병합하면 안 되는 모델
const DYNAMIC = new Set(['windmill', 'tower_windmill', 'drone', 'smartfarm', 'fruit_tree', 'thresher', 'tractor', 'hen', 'cloud']);
const GREY = new THREE.Color(0x9aa4ae);
const RAIN_COOL = new THREE.Color(0x8fa0b4), RAIN_COOL_GROUND = new THREE.Color(0x56645e); // 비 오는 날 빛 (서늘한 회청색)
// 밤 달빛: 하늘빛은 푸르게, 땅 반사는 초록 대신 남색, 주변광도 푸르스름하게
const MOON = new THREE.Color(0x9db4ff), NIGHT_GROUND = new THREE.Color(0x2c3a52), DAY_GROUND = new THREE.Color(0x6f9a4a), NIGHT_AMB = new THREE.Color(0xa9bcff), WHITE = new THREE.Color(0xffffff);
const DAY_SKY = new THREE.Color(0xbfe4ff), DUSK_SKY = new THREE.Color(0xf4b183), NIGHT_SKY = new THREE.Color(0x1d2a4a);
const WEATHER_KEYS = ['cloud', 'precip', 'fog', 'wind'];
// 환경맵을 끈 저사양(quality.env === false): 주변광에 더할 값 = 이 배율 × 환경광 세기.
// 같은 장면을 환경맵 켬/끔으로 찍어 화면 밝기를 맞춤: 켬 190.5·125.0·63.7 ↔ 끔(배율 5) 190.2·124.4·63.3 (낮·저녁·밤)
export const ENV_OFF_AMBIENT = 5;
const ORIGIN = { x: 0, z: 0 };
// 정적 병합 칸: 삼각형이 많은 묶음만 20m 칸으로 나눠 화면(그림자 상자) 밖 칸은 그리지 않음
const STATIC_CELL = 20, SPLIT_TRIS = 3000, MIN_CELL_TRIS = 400;
// 그림자: 캐릭터 앞 34m·뒤 12m(멀리 당기면 카메라 발밑까지)를 덮는 상자를 카메라가 보는 쪽으로 밀어 둠 (화면 비율에 맞춰 크기)
const SHADOW_AHEAD = 34, SHADOW_BEHIND = 12, SHADOW_BEHIND_MAX = 20, SUN_DIST = 100;
// 가로 화면 기준 세로 시야 45°의 tan. 세로 화면은 세로 시야를 넓혀도 가로 시야는 대략 tan×√비율 이하라 그 값으로 덮음
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(45 / 2));
const INDOOR_Y = -50; // 이보다 아래면 땅속 실내 방 (view/home_interior.js IO.y = -200)
const _c = new THREE.Vector3(), _dir = new THREE.Vector3(), _size = new THREE.Vector2(), _sr = new THREE.Vector3(), _su = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** 칸 이름 (x,z 를 size m 칸으로) */
export function cellKey(x, z, size) { return `${Math.floor(x / size)},${Math.floor(z / size)}`; }

/**
 * 정적 병합 나누기 계획: 칸별 삼각형 수(Map) → 함께 합칠 칸 묶음 목록.
 * 작은 묶음은 통째로 하나, 큰 묶음은 칸마다 하나 (아주 작은 칸들은 한데 모아 드로우콜을 아낌)
 */
export function planStaticGroups(cellTris, { splitTris = SPLIT_TRIS, minCellTris = MIN_CELL_TRIS } = {}) {
  const keys = [...cellTris.keys()];
  let total = 0;
  for (const t of cellTris.values()) total += t;
  if (total < splitTris || keys.length < 2) return keys.length ? [keys] : [];
  const groups = [], rest = [];
  for (const k of keys) (cellTris.get(k) >= minCellTris ? groups.push([k]) : rest.push(k));
  if (rest.length) groups.push(rest);
  return groups;
}

/**
 * 그림자 상자 맞추기: 화면 가로세로비 → { r: 상자 반폭(m), a: 상자 중심을 캐릭터 앞으로 미는 거리(m) }.
 * 앞쪽 끝(ahead)에서 화면 가로 반폭(카메라가 최대 camBack 뒤에 있을 때)과 앞뒤 길이를 모두 덮는 가장 작은 상자.
 * max(품질 단계별 상한)에 걸려 다 못 덮으면 화면에 크게 보이는 뒤쪽(카메라 쪽)을 먼저 덮음
 */
export function shadowFit(aspect, { ahead = SHADOW_AHEAD, behind = SHADOW_BEHIND, camBack = 16, tanHalf = TAN_HALF_FOV, min = 16, max = 36 } = {}) {
  const asp = Math.max(0.1, aspect || 1);
  const halfW = (ahead + camBack) * Math.max(asp, Math.sqrt(asp)) * tanHalf;
  const r = Math.min(max, Math.max(min, halfW, (ahead + behind) / 2));
  return { r, a: Math.max(0, Math.min(ahead - r, r - behind)) };
}

/** 상자 뒤쪽 길이: 카메라까지 가로 거리(dl)+1m 까지 덮음 (최소 12m, 최대 20m, 1m 단위로 끊어 줌 바꿀 때만 크기가 바뀜) */
export function shadowBehind(dl) {
  return Math.max(SHADOW_BEHIND, Math.min(Math.ceil((dl || 0) + 1), SHADOW_BEHIND_MAX));
}

/**
 * 그림자 상자 중심을 빛 공간 격자(그림자 맵 한 칸 = texel m)에 맞춤 → 캐릭터가 움직여도 그림자 가장자리가 떨리지 않음.
 * dir: 빛이 오는 쪽 단위 벡터 (그림자 카메라 lookAt 과 같은 축). 빛 방향 성분은 그대로 둠
 */
export function snapToTexel(c, dir, texel, out = new THREE.Vector3()) {
  const right = _sr.crossVectors(UP, dir);
  if (right.lengthSq() < 1e-12 || !(texel > 0)) return out.copy(c);
  right.normalize();
  const upv = _su.crossVectors(dir, right);
  const px = c.dot(right), py = c.dot(upv);
  const sx = Math.round(px / texel) * texel - px, sy = Math.round(py / texel) * texel - py;
  return out.copy(c).addScaledVector(right, sx).addScaledVector(upv, sy);
}

/** 0..n-1 순번 인덱스 */
function seqIndex(n) {
  const a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return new THREE.BufferAttribute(a, 1);
}

export class World {
  constructor(assets, renderer, quality = { grass: 9000, shadowMap: 3072 }) {
    setSurfaceDetail(!!quality.lowDetail); // 재질 노이즈 세밀도 (첫 렌더 전에)
    this.assets = assets;
    this.quality = quality;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe4ff);
    this.scene.fog = new THREE.Fog(0xbfe4ff, 45, 110);
    this.obstacles = []; // {x,z,r} 원형 충돌체
    this.aoSpots = []; // 지면에 구울 부드러운 그림자
    this.staticObjs = []; // 움직이지 않는 장식 → 재질별로 병합해 드로우콜 절감
    this.boxes = []; // {x0,z0,x1,z1}
    this.animated = []; // update(dt) 를 갖는 객체
    this.time = 0.33; // 하루 중 비율 (0=자정, 0.5=정오)
    this.daylight = 1;
    this.day = 1;
    this.lampMaterials = [];
    this._lights();
    this._ground();
    this._decorate();
    this._paintGround();
    // 마을 별 4개 동상: 저장에 이미 있으면 정적 묶음에 함께 (그리기 호출 늘지 않음), 처음 생기면 addStatue 가 따로
    // 밟고 지나가는 소품·주민 자리·과일나무도 피함
    this.statueSpot = this._statueSpot();
    if (peekTownStar() >= 4) this.addStatue({ batch: true });
    this._batchStatic();
    this.scenery = new Scenery(this);
    this.scenery.ridges = this.ridges;
    this.scenery.setWaterLamps(this.lampHeads || []); // 물가 가로등 → 밤 수면 빛줄기
    this.precip = new Precipitation(this.scene);
    // 빗방울 튀김 자리: 땅 높이, 물·건물·장애물 위는 건너뜀
    this.precip.ground = (x, z) => (this.isBlocked(x, z, 0.15) ? null : heightAt(x, z));
    // 날씨: target 은 실시간 날씨, cur 은 부드럽게 따라가는 현재값
    this.weatherTarget = { kind: 'clear', cloud: 0.15, precip: 0, fog: 0, wind: 0.15 };
    this.weatherCur = { ...this.weatherTarget };
  }

  /** 날씨 서비스(describeWeather 결과) 적용 */
  setWeather(w) {
    this.weatherTarget = { kind: w.kind, cloud: w.cloud, precip: w.precip, fog: w.fog, wind: w.wind };
    if (!this.weatherKind) { Object.assign(this.weatherCur, this.weatherTarget); this.snowCover = w.kind === 'snow' ? Math.min(1, w.precip * 1.2) : 0; } // 첫 적용은 즉시
    this.weatherKind = w.kind;
  }

  // ------------------------------------------------------------ 조명 / 하늘
  _lights() {
    this.hemi = new THREE.HemisphereLight(0xd8eeff, 0x6f9a4a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
    this.sun.castShadow = true;
    const s = 34; // 플레이어 주변만 고해상도 그림자 (update 에서 추적)
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 });
    this.sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = shadowRadiusFor(this.quality?.level); // 품질별 그림자 경계 (shadow_soft.js)
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.ambient);
    // 림 라이트: 태양 반대편에서 캐릭터·동물 윤곽을 배경과 분리
    this.rim = new THREE.DirectionalLight(0xbfdcff, 0.55);
    this.scene.add(this.rim, this.rim.target);
  }

  _ground() {
    const B = LAYOUT.bounds + 30;
    this.groundSize = B * 2;
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    // 언덕이 있는 지면: 촘촘한 평면을 높이 함수로 들어 올림 (평면 로컬 (x,y) → 월드 (x,-y), 로컬 z → 월드 높이)
    const gGeo = new THREE.PlaneGeometry(B * 2, B * 2, 120, 120); // 약 1.2m 간격 (언덕이 반지름 8m 이상이라 충분)
    const gp = gGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) gp.setZ(i, heightAt(gp.getX(i), -gp.getY(i)));
    gGeo.computeVertexNormals();
    const ground = new THREE.Mesh(gGeo, this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.groundMesh = ground;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // 잔디 디테일(타일)을 칠한 지면 위에 곱해서 가까이서도 거칠어 보이지 않게
    const detail = grassTexture();
    detail.repeat.set(1, 1);
    this.groundTime = { value: 0 };
    this.groundSnow = { value: 0 }; // 눈 덮임 (update 에서 snowCover)
    this.groundWet = { value: 0 }; // 비에 젖음 (update 에서 SURF.wet)
    this.groundPud = { value: 0 }; // 흙길 물웅덩이 (보통·고사양만 1)
    this.groundNight = { value: 0 }; // 밤 정도 (채도 낮추고 달빛 푸르게)
    this.groundSky = { value: new THREE.Color(0xbcd3e6) }; // 하늘색 (물웅덩이에 비침)
    this.groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.uTime = this.groundTime;
      sh.uniforms.uSnow = this.groundSnow;
      sh.uniforms.uWet = this.groundWet;
      sh.uniforms.uPud = this.groundPud;
      sh.uniforms.uNight = this.groundNight;
      sh.uniforms.uSkyC = this.groundSky;
      sh.fragmentShader = 'uniform sampler2D detailMap; uniform float uTime; uniform float uSnow; uniform float uWet; uniform float uPud; uniform float uNight; uniform vec3 uSkyC;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        `#include <map_fragment>
         vec3 d = texture2D(detailMap, vMapUv * 46.0).rgb;
         // 흙(길·밭·모래·광장: 칠한 색의 r ≥ g)에는 잔디 디테일의 밝기만 곱함 → 흙이 연두로 물들지 않음
         float bare = smoothstep(-0.03, 0.02, sampledDiffuseColor.r - sampledDiffuseColor.g);
         float dl = dot(d, vec3(0.2126, 0.7152, 0.0722));
         diffuseColor.rgb *= mix(vec3(1.0), mix(d * 1.55, vec3(dl * 2.05), bare), 0.42);
         // 눈 덮인 땅: 바탕색을 눈 색으로 (빛·그림자·밤을 그대로 받음), 길·밭은 덜 덮여 길이 보임
         if (uSnow > 0.001) {
           float sv = sin(vMapUv.x * 173.0 + sin(vMapUv.y * 131.0) * 1.7) * sin(vMapUv.y * 157.0 + sin(vMapUv.x * 97.0) * 1.3);
           float sn = uSnow * smoothstep(0.3, 0.62, 0.5 + 0.28 * sv + (dl - 0.3) * 0.6 + uSnow * 0.3) * mix(1.0, 0.45, bare);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), sn);
         }
         // 흘러가는 구름 그림자 (넓고 부드럽게)
         vec2 cp = vMapUv * 5.2 + vec2(uTime * 0.011, uTime * 0.0045);
         float cn = sin(cp.x * 3.1 + sin(cp.y * 2.3)) * sin(cp.y * 2.7 + sin(cp.x * 1.7)) + 0.35 * sin(cp.x * 7.3 + cp.y * 5.1);
         diffuseColor.rgb *= 1.0 - smoothstep(0.3, 0.85, cn) * 0.22;
         // 비에 젖은 땅: 흙은 진하게, 풀밭은 조금. 보통·고사양은 흙길 낮은 곳에 물웅덩이
         float gWet = 0.0, gPud = 0.0;
         if (uWet > 0.001) {
           gWet = uWet * mix(0.55, 1.0, bare);
           // 흙·길은 0.72 배로 진하게, 풀밭은 0.8 배 + 채도 1.1 (서늘하게)
           float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
           vec3 wetG = mix(vec3(gl), diffuseColor.rgb, 1.1) * vec3(0.76, 0.8, 0.86);
           vec3 wetS = diffuseColor.rgb * vec3(0.7, 0.72, 0.76);
           diffuseColor.rgb = mix(diffuseColor.rgb, max(mix(wetG, wetS, bare), 0.0), uWet);
           if (uPud > 0.5) {
             float pn = sin(vMapUv.x * 61.0 + sin(vMapUv.y * 43.0) * 2.1) * sin(vMapUv.y * 67.0 + sin(vMapUv.x * 37.0) * 1.7) + 0.4 * sin(vMapUv.x * 151.0 - vMapUv.y * 133.0);
             gPud = bare * smoothstep(0.68, 0.86, pn) * smoothstep(0.4, 0.9, uWet);
             diffuseColor.rgb *= mix(1.0, 0.55, gPud);
             gWet = max(gWet, gPud * 1.4);
           }
         }
         // 밤: 채도를 낮추고 달빛 푸른색으로 (물·바위와 같은 밤 색)
         diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 1.0 - 0.35 * uNight) * mix(vec3(1.0), vec3(0.85, 0.92, 1.1), uNight);`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
         roughnessFactor *= 1.0 - 0.35 * min(gWet, 1.0) - 0.45 * max(gWet - 1.0, 0.0) / 0.6;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
         // 물웅덩이에 하늘이 비침 (보통·고사양, 비스듬히 볼수록 많이)
         if (gPud > 0.001) {
           float pf = 0.25 + 0.75 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
           totalEmissiveRadiance += uSkyC * 0.9 * gPud * pf * uWet * 0.6;
         }`);
    };
    // 연못 바닥 / 테두리 (물은 scenery 가 그림)
    const pondBed = new THREE.Mesh(new THREE.CircleGeometry(LAYOUT.pond.r, 48), new THREE.MeshStandardMaterial({ color: 0x3f7fa8, roughness: 0.9 }));
    pondBed.rotation.x = -Math.PI / 2;
    pondBed.position.set(LAYOUT.pond.x, -0.05, LAYOUT.pond.z);
    this.scene.add(pondBed);
    // 물 (연못·호수): 들어갈 수 없지만 부두 데크 위는 걸을 수 있음
    this.waters = [
      { x: LAYOUT.pond.x, z: LAYOUT.pond.z, r: LAYOUT.pond.r - 0.3, decks: [] },
      { x: LAYOUT.lake.x, z: LAYOUT.lake.z, r: LAYOUT.lake.r - 0.3, decks: LAYOUT.lake.pier, swim: true }, // 호수는 헤엄쳐 들어갈 수 있음 (플레이어만)
    ];
    // 연못 가장자리 돌
    const rnd = mulberry32(17);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a9c9f, roughness: 0.95 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.1;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + rnd() * 0.18, 0), stoneMat);
      st.position.set(LAYOUT.pond.x + Math.cos(a) * (LAYOUT.pond.r + 0.1), 0.05, LAYOUT.pond.z + Math.sin(a) * (LAYOUT.pond.r + 0.1));
      st.scale.y = 0.55;
      st.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      st.castShadow = st.receiveShadow = true;
      this.scene.add(st);
    }
  }

  /** 지면 텍스처 칠하기 (장식 배치 후 호출: 나무·건물 밑 AO 를 함께 굽는다) */
  _paintGround() {
    const S = this.quality.level === 'low' ? 1024 : 2048, G = this.groundSize;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const main = c.getContext('2d');
    let ctx = main; // soft() 안에서는 잠시 작은 캔버스를 가리킴
    const P = (x) => ((x + G / 2) / G) * S; // 월드 → 픽셀
    const M = (m) => (m / G) * S;
    const rnd = mulberry32(31);
    // 바탕 잔디: 큰 색 얼룩
    ctx.fillStyle = '#86c957';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const r = M(3 + rnd() * 10);
      ctx.fillStyle = `hsla(${88 + rnd() * 22}, ${45 + rnd() * 20}%, ${42 + rnd() * 16}%, 0.22)`;
      ctx.beginPath(); ctx.ellipse(rnd() * S, rnd() * S, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); ctx.fill();
    }
    // 흐린 경계: ctx.filter='blur()' 는 큰 캔버스에서 CPU 로 계산돼 매우 느림(입장 로딩 대부분을 차지)
    // → 1/k 크기 캔버스에 그린 뒤 부드럽게 늘려 붙임 (늘릴 때의 보간이 흐림 역할, 결과는 거의 같음)
    const soft = (blur, fn) => {
      const k = Math.max(1, Math.min(16, Math.round(blur / 1.1)));
      const w = Math.ceil(S / k);
      const sc = document.createElement('canvas');
      sc.width = sc.height = w;
      const sx = sc.getContext('2d');
      sx.scale(w / S, w / S);
      ctx = sx; fn(); ctx = main;
      main.save(); main.imageSmoothingEnabled = true; main.imageSmoothingQuality = 'high';
      main.drawImage(sc, 0, 0, S, S);
      main.restore();
    };
    // 흙길: 넓고 흐린 가장자리 → 본체 → 자갈 점
    const stroke = (pts, w, color, alpha) => {
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = M(w); ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(P(pts[0][0]), P(pts[0][1]));
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(P(pts[i][0]), P(pts[i][1]), P(mx), P(mz));
      }
      const l = pts[pts.length - 1]; ctx.lineTo(P(l[0]), P(l[1])); ctx.stroke(); ctx.globalAlpha = 1;
    };
    // 길 색: 하얀 유니코가 묻히지 않게 따뜻한 황토 (예전 크림색은 화면 아래 1/3 을 하얗게 날림)
    soft(M(0.9), () => { for (const p of LAYOUT.paths) stroke(p.pts, p.w + 1.2, '#9f7b4b', 0.55); });
    soft(M(0.35), () => { for (const p of LAYOUT.paths) stroke(p.pts, p.w, '#b48c58', 1); });
    // 바퀴 자국/자갈
    for (const p of LAYOUT.paths) {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 6);
        for (let k = 0; k < n; k++) {
          const t = k / n, x = ax + (bx - ax) * t + (rnd() - 0.5) * p.w * 0.8, z = az + (bz - az) * t + (rnd() - 0.5) * p.w * 0.8;
          ctx.fillStyle = rnd() > 0.5 ? 'rgba(130,100,64,0.45)' : 'rgba(232,212,172,0.3)';
          ctx.beginPath(); ctx.arc(P(x), P(z), M(0.04 + rnd() * 0.07), 0, 7); ctx.fill();
        }
      }
    }
    // 길 가장자리: 잔디 덩이를 길 안팎으로 흩뿌려 매끈한 띠 대신 닳은 풀 경계로
    for (const p of LAYOUT.paths) {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
        const n = Math.ceil(len * 3.2);
        for (let k = 0; k < n; k++) {
          const t = (k + rnd()) / n, side = rnd() > 0.5 ? 1 : -1, off = side * (p.w / 2 + (rnd() - 0.6) * 0.7);
          const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off, r = M(0.1 + rnd() * 0.22);
          ctx.fillStyle = `hsla(${86 + rnd() * 18}, ${42 + rnd() * 16}%, ${40 + rnd() * 12}%, ${0.45 + rnd() * 0.35})`;
          ctx.beginPath(); ctx.ellipse(P(x), P(z), r, r * (0.45 + rnd() * 0.4), rnd() * 3, 0, 7); ctx.fill();
        }
      }
    }
    // 밭·트랙터 밭·논 바닥 (흙)
    const L = LAYOUT, f = L.farm;
    soft(M(0.5), () => {
      ctx.fillStyle = '#7a5a3a';
      const fw = (f.cols * f.tile) / 2 + 0.6, fh = (f.rows * f.tile) / 2 + 0.6;
      ctx.fillRect(P(f.origin.x - fw), P(f.origin.z - fh), M(fw * 2), M(fh * 2));
      const fd = L.field;
      ctx.fillStyle = '#9c7a4a';
      ctx.fillRect(P(fd.x0 - 1), P(fd.z0 - 1), M(fd.cols * fd.cell + 2), M(fd.rows * fd.cell + 2));
      const pd = L.paddy, pw = pd.cols * pd.size + (pd.cols + 1) * pd.bund, ph = pd.rows * pd.size + (pd.rows + 1) * pd.bund;
      ctx.fillStyle = '#8a6b47';
      ctx.fillRect(P(pd.x0 - 0.4), P(pd.z0 - 0.4), M(pw + 0.8), M(ph + 0.8));
      // KOAT 체험관 광장
      const kp = L.koat.plaza;
      ctx.fillStyle = '#cfc9bb'; // 흙 디테일이 연두 대신 밝기만 곱해져 밝아진 만큼 한 단계 낮춤
      ctx.fillRect(P(kp[0]), P(kp[1]), M(kp[2] - kp[0]), M(kp[3] - kp[1]));
      // 연못 모래 테두리
      ctx.fillStyle = '#d0b886';
      ctx.beginPath(); ctx.arc(P(L.pond.x), P(L.pond.z), M(L.pond.r + 0.9), 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(P(L.lake.x), P(L.lake.z), M(L.lake.r + 1.1), 0, 7); ctx.fill();
    });
    // 광장 줄눈 + 중앙 엠블럼 원
    {
      const kp = L.koat.plaza;
      ctx.strokeStyle = 'rgba(120,110,95,0.35)'; ctx.lineWidth = Math.max(1, M(0.04));
      for (let x = kp[0]; x <= kp[2]; x += 1.2) { ctx.beginPath(); ctx.moveTo(P(x), P(kp[1])); ctx.lineTo(P(x), P(kp[3])); ctx.stroke(); }
      for (let z = kp[1]; z <= kp[3]; z += 1.2) { ctx.beginPath(); ctx.moveTo(P(kp[0]), P(z)); ctx.lineTo(P(kp[2]), P(z)); ctx.stroke(); }
      const cx = (kp[0] + kp[2]) / 2, cz = -26.3;
      ctx.fillStyle = '#30b6aa'; ctx.beginPath(); ctx.arc(P(cx), P(cz), M(2.6), 0, 7); ctx.fill();
      ctx.fillStyle = '#e9f7f5'; ctx.beginPath(); ctx.arc(P(cx), P(cz), M(2.1), 0, 7); ctx.fill();
      ctx.fillStyle = '#6dbb4f'; ctx.beginPath(); ctx.arc(P(cx), P(cz), M(0.9), 0, 7); ctx.fill();
    }
    // 굽는 AO: 나무·건물·소품 밑을 부드럽게 어둡게
    soft(M(0.6), () => {
      for (const a of this.aoSpots) {
        ctx.fillStyle = `rgba(30,45,20,${a.k})`;
        ctx.beginPath(); ctx.ellipse(P(a.x), P(a.z), M(a.rx), M(a.rz ?? a.rx), 0, 0, 7); ctx.fill();
      }
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.groundMat.map = tex;
    this.groundMat.needsUpdate = true;
    // 잔디 배치용 '맨땅' 마스크 (저해상도)
    const ms = 256, mc = document.createElement('canvas');
    mc.width = mc.height = ms;
    const mx = mc.getContext('2d');
    mx.drawImage(c, 0, 0, ms, ms);
    this.groundPixels = mx.getImageData(0, 0, ms, ms).data;
    this.maskSize = ms;
  }

  /** 지면 색이 흙(길/밭)인가 — 잔디·꽃 배치 제외용 */
  isBare(x, z) {
    if (!this.groundPixels) return false;
    const G = this.groundSize, ms = this.maskSize;
    const px = Math.floor(((x + G / 2) / G) * ms), pz = Math.floor(((z + G / 2) / G) * ms);
    if (px < 0 || pz < 0 || px >= ms || pz >= ms) return false;
    const i = (pz * ms + px) * 4, r = this.groundPixels[i], g = this.groundPixels[i + 1];
    return r > g * 0.95; // 잔디는 g 가 r 보다 확실히 큼
  }

  /** 흙길 위인가 (길 중심선에서 폭/2 + pad 안). _decorate 는 지면을 칠하기 전이라 isBare 대신 이것으로 나무·바위·덤불을 길에서 비킴 */
  onPath(x, z, pad = 0) {
    return pathNear(x, z, pad);
  }

  /** forGrass: 풀 심을 때는 '나무만 막는' 자리(5번째 값 'trees')는 비워 두지 않음 */
  isReserved(x, z, pad = 0, forGrass = false) {
    return LAYOUT.reserved.some(([x0, z0, x1, z1, only]) => !(forGrass && only === 'trees') && x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
  }

  // ------------------------------------------------------------ 배치
  place(name, x, z, rotY = 0, scale = 1, { collide = true, r = null, dynamic = false } = {}) {
    const m = this.assets.clone(name);
    const gy = heightAt(x, z);
    m.position.set(x, gy > 0 ? gy - 0.08 : 0, z); // 비탈에서는 살짝 묻어 뜨지 않게
    m.rotation.y = rotY;
    m.scale.setScalar(scale);
    this.scene.add(m);
    if (!dynamic && !DYNAMIC.has(name)) this.staticObjs.push(m);
    const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()), cc = bb.getCenter(new THREE.Vector3());
    (this.placed ||= []).push({ name, x: cc.x, z: cc.z, hx: sz.x / 2, hz: sz.z / 2, h: sz.y, collide }); // 배치 점검용 기록
    if (name !== 'cloud' && sz.y > 0.4) this.aoSpots.push({ x: cc.x, z: cc.z, rx: sz.x * 0.62 + 0.25, rz: sz.z * 0.62 + 0.25, k: Math.min(0.42, 0.16 + sz.y * 0.05) });
    if (collide) {
      const box = bb;
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      if (r !== null) this.obstacles.push({ x: c.x, z: c.z, r });
      else if (Math.max(size.x, size.z) > 3.5) this.boxes.push({ x0: box.min.x + 0.2, z0: box.min.z + 0.2, x1: box.max.x - 0.2, z1: box.max.z - 0.2 });
      else this.obstacles.push({ x: c.x, z: c.z, r: Math.max(size.x, size.z) * 0.38 });
    }
    return m;
  }

  _decorate() {
    const L = LAYOUT;
    const rnd = mulberry32(42);
    // 장터 / 우물 / 표지판
    this.place('market', L.market.x, L.market.z, 0);
    this.place('well', L.well.x, L.well.z, 0.4);
    this.townSign = this.signText(this.place('sign', -1.9, 5.8, 0.2, 1, { collide: false, dynamic: true }), '🦄 유니코 팜', '← 스마트팜 · 목장 →'); // 마을 별이 뜨면 다시 칠함
    this.signText(this.place('sign', 11, 11, -0.6, 1, { collide: false, dynamic: true }), '🚜 밭갈이', '트랙터 체험 →');
    this.place('wheelbarrow', -4, 5.5, 1.2, 1, { collide: false });
    // KayKit 소품 (CC0): 장터 옆 채소 상자·자루, 우물가 물동이, 새 마을 부지 입구 자재 더미
    if (this.assets.has('k_barrel')) {
      const K = 4.5, kp = (n, x, z, r = 0, k = K) => this.place(`k_${n}`, x, z, r, k, { collide: false });
      kp('crate_A_big', -2.4, -11.6, 0.3); kp('crate_open', -2.2, -12.7, 1.2); kp('sack', -3.2, -11.0, 0.5); kp('sack', -3.0, -12.2, 2.0); kp('barrel', 2.6, -11.9, 0);
      kp('bucket_water', L.well.x + 1.1, L.well.z + 0.8, 0.4); kp('barrel', L.well.x - 1.2, L.well.z - 0.9, 0.8);
      const T = L.town.sign;
      kp('pallet', T.x + 1.6, T.z - 1.4, 0.2); kp('sack', T.x + 1.4, T.z - 1.3, 0.4); kp('sack', T.x + 1.9, T.z - 1.6, 1.4); kp('sack', T.x + 1.6, T.z - 1.45, 0.9, K * 0.9);
      kp('barrel', T.x - 1.5, T.z - 1.2, 0); kp('barrel', T.x - 2.0, T.z - 0.8, 0.6); kp('resource_lumber', T.x + 0.4, T.z - 2.3, 0.5);
    }
    // 목장 (CC0 Quaternius 농장 건물)
    this.place('barn', L.barn.x, L.barn.z, 0, 0.9);
    this.place('silo', L.silo.x, L.silo.z, 0, 0.85, { r: 1.3 });
    this.place('coop', L.coop.x, L.coop.z, Math.PI, 0.85);
    if (this.assets.has('water_tower')) this.place('water_tower', L.waterTower.x, L.waterTower.z, 0.3, 0.9, { r: 1.1 });
    if (this.assets.has('open_barn')) this.place('open_barn', L.shed.x, L.shed.z, -Math.PI / 2, 1);
    if (this.assets.has('tower_windmill')) {
      const mill = this.place('tower_windmill', L.mill.x, L.mill.z, 0.6, 0.85, { r: 1.8 });
      const mb = mill.getObjectByName('Blades') || mill.children[0]?.children.find((c) => /^Blades/.test(c.name));
      if (mb) this.animated.push({ update: (dt) => (mb.rotation.z -= dt * (0.25 + (this.weatherCur?.wind || 0) * 1.5)) });
    }
    this.place('trough', L.trough.x, L.trough.z, 0);
    for (let i = 0; i < 4; i++) this.place('hay_bale', 23 + (i % 2) * 1.1, -9 + Math.floor(i / 2) * 1.1, i * 0.3, 1, { collide: i < 2 });
    this._fenceRect(L.ranch.x0, L.ranch.z0, L.ranch.x1, L.ranch.z1, { gapX: null, gapZ: L.ranch.gate.z });
    this._fenceYard(L.tractorYard);
    // 스마트팜
    const sf = this.place('smartfarm', L.smartfarm.x, L.smartfarm.z, 0, 1, { collide: false });
    this.boxes.push({ x0: L.smartfarm.x - 4.2, z0: L.smartfarm.z - 4.6, x1: L.smartfarm.x + 4.2, z1: L.smartfarm.z + 4.6 });
    this.obstacles.push({ x: L.smartfarm.x + 5.5, z: L.smartfarm.z - 1, r: 1.2 }, { x: L.smartfarm.x + 5.5, z: L.smartfarm.z - 4, r: 0.9 });
    this.smartfarmModel = sf;
    sf.traverse((o) => { if (o.isMesh && o.material.emissiveIntensity > 0) this.lampMaterials.push(o.material); });
    // 풍차
    const wm = this.place('windmill', L.windmill.x, L.windmill.z, 0.5, 1, { r: 0.9 });
    const blades = wm.getObjectByName('Blades');
    if (blades) this.animated.push({ update: (dt) => (blades.rotation.z += dt * (0.5 + (this.weatherCur?.wind || 0) * 4)) });
    // 드론: 스마트팜 위를 선회
    const drone = this.place('drone', L.smartfarm.x, L.smartfarm.z, 0, 1, { collide: false });
    const rotors = [1, 2, 3, 4].map((i) => drone.getObjectByName(`Rotor${i}`)).filter(Boolean);
    let dt0 = 0;
    this.animated.push({ update: (dt) => {
      dt0 += dt;
      drone.position.set(L.smartfarm.x + Math.cos(dt0 * 0.4) * 6, 3.2 + Math.sin(dt0 * 1.3) * 0.3, L.smartfarm.z + Math.sin(dt0 * 0.4) * 5);
      drone.rotation.y = -dt0 * 0.4;
      drone.rotation.z = 0.15;
      for (const r of rotors) r.rotation.y += dt * 40;
    } });
    this.drone = drone;
    // 나무 / 수풀 / 꽃 / 바위 (경계 링 + 군데군데)
    // CC0 자연물(q_nature)이 있으면 변형을 섞어 숲을 다채롭게, 없으면 기존 모델
    const Q = this.assets.has('tree_1');
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const treeName = (edge) => {
      if (!Q) return rnd() > 0.35 ? 'tree' : 'pine';
      const r = rnd();
      if (r < 0.42) return pick(['tree_1', 'tree_2', 'tree_3', 'tree_4', 'tree_5']);
      if (r < (edge ? 0.72 : 0.6)) return pick(['pine_1', 'pine_2', 'pine_3']);
      if (r < 0.82) return pick(['birch_1', 'birch_2', 'birch_3']);
      return pick(['autumn_1', 'autumn_2', 'autumn_3']); // 단풍 포인트 색
    };
    const treeScale = (n) => (!Q || n === 'tree' || n === 'pine' ? 1 : /^pine/.test(n) ? 1.45 : 1.35);
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * Math.PI * 2 + rnd() * 0.1;
      const r = L.bounds - 2 + rnd() * 6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.isReserved(x, z, 1.5) || this.isBlocked(x, z, 2.0) || this.onPath(x, z, 1.4)) continue; // 나무끼리 겹치지 않게 간격, 길 위·길가 바로 옆은 비움
      const n = treeName(true);
      this.place(n, x, z, rnd() * 6.28, (0.9 + rnd() * 0.5) * treeScale(n), { r: 0.6 });
    }
    const spots = [[-8, -6], [-5, -9], [-11, 13], [-28, -2], [30, 14], [20, 22], [-30, 22], [35.8, -4], [-18, 24], [-20, -18.5]]; // (-20,4)·(-22,10) 은 새 마을 길·부지와 겹쳐 뺌, 방앗간 앞 (-14,-18) 은 옆으로
    for (const [x, z] of spots) { if (this.isBlocked(x, z, 1.0) || this.isReserved(x, z, 0) || this.onPath(x, z, 1.4)) continue; const n = Q ? pick(['tree_1', 'tree_2', 'tree_3', 'tree_4', 'tree_5', 'birch_1', 'birch_2', 'autumn_1']) : treeName(false); this.place(n, x, z, rnd() * 6.28, (0.9 + rnd() * 0.4) * treeScale(n), { r: 0.6 }); }
    // 연못가 버드나무
    if (Q) for (const [x, z] of [[-17.6, 15.5], [-16.5, 21.8]]) if (!this.isBlocked(x, z, 1.6)) this.place(rnd() > 0.5 ? 'willow_1' : 'willow_2', x, z, rnd() * 6.28, 1.35, { r: 0.6 });
    // 연잎 (낚시 데크 반대편)
    if (Q) for (const [dx, dz, s] of [[-2.6, 1.2, 0.8], [-1.6, 2.6, 0.6], [-3.1, -0.6, 0.7], [-0.4, 3.3, 0.55], [1.4, 3.0, 0.65]]) {
      const lp = this.place('lilypad', L.pond.x + dx, L.pond.z + dz, rnd() * 6.28, s, { collide: false });
      lp.position.y = 0.05; // 정적 병합 전에 수면 위로
    }
    for (let i = 0; i < 26; i++) {
      const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 70;
      if (this.isBlocked(x, z, 2.5) || this.isReserved(x, z, 1) || this.onPath(x, z, 0.6) || Math.hypot(x, z) < 12) continue;
      const n = !Q ? (rnd() > 0.5 ? 'bush' : 'flowers') : pick(['bush_1', 'bush_2', 'berrybush_1', 'berrybush_2', 'flowers', 'flowers_q', 'plant_1', 'plant_2', 'plant_3']);
      this.place(n, x, z, rnd() * 6.28, Q && /bush/.test(n) ? 1.1 : 1, { collide: false });
    }
    for (let i = 0; i < 10; i++) {
      const x = (rnd() - 0.5) * 60, z = (rnd() - 0.5) * 60;
      if (this.isBlocked(x, z, 2.5) || this.isReserved(x, z, 1) || this.onPath(x, z, 0.6) || Math.hypot(x, z) < 14) continue;
      this.place(Q ? pick(['rock_1', 'rock_2', 'rock_3', 'mossrock_1', 'mossrock_2', 'mossrock_3']) : 'rock', x, z, rnd() * 6.28, 0.8 + rnd() * 0.6);
    }
    // 숲 가장자리 소품: 그루터기, 통나무, 덤불
    if (Q) for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, r = L.bounds - 6 + rnd() * 5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.isBlocked(x, z, 1.9) || this.isReserved(x, z, 1) || this.onPath(x, z, 0.6)) continue; // 지나갈 틈(1.6m 이상) 남기기
      const n = pick(['stump', 'stump_moss', 'log', 'log_moss', 'plant_4', 'plant_5', 'bush_1', 'mossrock_4', 'grass_q', 'grass_q2']);
      this.place(n, x, z, rnd() * 6.28, 1, { collide: /log|stump/.test(n) });
    }
    // 소품 (가로등은 밤에 켜짐)
    this.lampGlows = [];
    this.lampHeads = []; // 가로등 불빛 자리 (물에 비친 빛줄기)
    for (const [name, x, z, rot] of L.props) {
      const m = this.place(name, x, z, rot, 1, { r: name === 'lamp' ? 0.25 : name === 'bench' ? 0.7 : name === 'planter' ? 0.55 : 0.4 });
      if (name !== 'lamp') continue;
      const head = new THREE.Box3();
      m.updateMatrixWorld(true);
      m.traverse((o) => {
        if (!o.isMesh || !(o.material.emissiveIntensity > 0)) return;
        if (!this.lampGlows.includes(o.material)) this.lampGlows.push(o.material);
        head.expandByObject(o);
      });
      const hb = head.isEmpty() ? new THREE.Box3().setFromObject(m) : head;
      const c = hb.getCenter(new THREE.Vector3());
      this.lampHeads.push(new THREE.Vector3(c.x, head.isEmpty() ? hb.max.y * 0.92 : c.y, c.z));
    }
    // 밤 가로등 불빛 웅덩이: 바닥에 부드러운 따뜻한 빛 (실제 광원 대신 가산 혼합 원판 → 가벼움)
    const poolTex = radialTexture();
    this.lampPools = [];
    const inWaterCircle = (x, z) => [L.pond, L.lake].some((w) => Math.hypot(x - w.x, z - w.z) < w.r);
    for (const [name, x, z] of L.props) {
      if (name !== 'lamp' || inWaterCircle(x, z)) continue; // 부두 위 가로등: 빛 웅덩이가 물 위에만 떠 보여서 빼고 수면 빛줄기로
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffc06a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.02, z); // 수면(0.03) 아래 → 물가 가로등 빛이 물 위로 번져 보이지 않음
      pool.renderOrder = 1;
      this.scene.add(pool);
      this.lampPools.push(pool);
    }
    // 양 몰이 우리 (서쪽 입구만 열림)
    const P = L.herd.pen;
    for (let x = P.x0 + 1; x < P.x1; x += 2) { this.place('fence', x, P.z0, 0, 1, { collide: false }); this.place('fence', x, P.z1, 0, 1, { collide: false }); }
    for (let z = P.z0 + 1; z < P.z1; z += 2) this.place('fence', P.x1, z, Math.PI / 2, 1, { collide: false });
    const t = 0.25;
    this.boxes.push({ x0: P.x0 - t, z0: P.z0 - t, x1: P.x1 + t, z1: P.z0 + t }, { x0: P.x0 - t, z0: P.z1 - t, x1: P.x1 + t, z1: P.z1 + t }, { x0: P.x1 - t, z0: P.z0, x1: P.x1 + t, z1: P.z1 });
    this.herdSign = this.place('sign', L.herd.sign.x, L.herd.sign.z, 0.6, 1, { collide: false, dynamic: true });
    this.signText(this.herdSign, '🐑 양 몰이', '양을 우리에 넣어요 →');
    this.place('scarecrow', L.scarecrow.x, L.scarecrow.z, 0.4, 1, { r: 0.35 });
    this.place('dock', L.dock.x, L.dock.z, L.dock.rot, 1, { collide: false });
    this._lake(Q, rnd);
    this._mountains();
    this.sun.position.set(30, 50, 20);
  }

  /** 유니코 낚시터: 물에 뜬 나무 부두, 나룻배, 물가 돌·갈대·연잎 (모두 정적 → 병합) */
  _lake(Q, rnd) {
    const K = LAYOUT.lake;
    const wood = new THREE.MeshStandardMaterial({ color: 0xb08457, roughness: 0.85 });
    const woodD = new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.9 });
    const planks = [], beams = [];
    const TOP = 0.08; // 데크 윗면 (수면 0.03 위로 살짝: 물에 뜬 부두)
    for (const [i, b] of K.pier.entries()) {
      const w = b.x1 - b.x0;
      for (let z = b.z0 + 0.15; z < b.z1 - 0.1; z += 0.3) {
        const pl = new THREE.BoxGeometry(w - 0.04, 0.07, 0.26);
        pl.translate((b.x0 + b.x1) / 2 + (rnd() - 0.5) * 0.03, TOP - 0.035, z);
        planks.push(pl);
      }
      // 옆 테두리 보 + 기둥 (2m 간격)
      for (const x of [b.x0 + 0.05, b.x1 - 0.05]) {
        beams.push(new THREE.BoxGeometry(0.1, 0.12, b.z1 - b.z0).translate(x, TOP - 0.1, (b.z0 + b.z1) / 2));
        for (let z = b.z0 + (i ? 0.1 : 1.6); z <= b.z1; z += 2) beams.push(new THREE.CylinderGeometry(0.07, 0.08, 0.75, 8).translate(x, 0.1, z));
      }
    }
    const deck = new THREE.Mesh(mergeGeometries(planks), wood); // 상자·원기둥은 모두 인덱스가 있어 그대로 합침
    const frame = new THREE.Mesh(mergeGeometries(beams), woodD);
    const pier = new THREE.Group();
    pier.add(deck, frame);
    this.scene.add(pier);
    this.staticObjs.push(pier);
    // 나룻배 (부두 끝 서쪽에 매어 둠)
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.8, side: THREE.DoubleSide }));
    hull.scale.set(0.62, 0.32, 1.45);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 28), woodD);
    rim.rotation.x = Math.PI / 2; rim.scale.set(0.62, 1.45, 1);
    // 배 바닥은 수면(0.03)보다 6cm 위 → 배 안에 호수 물이 비치지 않음. 그 높이의 선체 폭에 맞춰 바닥을 넓힘
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.06, 0.28), wood);
    seat.position.y = 0.0;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshStandardMaterial({ color: 0x5e3c22, roughness: 0.9 }));
    inner.rotation.x = -Math.PI / 2; inner.scale.set(0.59, 1.39, 1); inner.position.y = -0.07;
    // 노 한 자루: 배 길이 방향으로 좌석에 걸쳐 놓고 날은 뒤쪽 바닥 쪽으로
    const oarGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.022, 0.022, 1.3, 6).rotateX(Math.PI / 2),
      new THREE.BoxGeometry(0.12, 0.022, 0.32).translate(0, 0, 0.8),
    ]);
    const oar = new THREE.Mesh(oarGeo, wood);
    oar.position.set(0.17, 0.0, 0.05); oar.rotation.set(0.07, 0.06, 0);
    boat.add(hull, rim, seat, inner, oar);
    boat.position.set(K.pier[1].x0 - 1.0, 0.16, (K.pier[1].z0 + K.pier[1].z1) / 2 - 0.4);
    boat.rotation.y = 0.15;
    this.scene.add(boat);
    this.staticObjs.push(boat);
    // 뱃머리에서 부두 기둥까지 느슨한 밧줄
    boat.updateMatrixWorld(true);
    const bow = new THREE.Vector3(0, 0.03, -1.43).applyMatrix4(boat.matrixWorld), post = new THREE.Vector3(K.pier[1].x0 + 0.05, 0.4, K.pier[1].z0 + 0.1); // 부두 첫 기둥
    const sag = new THREE.QuadraticBezierCurve3(bow, bow.clone().lerp(post, 0.5).setY(0.1), post);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(sag, 8, 0.016, 4), new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.9 }) /* 짙은 나무와 같은 거칠기 → 같은 정적 묶음 */);
    this.scene.add(rope);
    this.staticObjs.push(rope);
    // 물가: 돌, 갈대, 연잎 (부두 자리는 비움)
    const nearPier = (x, z) => K.pier.some((b) => x > b.x0 - 1.2 && x < b.x1 + 1.2 && z > b.z0 - 1.2 && z < b.z1 + 1.2);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + rnd() * 0.12, rr = K.r + 0.15 + rnd() * 0.3;
      const x = K.x + Math.cos(a) * rr, z = K.z + Math.sin(a) * rr;
      if (nearPier(x, z)) continue;
      if (Q && i % 3 === 0) this.place(pick3(rnd, ['plant_1', 'plant_2', 'grass_q', 'grass_q2']), x + Math.cos(a) * 0.4, z + Math.sin(a) * 0.4, rnd() * 6.28, 1.1, { collide: false });
      else this.place(Q ? pick3(rnd, ['rock_1', 'rock_2', 'mossrock_1', 'mossrock_2']) : 'rock', x, z, rnd() * 6.28, 0.45 + rnd() * 0.3, { collide: false });
    }
    if (Q) {
      for (const [dx, dz, sc] of [[3.4, 2.6, 0.9], [4.1, 1.2, 0.7], [2.6, 3.8, 0.75], [-3.8, 3.2, 0.8], [-4.4, 1.6, 0.6], [3.2, -3.4, 0.7], [-2.2, 4.6, 0.65]]) {
        const lp = this.place('lilypad', K.x + dx, K.z + dz, rnd() * 6.28, sc, { collide: false });
        lp.position.y = 0.05;
      }
      this.place('willow_1', K.x - K.r - 2.6, K.z + 3.8, 1, 1.4, { r: 0.6 });
      this.place('log_moss', K.x + K.r + 2.2, K.z + 4.6, 0.6, 1, { r: 0.6 });
      this.place('stump', K.x - K.r - 1.8, K.z - 2.6, 0, 1, { r: 0.4 });
    }
  }

  /**
   * 정적 장식을 한 메시로 병합 (technical-art: 반복 소품은 묶어서 그리기).
   * 단색 재질은 모델 파일이 달라도 (질감 종류·거칠기·금속성)이 같으면 정점 색으로 한 번에 그림.
   * 발광·투명·텍스처 재질은 재질 객체별로 따로 (밤 조명 밝기 조절 등).
   */
  _batchStatic() {
    const buckets = new Map();
    const plain = (m) => m.isMeshStandardMaterial && !m.map && !m.transparent && !(m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01);
    const size = new THREE.Vector3();
    for (const o of this.staticObjs) {
      o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o);
      // 키 작은 장식(풀·꽃·덤불·작은 돌·연잎)은 그림자를 드리우지 않는 묶음으로 → 그림자 패스 삼각형 감소
      const small = (o.userData.h ??= bb.getSize(size).y) < 0.7;
      // 칸은 물체 중심으로 정함 → 한 물체의 부품은 같은 칸에 (칸 경계에서 갈라지지 않게)
      const ocx = (bb.min.x + bb.max.x) / 2, ocz = (bb.min.z + bb.max.z) / 2;
      const cell = cellKey(ocx, ocz, STATIC_CELL);
      o.traverse((m) => {
        if (!m.isMesh) return;
        const mat = m.material, vc = plain(mat);
        const key = (small ? 'ns|' : '') + (vc ? `vc|${mat.userData.enhanced || 'none'}|${mat.roughness.toFixed(2)}|${mat.metalness.toFixed(2)}|${mat.side}|${mat.toneMapped}` : mat.uuid);
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat, vc, small, cells: new Map() }));
        let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        const src = mat.vertexColors ? g.attributes.color : null;
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
        // 잎 묶음: 정점마다 (계절 역할 + 나무 난수) → 합친 숲도 나무 하나가 한 색 (역할 없는 작물·꽃은 0 = 물들지 않음)
        // (질감·투명 잎도 재질별 묶음에서 같은 속성을 씀: 합친 메시의 원점은 하나라 위치 난수로는 나무를 못 가름)
        if (mat.userData.enhanced === 'foliage') g.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(leafAttrValue(mat.userData.leafRole || 0, ocx, ocz)), 1));
        // 인덱스는 그대로 둠 (공유 정점 재사용 → 정점 수·메모리 약 절반). 법선이 없으면 예전처럼 면마다 각진 법선
        if (!g.attributes.normal) { if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); }
        if (!g.index) g.setIndex(seqIndex(g.attributes.position.count)); // 한 묶음 안에서 모두 인덱스가 있어야 합칠 수 있음
        if (vc) { // 재질 색 × (있으면) 원래 정점 색
          const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = mat.color;
          const sc = mat.vertexColors && g.attributes.color;
          for (let i = 0; i < n; i++) {
            arr[i * 3] = c.r * (sc ? sc.getX(i) : 1); arr[i * 3 + 1] = c.g * (sc ? sc.getY(i) : 1); arr[i * 3 + 2] = c.b * (sc ? sc.getZ(i) : 1);
          }
          g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        } else if (!src) g.deleteAttribute('color');
        let list = b.cells.get(cell);
        if (!list) b.cells.set(cell, (list = { geos: [], tris: 0 }));
        list.geos.push(g);
        list.tris += g.index.count / 3;
      });
      this.scene.remove(o);
    }
    let n = 0;
    for (const { mat, vc, small, cells } of buckets.values()) {
      let material = mat; // 재질은 묶음마다 하나 (칸 메시들이 공유 → 셰이더 전환·계절 잎 재질 수 그대로)
      if (vc) {
        material = mat.clone();
        material.color.set(0xffffff);
        material.vertexColors = true;
        const kind = mat.userData.enhanced;
        material.userData = kind === 'foliage' ? { leafAttr: true } : {};
        if (kind) enhanceMaterial(material, kind);
      } else if (mat.userData.enhanced === 'foliage' && !mat.userData.leafAttr) {
        // 재질별 잎 묶음: 정점 속성(aLeaf)을 읽는 복제 재질로
        material = mat.clone();
        material.userData = { ...mat.userData, leafAttr: true };
        delete material.userData.enhanced;
        enhanceMaterial(material, 'foliage');
      }
      const tris = new Map([...cells].map(([k, v]) => [k, v.tris]));
      for (const keys of planStaticGroups(tris)) {
        const geos = keys.flatMap((k) => cells.get(k).geos);
        const merged = mergeGeometries(geos, false);
        if (!merged) { console.warn('정적 병합 실패:', mat.name, geos.length); continue; }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = !small; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.scene.add(mesh);
        n++;
      }
    }
    this.staticObjs = [];
    this.batchCount = n;
  }

  /** 표지판(sign 모델) 앞면에 글자 붙이기 — 위 판: 큰 글씨, 아래 판: 작은 글씨 */
  signText(m, title, sub) {
    const tex = (text, w, h, size, bg) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      const st = { text, stars: '' };
      const fontOf = (px) => `900 ${px}px 'Unico Coin', Jua, "Noto Sans KR", sans-serif`;
      const paint = () => {
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.fillStyle = '#4a2f1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
        // 별 줄이 있으면: 이름은 위에 조금 작게, 아래에 큰 금빛 별 (기본 거리에서도 보이게)
        const sz = st.stars ? Math.round(size * 0.72) : size, ty = st.stars ? h * 0.3 : h / 2 + 2;
        g.font = fontOf(sz);
        // 판보다 길면 글자를 줄여 맞춤
        const tw = g.measureText(st.text).width, fit = tw > w * 0.92 ? Math.floor(sz * (w * 0.92) / tw) : sz;
        if (fit !== sz) g.font = fontOf(fit);
        g.fillText(st.text, w / 2, ty);
        if (st.stars) {
          g.font = `900 ${Math.round(h * 0.5)}px "Noto Sans KR", sans-serif`;
          // 채운 별은 금빛, 빈 별은 옅은 나무색 (한 글자씩)
          const cs = [...st.stars], cw = cs.map((ch) => g.measureText(ch).width), tot = cw.reduce((a, b) => a + b, 0);
          const k = Math.min(1, (w * 0.94) / tot);
          let x = w / 2 - (tot * k) / 2;
          g.lineWidth = 6; g.lineJoin = 'round'; g.textAlign = 'left';
          g.save(); g.translate(x, h * 0.72); g.scale(k, 1); x = 0;
          cs.forEach((ch, i) => {
            const on = ch === '★';
            g.strokeStyle = on ? '#8f5b00' : '#b59a6a'; g.fillStyle = on ? '#ffc93c' : '#efe4cc';
            g.strokeText(ch, x, 0); g.fillText(ch, x, 0);
            x += cw[i];
          });
          g.restore(); g.textAlign = 'center';
        }
      };
      paint();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      whenFontReady(fontOf(size), text, () => { paint(); t.needsUpdate = true; }); // 한글 조각이 늦게 오면 다시 칠함 (캔버스 크기는 그대로)
      t.userData.set = (v, stars = st.stars) => { if (v === st.text && stars === st.stars) return; st.text = v; st.stars = stars || ''; paint(); t.needsUpdate = true; whenFontReady(fontOf(size), v, () => { paint(); t.needsUpdate = true; }); };
      return t;
    };
    const maps = [];
    const mk = (text, w, h, y, rz, bg, size) => {
      const map = tex(text, 512, Math.round(512 * h / w), size, bg);
      maps.push(map);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
      pl.position.set(0, y, 0.115);
      pl.rotation.z = rz;
      m.add(pl);
    };
    mk(title, 1.16, 0.46, 1.2, 0, '#f5efe0', 92);
    if (sub) mk(sub, 0.86, 0.31, 0.75, -0.14, '#e8c872', 54);
    // 다시 칠하기 손잡이: 같은 캔버스에 새 글 (판 크기는 그대로)
    return { repaint: (t, sb, stars = '') => { if (t) maps[0].userData.set(t, stars); if (sb && maps[1]) maps[1].userData.set(sb); }, mesh: m };
  }

  /** 마을 별 1개 깃발: 표지판 꼭대기 ↔ 가로등 팔에 묶은 늘어진 줄 + 삼각 깃발 (깃발 InstancedMesh 하나 + 줄 Line 하나, 낮은 품질에선 숨김) */
  setBunting(on) {
    this._buntingOn = !!on;
    if (on && !this.bunting) {
      const head = this.lampHeads?.find((v) => Math.abs(v.x - 3.4) < 0.6 && Math.abs(v.z - 7.6) < 0.6);
      // 줄 끝: 표지판 판의 가로등 쪽 윗모서리, 가로등 머리 아래 팔
      let A = new THREE.Vector3(-1.3, 1.44, 5.9);
      const sm = this.townSign?.mesh;
      if (sm) { sm.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(sm); A = new THREE.Vector3(bb.max.x - 0.06, bb.max.y - 0.03, (bb.min.z + bb.max.z) / 2); }
      const B = head ? new THREE.Vector3(head.x, head.y - 0.18, head.z) : new THREE.Vector3(3.3, 2.5, 7.6);
      B.x -= Math.sign(B.x - A.x) * 0.12; // 가로등 기둥 바로 옆 (팔 끝)
      const SAG = 0.42, N = 13;
      const at = (t, out) => { out.lerpVectors(A, B, t); out.y -= Math.sin(t * Math.PI) * SAG; return out; };
      // 줄: 늘어진 곡선
      const pts = [];
      for (let i = 0; i <= 24; i++) pts.push(at(i / 24, new THREE.Vector3()));
      const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x4a3424 }));
      rope.matrixAutoUpdate = false;
      // 깃발: 윗변이 줄에 붙은 삼각형
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0], 3));
      geo.computeVertexNormals();
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), N);
      const cols = [0xf25c54, 0xfac03e, 0x5bc0eb, 0x6dbb4f, 0xff9fb3, 0xb38cff];
      const c = new THREE.Color();
      this._bunt = { im, yaw: Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2, pos: [], o: new THREE.Object3D(), t: 0 };
      this._bunt.o.rotation.order = 'YXZ';
      for (let i = 0; i < N; i++) {
        this._bunt.pos.push(at((i + 0.5) / N, new THREE.Vector3()));
        im.setColorAt(i, c.setHex(cols[i % cols.length]));
      }
      this._swayBunting(0);
      im.castShadow = false; im.receiveShadow = false;
      im.matrixAutoUpdate = false;
      im.computeBoundingSphere();
      const grp = new THREE.Group();
      grp.add(im, rope);
      this.bunting = grp;
      this.scene.add(grp);
    }
    if (this.bunting) this.bunting.visible = this._buntingOn && this.quality?.level !== 'low';
  }

  /** 깃발 살랑임 (줄을 축으로 앞뒤로, 깃발마다 박자 다르게) */
  _swayBunting(dt) {
    const S = this._bunt;
    if (!S) return;
    S.t += dt;
    for (let i = 0; i < S.pos.length; i++) {
      S.o.position.copy(S.pos[i]);
      S.o.rotation.set(Math.sin(S.t * 1.6 + i * 0.9) * 0.22, S.yaw, (i % 2 ? 0.05 : -0.05));
      S.o.updateMatrix();
      S.im.setMatrixAt(i, S.o.matrix);
    }
    S.im.instanceMatrix.needsUpdate = true;
  }

  /** 동상 자리 빈자리 찾기 (실행 중에는 그새 놓은 꾸미기 소품 장애물까지 봄) */
  _statueSpot() {
    const clear = (x, z) => !this.isBlocked(x, z, 1.5) && !this.isReserved(x, z, 0.2)
      && !(this.placed || []).some((o) => Math.abs(o.x - x) < o.hx + 1.4 && Math.abs(o.z - z) < o.hz + 1.4)
      && !Object.values(LAYOUT.npcs).some((n) => Math.hypot(n.x - x, n.z - z) < 3) && !LAYOUT.orchard.some((t) => Math.hypot(t.x - x, t.z - z) < 3)
      && !LAYOUT.paths.some((p) => p.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < p.w / 2 + 1.3));
    return STATUE_SPOTS.find(([x, z]) => clear(x, z)) || STATUE_SPOTS[0];
  }

  /**
   * 마을 별 4개: 광장 유니코 동상 (주인공 모습: 큰 머리·짧은 주둥이·귀·소용돌이 갈기·꼬리 술·앞발 하나 듦, 금빛 뿔·발굽)
   * 세 단 받침 + 금빛 명판 + 꽃 고리. 모두 정점 색 한 메시 → 그리기 1번 (월드를 만들 때는 정적 묶음에 섞여 0번)
   * 낮은 품질: 그림자 없음, 면 수 줄임, 명판 글씨 생략
   */
  addStatue({ batch = false } = {}) {
    if (this.statue) return this.statue;
    const low = this.quality?.level === 'low';
    if (!batch) this.statueSpot = this._statueSpot(); // 그새 놓인 소품을 피해 다시 고름
    const [x, z] = this.statueSpot || STATUE_SPOTS[0];
    const k = low ? 0.5 : 1, seg = (n) => Math.max(5, Math.round(n * k));
    const C = { stone: 0xeee8dc, cream: 0xf6eedb, eye: 0x5a5148, base: 0x9c8f7c, base2: 0xb3a792, gold: 0xe6b84a, leaf: 0x6dbb4f, f1: 0xff9fb3, f2: 0xfac03e, f3: 0xffffff };
    const geos = [], col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const T = (px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(v.set(px, py, pz), q.setFromEuler(e.set(rx, ry, rz)), sc.set(sx, sy, sz));
    const add = (geo, hex, mat) => {
      geo.applyMatrix4(mat);
      for (const key of Object.keys(geo.attributes)) if (key !== 'position' && key !== 'normal') geo.deleteAttribute(key);
      col.setHex(hex);
      const n = geo.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
      geos.push(geo);
    };
    const ball = (r, hex, mat) => add(new THREE.SphereGeometry(r, seg(14), seg(10)), hex, mat);
    // 받침 세 단 + 금테
    add(new THREE.CylinderGeometry(1.12, 1.2, 0.26, seg(24)), C.base, T(0, 0.13, 0));
    add(new THREE.CylinderGeometry(0.94, 1.0, 0.3, seg(24)), C.base2, T(0, 0.41, 0));
    add(new THREE.CylinderGeometry(0.74, 0.8, 0.34, seg(24)), C.base, T(0, 0.73, 0));
    add(new THREE.TorusGeometry(0.75, 0.025, 5, seg(24)), C.gold, T(0, 0.9, 0, Math.PI / 2));
    // 금빛 명판 (앞쪽 가운데 단)
    add(new THREE.BoxGeometry(0.62, 0.2, 0.05), C.gold, T(0, 0.43, 0.98, -0.08));
    // 꽃 고리 (받침 둘레)
    const NF = low ? 10 : 18;
    for (let i = 0; i < NF; i++) {
      const a = (i / NF) * Math.PI * 2, r = 1.3;
      if (!low) add(new THREE.SphereGeometry(0.11, 6, 4), C.leaf, T(Math.sin(a) * r, 0.06, Math.cos(a) * r, 0, 0, 0, 1.2, 0.5, 1.2)); // 잎 (낮은 품질 생략)
      (low ? (r0, hx, m) => add(new THREE.SphereGeometry(r0, 5, 3), hx, m) : ball)(0.075, [C.f1, C.f2, C.f3][i % 3], T(Math.sin(a + 0.17) * (r + 0.02), 0.16, Math.cos(a + 0.17) * (r + 0.02)));
    }
    // 유니코 (받침 위 0.9m, 앞 = +Z)
    const Y = 0.9;
    ball(0.33, C.stone, T(0, Y + 0.56, -0.02, 0, 0, 0, 0.92, 0.86, 1.18)); // 통통한 몸
    for (const [lx, lz, up] of [[-0.15, 0.2, false], [0.15, 0.2, true], [-0.15, -0.24, false], [0.15, -0.24, false]]) {
      // 다리 (오른 앞다리는 들어 올림) + 금빛 발굽
      const leg = up ? T(lx, Y + 0.42, lz + 0.12, -1.05) : T(lx, Y + 0.2, lz);
      add(new THREE.CylinderGeometry(0.085, 0.075, 0.4, seg(10)), C.stone, leg);
      add(new THREE.CylinderGeometry(0.09, 0.095, 0.08, seg(10)), C.gold, leg.clone().multiply(T(0, -0.21, 0)));
    }
    add(new THREE.CylinderGeometry(0.15, 0.2, 0.36, seg(12)), C.stone, T(0, Y + 0.84, 0.2, 0.35)); // 목
    ball(0.38, C.stone, T(0, Y + 1.14, 0.3, 0, 0, 0, 1, 0.95, 0.95)); // 큰 머리
    ball(0.21, C.cream, T(0, Y + 1.04, 0.6, 0, 0, 0, 1.05, 0.82, 0.9)); // 짧은 주둥이
    for (const sx of [-1, 1]) {
      ball(0.045, C.eye, T(sx * 0.17, Y + 1.2, 0.62)); // 눈
      ball(0.025, C.eye, T(sx * 0.07, Y + 1.06, 0.79)); // 콧구멍
      add(new THREE.ConeGeometry(0.085, 0.24, seg(8)), C.stone, T(sx * 0.22, Y + 1.47, 0.18, -0.2, 0, -sx * 0.4)); // 귀
    }
    add(new THREE.ConeGeometry(0.07, 0.42, seg(10)), C.gold, T(0, Y + 1.58, 0.44, 0.45)); // 금빛 뿔
    add(new THREE.TorusGeometry(0.06, 0.018, 4, seg(10)), C.gold, T(0, Y + 1.5, 0.4, 0.45 + Math.PI / 2)); // 뿔 고리
    // 소용돌이 갈기 (머리 위에서 목 뒤로 쌓인 술) + 앞머리 고리
    for (const [ty, tz, r] of [[1.46, 0.22, 0.17], [1.36, 0.02, 0.16], [1.16, -0.1, 0.15], [0.94, -0.08, 0.13]]) ball(r, C.cream, T(0, Y + ty, tz));
    add(new THREE.TorusGeometry(0.1, 0.05, seg(6), seg(12)), C.cream, T(0, Y + 1.5, 0.08, 0, Math.PI / 2, 0));
    // 꼬리 술
    for (const [ty, tz, r] of [[0.66, -0.4, 0.13], [0.56, -0.54, 0.12], [0.42, -0.58, 0.1]]) ball(r, C.cream, T(0, Y + ty, tz));
    const geo = mergeGeometries(geos, false);
    geo.computeBoundingSphere();
    // 재질: 정점 색 (정적 묶음에서는 돌 재질 묶음과 합쳐짐)
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !low; mesh.receiveShadow = !low;
    const g = new THREE.Group();
    g.add(mesh);
    // 명판 글씨 (낮은 품질 생략, 그리기 1번)
    if (!low && typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = 256; c.height = 80;
      const x2 = c.getContext('2d'), font = `900 30px 'Unico Coin', Jua, "Noto Sans KR", sans-serif`, txt = '유니코 마을 ★★★★';
      const paint = () => { x2.fillStyle = '#e6b84a'; x2.fillRect(0, 0, 256, 80); x2.fillStyle = '#5a3a10'; x2.font = font; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(txt, 128, 42, 240); };
      paint();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      whenFontReady(font, txt, () => { paint(); t.needsUpdate = true; });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      pl.applyMatrix4(T(0, 0.43, 1.006, -0.08));
      g.add(pl);
    }
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = Math.atan2(-x * 0.8, 6); // 남쪽(카메라 쪽)을 보며 큰길로 살짝 돌아섬
    this.scene.add(g);
    if (batch) this.staticObjs.push(g);
    else { g.updateMatrixWorld(true); g.traverse((o) => { o.matrixAutoUpdate = false; }); }
    this.obstacles.push({ x, z, r: 1.3 });
    this.statue = g;
    return g;
  }

  /** 원경 산맥: 안개에 묻히지 않는 푸른 실루엣으로 깊이감 (대기 원근) */
  /**
   * 원경 산맥: 세 겹 능선(가까울수록 짙은 초록, 멀수록 하늘색으로 흐려지는 대기 원근감).
   * 매끈한 띠 메시 + 위로 갈수록 밝아지는 셰이더, 지평선 색은 하늘에서 매 프레임 받음
   */
  _mountains() {
    const rnd = mulberry32(77);
    const layers = [
      { r: 125, base: 10, amp: 16, col: 0x5f9a62, haze: 0.28, seed: 1.3 },
      { r: 165, base: 18, amp: 22, col: 0x6f97a8, haze: 0.5, seed: 4.1 },
      { r: 210, base: 26, amp: 30, col: 0x8fb0c8, haze: 0.72, seed: 7.7 },
    ];
    this.ridges = []; // Scenery 가 만들어진 뒤 넘겨받아 지평선 색을 맞춤
    layers.forEach((L, li) => {
      const N = 220, pos = [], hgt = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        // 여러 주파수 사인 합 → 부드러운 봉우리 (이음새 없게 정수 배 주파수)
        let h = L.base;
        for (const [f, w] of [[3, 0.5], [7, 0.3], [13, 0.18], [29, 0.08]]) h += L.amp * w * (0.5 + 0.5 * Math.sin(a * f + L.seed * f + rnd() * 0.02));
        const x = Math.cos(a) * L.r, z = Math.sin(a) * L.r;
        pos.push(x, -12, z, x, h, z);
        hgt.push(0, 1, 0, 1);
        if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('hgt', new THREE.Float32BufferAttribute(hgt.slice(0, pos.length / 3), 1));
      geo.setIndex(idx);
      geo.computeVertexNormals(); // 주변광 차폐(GTAO) 패스가 법선을 읽으므로 필요
      const mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(L.col) }, horizon: { value: new THREE.Color(0xd6eeff) }, haze: { value: L.haze } },
        vertexShader: 'attribute float hgt; varying float vH; varying float vY; void main(){ vH = hgt; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 color, horizon; uniform float haze; varying float vH; varying float vY;
          void main(){ float lift = smoothstep(-4.0, 40.0, vY);
            vec3 c = color * (0.85 + 0.25 * lift);
            float fogk = haze + (1.0 - haze) * (1.0 - smoothstep(-6.0, 24.0, vY)) * 0.55; // 산 아랫자락은 안개에 묻힘
            gl_FragColor = vec4(mix(c, horizon, clamp(fogk, 0.0, 0.95)), 1.0); }`,
        side: THREE.DoubleSide, fog: false, depthWrite: true,
      });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = -9 + li;
      m.frustumCulled = false;
      this.scene.add(m);
      this.ridges.push(mat);
    });
  }

  /** 트랙터 마당 울타리: 북쪽(z0)에 사람이 드나드는 문, 나머지는 막힘 (문은 트랙터도 지나갈 만큼 넓음) */
  _fenceYard(Y) {
    const { x0, z0, x1, z1, gate } = Y, g0 = gate.x - gate.w / 2, g1 = gate.x + gate.w / 2, t = 0.25;
    for (let x = x0 + 1; x < x1; x += 2) {
      if (x + 1 <= g0 || x - 1 >= g1) this.place('fence', x, z0, 0, 1, { collide: false });
      this.place('fence', x, z1, 0, 1, { collide: false });
    }
    for (let z = z0 + 1; z < z1; z += 2) { this.place('fence', x0, z, Math.PI / 2, 1, { collide: false }); this.place('fence', x1, z, Math.PI / 2, 1, { collide: false }); }
    // 문기둥 + 문 위 간판
    for (const gx of [g0, g1]) this.place('fence', gx, z0, Math.PI / 2, 0.5, { collide: false });
    this.boxes.push({ x0: x0 - t, z0: z0 - t, x1: g0, z1: z0 + t }, { x0: g1, z0: z0 - t, x1: x1 + t, z1: z0 + t });
    this.boxes.push({ x0: x0 - t, z0: z1 - t, x1: x1 + t, z1: z1 + t });
    this.boxes.push({ x0: x0 - t, z0, x1: x0 + t, z1 }, { x0: x1 - t, z0, x1: x1 + t, z1 });
  }

  _fenceRect(x0, z0, x1, z1, { gapZ = null } = {}) {
    const seg = 2;
    for (let x = x0 + 1; x < x1; x += seg) {
      this.place('fence', x, z0, 0, 1, { collide: false });
      this.place('fence', x, z1, 0, 1, { collide: false });
    }
    for (let z = z0 + 1; z < z1; z += seg) {
      this.place('fence', x1, z, Math.PI / 2, 1, { collide: false });
      if (gapZ !== null && Math.abs(z - gapZ) < 1.5) continue; // 출입구
      this.place('fence', x0, z, Math.PI / 2, 1, { collide: false });
    }
    // 울타리 충돌: 얇은 박스 4 개 (출입구 제외)
    const t = 0.25;
    this.boxes.push({ x0: x0 - t, z0: z0 - t, x1: x1 + t, z1: z0 + t });
    this.boxes.push({ x0: x0 - t, z0: z1 - t, x1: x1 + t, z1: z1 + t });
    this.boxes.push({ x0: x1 - t, z0: z0, x1: x1 + t, z1: z1 });
    if (gapZ === null) this.boxes.push({ x0: x0 - t, z0: z0, x1: x0 + t, z1: z1 });
    else {
      this.boxes.push({ x0: x0 - t, z0: z0, x1: x0 + t, z1: gapZ - 1.5 });
      this.boxes.push({ x0: x0 - t, z0: gapZ + 1.5, x1: x0 + t, z1: z1 });
    }
  }

  // ------------------------------------------------------------ 충돌
  /** 부두 데크 위인가 (가장자리 여유 pad) */
  onDeck(x, z, pad = 0) {
    for (const w of this.waters) for (const b of w.decks) if (x > b.x0 + pad && x < b.x1 - pad && z > b.z0 + pad && z < b.z1 - pad) return true;
    return false;
  }

  /** 물 위인가 (부두 위는 제외) */
  inWater(x, z, r = 0) {
    for (const w of this.waters) if (Math.hypot(x - w.x, z - w.z) < w.r + r && !w.decks.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) return true;
    return false;
  }

  /** 헤엄칠 수 있는 물(호수) 안인가 — 가장자리에서 pad 만큼 들어가야 수영 자세 */
  inSwimWater(x, z, pad = 0) {
    for (const w of this.waters) if (w.swim && Math.hypot(x - w.x, z - w.z) < w.r + 0.3 - pad && !w.decks.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) return true;
    return false;
  }

  isBlocked(x, z, r) {
    if (this.inWater(x, z, r)) return true;
    for (const o of this.obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true;
    for (const b of this.boxes) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    return false;
  }

  /** next 위치를 장애물 밖으로 밀어냄 (원형 캐릭터) */
  resolveCollision(next, r, { swim = false, player = false } = {}) {
    if (player && this.playerCollision) return this.playerCollision(next, r); // 실내 등 플레이어만 다른 규칙
    const B = LAYOUT.bounds - 1;
    next.x = THREE.MathUtils.clamp(next.x, -B, B);
    next.z = THREE.MathUtils.clamp(next.z, -B, B);
    // 물: 부두 위면 통과, 부두에서 막 벗어나려 하면 데크 안으로 되돌리고, 그 외에는 물가로 밀어냄
    for (const w of this.waters) {
      if (swim && w.swim) continue;
      const dx = next.x - w.x, dz = next.z - w.z, d = Math.hypot(dx, dz), min = w.r + r;
      if (d >= min) continue;
      const m = r * 0.5;
      if (w.decks.some((b) => next.x > b.x0 + m && next.x < b.x1 - m && next.z > b.z0 + m && next.z < b.z1 - m)) continue;
      let best = null, bd = 0.45;
      for (const b of w.decks) {
        const cx = THREE.MathUtils.clamp(next.x, b.x0 + m, b.x1 - m), cz = THREE.MathUtils.clamp(next.z, b.z0 + m, b.z1 - m);
        const dd = Math.hypot(cx - next.x, cz - next.z);
        if (dd < bd) { bd = dd; best = [cx, cz]; }
      }
      if (best) { next.x = best[0]; next.z = best[1]; continue; }
      if (d > 1e-4) { next.x = w.x + (dx / d) * min; next.z = w.z + (dz / d) * min; }
    }
    for (const o of this.obstacles) {
      if (!(o.r > 0)) continue; // 반지름 0 = 꺼진 장애물 (운전 중인 트랙터 자신 등) — 거리 0 근처에서 r 만큼 튕겨 내지 않게
      const dx = next.x - o.x, dz = next.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + r;
      if (d < min && d > 1e-4) { next.x = o.x + (dx / d) * min; next.z = o.z + (dz / d) * min; }
    }
    for (const b of this.boxes) {
      if (next.x > b.x0 - r && next.x < b.x1 + r && next.z > b.z0 - r && next.z < b.z1 + r) {
        const push = [
          { d: next.x - (b.x0 - r), ax: 'x', v: b.x0 - r },
          { d: (b.x1 + r) - next.x, ax: 'x', v: b.x1 + r },
          { d: next.z - (b.z0 - r), ax: 'z', v: b.z0 - r },
          { d: (b.z1 + r) - next.z, ax: 'z', v: b.z1 + r },
        ].sort((a, c) => a.d - c.d)[0];
        next[push.ax] = push.v;
      }
    }
  }

  // ------------------------------------------------------------ 시간
  update(dt, focus = null) {
    this.focusPos = focus;
    if (this.bunting) {
      this.bunting.visible = this._buntingOn && this.quality?.level !== 'low'; // 품질을 바꾸면 따라감
      if (this.bunting.visible && (this.frameNo & 1)) this._swayBunting(dt * 2); // 두 프레임에 한 번 (깃발 13장)
    }
    this.frameNo = (this.frameNo || 0) + 1; // 프레임 번호 (연못 반사 갱신 주기 등)
    for (const a of this.animated) a.update(dt);
    if (this.groundTime) this.groundTime.value += dt;
    if (focus) this.cameraPos = focus;
    this.time += dt / DAY_LENGTH;
    if (this.time >= 1) { this.time -= 1; this.day++; this.onNewDay?.(this.day); }
    const t = this.time;
    const sunA = (t - 0.25) * Math.PI * 2; // 06:00 일출, 18:00 일몰
    const elev = Math.sin(sunA);
    const fx = focus?.x || 0, fz = focus?.z || 0;
    const indoor = !!focus && focus.y < INDOOR_Y;
    // 해가 있는 쪽 (하늘·수면 반짝임은 바깥 기준 그대로) → 그림자 상자는 캐릭터·카메라를 따라감 (실내 방 포함)
    const sunRel = (this._sunRel ||= new THREE.Vector3()).set(Math.cos(sunA) * 60, Math.max(elev, -0.2) * 80 + 12, 35);
    this._fitShadow(focus, sunRel, indoor);
    // 날씨 값 부드럽게 보간 (약 4초)
    const W = this.weatherCur, WT = this.weatherTarget, k = Math.min(1, dt * 0.25);
    for (const key of WEATHER_KEYS) W[key] += (WT[key] - W[key]) * k;
    W.kind = WT.kind;
    const overcast = W.cloud;
    const daylight = THREE.MathUtils.clamp(elev * 2.2 + 0.25, 0, 1) * (1 - overcast * 0.35);
    this.daylight = daylight;
    const rainK = W.kind === 'rain' || W.kind === 'storm' ? Math.min(1, W.precip) : 0; // 비 세기 (빛을 서늘하게)
    this.sun.intensity = (0.15 + daylight * 2.2) * (1 - overcast * 0.8) * (1 - 0.35 * rainK);
    const nightK = this.nightK = nightFactor(daylight); // 0 낮 ~ 1 밤
    this.hemi.intensity = 0.1 + daylight * 1.0 + nightK * 0.06 + this.precip.flash * 2.5; // 밤에도 폰 화면에서 읽히게 조금 밝게
    this.scene.environmentIntensity = 0.06 + daylight * 0.28; // 환경광도 밤에는 줄임
    // 눈: 지면이 점점 하얗게 덮임
    const snowCover = Math.max(W.kind === 'snow' ? Math.min(1, W.precip * 1.2) : 0, this.seasonSnow || 0); // 겨울엔 눈이 안 와도 소복이
    this.snowCover = (this.snowCover || 0) + (snowCover - (this.snowCover || 0)) * Math.min(1, dt * 0.15);
    this.groundSnow.value = this.snowCover; // 눈 덮인 땅 (겨울·눈 오는 날): 바탕색을 바꿔 그림자·밤빛을 그대로 받음
    const tod = this.tod = timeOfDay(t, this._tod ||= { sun: [0, 0, 0], tint: [0, 0, 0], warmth: 0, sat: 0 }); // 시간대 빛 색 (같은 객체를 다시 채움)
    this.sun.color.setRGB(tod.sun[0], tod.sun[1], tod.sun[2]);
    this.hemi.color.setHex(0xd8eeff).lerp(this.sun.color, 0.16).lerp(MOON, nightK * 0.75).lerp(GREY, overcast * 0.6);
    this.hemi.groundColor.copy(DAY_GROUND).lerp(NIGHT_GROUND, nightK);
    this.ambient.color.copy(WHITE).lerp(NIGHT_AMB, nightK);
    // 비: 하늘빛·주변광을 서늘한 회색 쪽으로 (그리기 추가 없음)
    const wetL = SURF.wet.value * 0.25;
    if (wetL > 0.001) { this.hemi.color.lerp(RAIN_COOL, wetL); this.hemi.groundColor.lerp(RAIN_COOL_GROUND, wetL); this.ambient.color.lerp(RAIN_COOL, wetL); }
    const sky = (this._sky ||= new THREE.Color());
    if (elev > 0.25) sky.copy(DAY_SKY);
    else if (elev > -0.1) sky.copy(DUSK_SKY).lerp(DAY_SKY, (elev + 0.1) / 0.35);
    else sky.copy(NIGHT_SKY).lerp(DUSK_SKY, Math.max(0, (elev + 0.35) / 0.25));
    sky.lerp((this._grey ||= new THREE.Color()).copy(GREY).multiplyScalar(0.55 + daylight * 0.45), overcast * 0.6);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = THREE.MathUtils.lerp(45, 6, W.fog);
    this.scene.fog.far = THREE.MathUtils.lerp(110, 38, W.fog);
    const q = this.quality || {};
    this.precip.density = indoor ? 0 : (q.precip ?? 1); // 저사양은 입자 일부만, 집 안은 계산하지 않음
    this.precip.thin = q.level === 'low';
    this.precip.splash = q.level !== 'low' && !indoor;
    this.precip.light = 0.5 + 0.5 * daylight;
    this.precip.view = indoor ? null : SURF.seeCam.value; // 카메라 위치 (main 루프가 매 프레임 넣음)
    this.precip.set(W.kind, W.precip, W.wind);
    this.precip.update(dt, focus || ORIGIN);
    // 젖음: 비가 오면 약 20초에 걸쳐 젖고, 그치면 약 80초에 걸쳐 마름 (처음 접속 때 이미 비면 바로)
    const wetT = W.kind === 'rain' || W.kind === 'storm' ? Math.min(1, W.precip * 1.3) : 0;
    SURF.wet.value = this._wetSeen || !this.weatherKind ? easeWet(SURF.wet.value, wetT, dt) : wetT;
    if (this.weatherKind) this._wetSeen = true;
    if (this.groundWet) { this.groundWet.value = SURF.wet.value; this.groundPud.value = q.level === 'low' ? 0 : 1; this.groundNight.value = nightK; this.groundSky.value.copy(sky); }
    const night = daylight < 0.4 ? 1 : 0;
    for (const m of this.lampMaterials) m.emissiveIntensity = 1 + night * 3;
    const dusk = THREE.MathUtils.clamp(1 - daylight * 1.6, 0, 1);
    for (const m of this.lampGlows || []) m.emissiveIntensity = 0.15 + dusk * 3.2;
    for (const p of this.lampPools || []) { p.material.opacity = dusk * 0.42; p.visible = dusk > 0.02; }
    this.rim.position.set(fx - Math.cos(sunA) * 50, 25, fz - 35);
    this.rim.target.position.set(fx, 0, fz);
    this.rim.intensity = 0.25 + daylight * 0.45;
    // 환경맵(IBL)을 끈 저사양: 환경광이 주던 밝기를 흰 주변광으로 채움 (낮·저녁·밤 모두 예전 밝기와 맞춤)
    this.ambient.intensity = 0.03 + daylight * 0.12 + (this.scene.environment ? 0 : ENV_OFF_AMBIENT * this.scene.environmentIntensity);
    this.scenery?.update(dt, daylight, sunRel, W);
    // 하늘을 가로지르는 새 떼 (낮·맑을 때). 품질 낮음·집 안에서는 새 무리를 만들지 않음 (날던 무리는 그대로 지나감)
    const birdsOn = (q.birds ?? true) && !indoor;
    (this.birds ||= new Birds(this.scene)).update(dt, focus, birdsOn && W.precip <= 0.3 ? daylight : 0);
  }

  /**
   * 그림자 상자: 화면 비율에 맞춘 크기로 캐릭터 앞(카메라가 보는 쪽)을 덮고, 빛 공간 격자에 맞춰 떨림 없이 따라감.
   * 카메라 방향은 main 루프가 넣어 둔 시야 구멍 값(SURF.seeCam → seeTarget, 지난 프레임)으로 앎
   */
  _fitShadow(focus, sunRel, indoor) {
    const sh = this.sun.shadow, cam = sh.camera;
    const cp = SURF.seeCam.value, tp = SURF.seeTarget.value;
    const dx = tp.x - cp.x, dz = tp.z - cp.z, dl = Math.hypot(dx, dz);
    const sz = this.renderer?.getSize ? this.renderer.getSize(_size) : null;
    // 뒤쪽은 카메라 발밑까지 (멀리 당긴 세로 화면 아래쪽), 상한은 품질 단계별 (낮음은 작게 → 가로 폰 그림자 패스 가볍게)
    const fit = shadowFit(sz && sz.y > 0 ? sz.x / sz.y : 1.6, { behind: shadowBehind(dl), max: this.quality?.shadowBoxMax ?? 36 });
    if (cam.right !== fit.r) { cam.left = cam.bottom = -fit.r; cam.right = cam.top = fit.r; cam.updateProjectionMatrix(); }
    const c = _c.set(focus?.x || 0, focus?.y || 0, focus?.z || 0);
    if (dl > 1e-3) { c.x += (dx / dl) * fit.a; c.z += (dz / dl) * fit.a; } else c.z -= fit.a; // 기본 카메라는 북쪽(-z)을 봄
    // 집 안(지붕 없는 단면 방): 해가 낮으면 옆벽 그림자가 방을 덮으므로 빛을 높게 세워 짧은 접지 그림자만
    const dir = _dir.copy(sunRel);
    if (indoor) dir.y = Math.max(dir.y, Math.hypot(dir.x, dir.z) * 2);
    dir.normalize();
    snapToTexel(c, dir, (2 * fit.r) / (sh.mapSize.x || 1024), c);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(dir, SUN_DIST);
  }

  clockText() {
    const h = Math.floor(this.time * 24), m = Math.floor((this.time * 24 - h) * 60);
    return `${this.day}일차 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/** 가운데가 밝고 가장자리로 부드럽게 사라지는 원 (빛 웅덩이·빛 먼지) */
export function radialTexture() {
  if (radialTexture.tex) return radialTexture.tex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (radialTexture.tex = t);
}

/** 프로시저럴 잔디 텍스처 (두 톤 얼룩 + 미세 점) */
function grassTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#86cc55';
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(5);
  for (let i = 0; i < 900; i++) {
    const r = 6 + rnd() * 26;
    ctx.fillStyle = `hsla(${96 + rnd() * 14}, ${50 + rnd() * 20}%, ${48 + rnd() * 14}%, 0.35)`;
    ctx.beginPath(); ctx.ellipse(rnd() * S, rnd() * S, r, r * (0.5 + rnd() * 0.6), rnd() * 3, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(60,120,40,0.35)' : 'rgba(190,240,150,0.3)';
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function dirtTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d7bb84';
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(8);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `hsla(${34 + rnd() * 10}, ${35 + rnd() * 20}%, ${55 + rnd() * 20}%, 0.5)`;
    ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 1 + rnd() * 5, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick3(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }

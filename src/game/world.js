import * as THREE from 'three';
import { heightAt, HILLS, CHESTS } from './terrain.js';
import { Scenery } from './scenery.js';
import { Precipitation } from './precip.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { enhanceMaterial } from './surface.js';

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
  windmill: { x: -27, z: 15 },
  pond: { x: -12, z: 18, r: 4.5 },
  // 논 (3x2), 탈곡장, 허수아비
  paddy: { cols: 3, rows: 2, size: 3.6, bund: 0.7, x0: -6.8, z0: -25.6 },
  thresher: { x: 10.2, z: -20.5 },
  scarecrow: { x: -8.6, z: -23 },
  // 과수원, 낚시 데크
  orchard: [
    { x: 7, z: -9, fruit: 'fruit_apple' }, { x: 10.5, z: -6.5, fruit: 'fruit_peach' },
    { x: 7.5, z: -4, fruit: 'fruit_pear' }, { x: 10.5, z: -1.5, fruit: 'fruit_persimmon' },
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
    merchant: { x: 3.2, z: -8.4, pose: 'present', name: '장터 유니코' },
    researcher: { x: -14.5, z: -3.5, pose: 'lab', name: '연구원 유니코' },
    guide: { x: 4.5, z: 6.5, pose: 'megaphone', name: '안내 유니코' },
    granny: { x: -9.6, z: -19.4, pose: 'think', name: '할머니 유니코' },
    kid: { x: -6, z: 5, pose: 'cheer', name: '꼬마 유니코', wander: { x0: -12, z0: 3.5, x1: -3, z1: 8 } },
    fisher: { x: -5.2, z: 27.4, pose: 'wave', name: '낚시꾼 유니코' },
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
  ],
  // 소품 배치
  props: [
    ['lamp', 3.4, 7.6, 0], ['lamp', -1.9, -3, Math.PI], ['lamp', 1.9, -12.5, 0], ['lamp', -6, 10.8, Math.PI / 2], ['lamp', 6.5, 7.6, 0],
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
  reserved: [
    // 언덕 전망대·숨은 보물 상자 자리 (나무가 막지 않게)
    ...HILLS.map((H) => [H.lookout.x - 3.5, H.lookout.z - 3.5, H.lookout.x + 3.5, H.lookout.z + 3.5]),
    ...CHESTS.map((c) => [c.x - 1.4, c.z - 1.4, c.x + 1.4, c.z + 1.4]),
    [12, 27.5, 30.5, 36],
    [-19.5, 23.2, -1, 38.5], // 낚시터
    [-14.2, -9.5, -7.4, -1.4], // 농사 시설 (나무가 가리지 않게)
    [27.5, -11.2, 34, -6.5], // 목장 가공소
    [-21, 3.4, -15.8, 8.2],
    [13, -39, 37, -18.4], [29.5, -14.5, 32.5, -11.5], [32, 14, 38, 20], [-18, -27, -12, -21], [-8.5, -27.5, 8.5, -14], [5, -11, 13, 0.5], [7.5, -23, 13, -17], [-11, -25, -7.5, -17.5], [-9, 10, -2, 16.5]],
};

const DAY_LENGTH = 360; // 실제 초 = 게임 하루
// 애니메이션·상호작용이 있어 병합하면 안 되는 모델
const DYNAMIC = new Set(['windmill', 'tower_windmill', 'drone', 'smartfarm', 'fruit_tree', 'thresher', 'tractor', 'hen', 'cloud']);
const GREY = new THREE.Color(0x9aa4ae);

export class World {
  constructor(assets, renderer, quality = { grass: 9000, shadowMap: 3072 }) {
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
    this._batchStatic();
    this.scenery = new Scenery(this);
    this.scenery.ridges = this.ridges;
    this.precip = new Precipitation(this.scene);
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
    this.sun.shadow.radius = 3;
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
    this.groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.uTime = this.groundTime;
      sh.fragmentShader = 'uniform sampler2D detailMap; uniform float uTime;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        `#include <map_fragment>
         vec3 d = texture2D(detailMap, vMapUv * 46.0).rgb;
         diffuseColor.rgb *= mix(vec3(1.0), d * 1.55, 0.42);
         // 흘러가는 구름 그림자 (넓고 부드럽게)
         vec2 cp = vMapUv * 7.0 + vec2(uTime * 0.012, uTime * 0.005);
         float cn = sin(cp.x * 3.1 + sin(cp.y * 2.3)) * sin(cp.y * 2.7 + sin(cp.x * 1.7)) + 0.35 * sin(cp.x * 7.3 + cp.y * 5.1);
         diffuseColor.rgb *= 1.0 - smoothstep(0.35, 0.9, cn) * 0.16;`);
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
    const ctx = c.getContext('2d');
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
    const soft = (blur, fn) => { ctx.save(); ctx.filter = `blur(${blur}px)`; fn(); ctx.restore(); };
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
    soft(M(0.9), () => { for (const p of LAYOUT.paths) stroke(p.pts, p.w + 1.2, '#b89a62', 0.55); });
    soft(M(0.35), () => { for (const p of LAYOUT.paths) stroke(p.pts, p.w, '#dcc28d', 1); });
    // 바퀴 자국/자갈
    for (const p of LAYOUT.paths) {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 6);
        for (let k = 0; k < n; k++) {
          const t = k / n, x = ax + (bx - ax) * t + (rnd() - 0.5) * p.w * 0.8, z = az + (bz - az) * t + (rnd() - 0.5) * p.w * 0.8;
          ctx.fillStyle = rnd() > 0.5 ? 'rgba(150,120,80,0.45)' : 'rgba(245,230,200,0.5)';
          ctx.beginPath(); ctx.arc(P(x), P(z), M(0.04 + rnd() * 0.07), 0, 7); ctx.fill();
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
      ctx.fillStyle = '#d9d4c7';
      ctx.fillRect(P(kp[0]), P(kp[1]), M(kp[2] - kp[0]), M(kp[3] - kp[1]));
      // 연못 모래 테두리
      ctx.fillStyle = '#d8c18c';
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

  isReserved(x, z, pad = 0) {
    return LAYOUT.reserved.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
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
    this.signText(this.place('sign', -1.9, 5.8, 0.2, 1, { collide: false, dynamic: true }), '🦄 유니코 팜', '← 스마트팜 · 목장 →');
    this.signText(this.place('sign', 11, 11, -0.6, 1, { collide: false, dynamic: true }), '🚜 밭갈이', '트랙터 체험 →');
    this.place('wheelbarrow', -4, 5.5, 1.2, 1, { collide: false });
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
      if (this.isReserved(x, z, 1.5) || this.isBlocked(x, z, 2.0)) continue; // 나무끼리 겹치지 않게 간격
      const n = treeName(true);
      this.place(n, x, z, rnd() * 6.28, (0.9 + rnd() * 0.5) * treeScale(n), { r: 0.6 });
    }
    const spots = [[-8, -6], [-5, -9], [-11, 13], [-20, 4], [-28, -2], [30, 14], [20, 22], [-30, 22], [35.8, -4], [-18, 24], [-14, -18], [-22, 10]];
    for (const [x, z] of spots) { if (this.isBlocked(x, z, 1.0) || this.isReserved(x, z, 0)) continue; const n = Q ? pick(['tree_1', 'tree_2', 'tree_3', 'tree_4', 'tree_5', 'birch_1', 'birch_2', 'autumn_1']) : treeName(false); this.place(n, x, z, rnd() * 6.28, (0.9 + rnd() * 0.4) * treeScale(n), { r: 0.6 }); }
    // 연못가 버드나무
    if (Q) for (const [x, z] of [[-17.6, 15.5], [-16.5, 21.8]]) if (!this.isBlocked(x, z, 1.6)) this.place(rnd() > 0.5 ? 'willow_1' : 'willow_2', x, z, rnd() * 6.28, 1.35, { r: 0.6 });
    // 연잎 (낚시 데크 반대편)
    if (Q) for (const [dx, dz, s] of [[-2.6, 1.2, 0.8], [-1.6, 2.6, 0.6], [-3.1, -0.6, 0.7], [-0.4, 3.3, 0.55], [1.4, 3.0, 0.65]]) {
      const lp = this.place('lilypad', L.pond.x + dx, L.pond.z + dz, rnd() * 6.28, s, { collide: false });
      lp.position.y = 0.05; // 정적 병합 전에 수면 위로
    }
    for (let i = 0; i < 26; i++) {
      const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 70;
      if (this.isBlocked(x, z, 2.5) || this.isReserved(x, z, 1) || Math.hypot(x, z) < 12) continue;
      const n = !Q ? (rnd() > 0.5 ? 'bush' : 'flowers') : pick(['bush_1', 'bush_2', 'berrybush_1', 'berrybush_2', 'flowers', 'flowers_q', 'plant_1', 'plant_2', 'plant_3']);
      this.place(n, x, z, rnd() * 6.28, Q && /bush/.test(n) ? 1.1 : 1, { collide: false });
    }
    for (let i = 0; i < 10; i++) {
      const x = (rnd() - 0.5) * 60, z = (rnd() - 0.5) * 60;
      if (this.isBlocked(x, z, 2.5) || this.isReserved(x, z, 1) || Math.hypot(x, z) < 14) continue;
      this.place(Q ? pick(['rock_1', 'rock_2', 'rock_3', 'mossrock_1', 'mossrock_2', 'mossrock_3']) : 'rock', x, z, rnd() * 6.28, 0.8 + rnd() * 0.6);
    }
    // 숲 가장자리 소품: 그루터기, 통나무, 덤불
    if (Q) for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, r = L.bounds - 6 + rnd() * 5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.isBlocked(x, z, 1.9) || this.isReserved(x, z, 1)) continue; // 지나갈 틈(1.6m 이상) 남기기
      const n = pick(['stump', 'stump_moss', 'log', 'log_moss', 'plant_4', 'plant_5', 'bush_1', 'mossrock_4', 'grass_q', 'grass_q2']);
      this.place(n, x, z, rnd() * 6.28, 1, { collide: /log|stump/.test(n) });
    }
    // 소품 (가로등은 밤에 켜짐)
    this.lampGlows = [];
    for (const [name, x, z, rot] of L.props) {
      const m = this.place(name, x, z, rot, 1, { r: name === 'lamp' ? 0.25 : name === 'bench' ? 0.7 : name === 'planter' ? 0.55 : 0.4 });
      if (name === 'lamp') m.traverse((o) => { if (o.isMesh && o.material.emissiveIntensity > 0 && !this.lampGlows.includes(o.material)) this.lampGlows.push(o.material); });
    }
    // 밤 가로등 불빛 웅덩이: 바닥에 부드러운 따뜻한 빛 (실제 광원 대신 가산 혼합 원판 → 가벼움)
    const poolTex = radialTexture();
    this.lampPools = [];
    for (const [name, x, z] of L.props) {
      if (name !== 'lamp') continue;
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffc06a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.04, z);
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
    const deck = new THREE.Mesh(mergeGeometries(planks.map((g) => g.toNonIndexed())), wood);
    const frame = new THREE.Mesh(mergeGeometries(beams.map((g) => g.index ? g.toNonIndexed() : g)), woodD);
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
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.28), wood);
    seat.position.y = -0.06;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshStandardMaterial({ color: 0x5e3c22, roughness: 0.9 }));
    inner.rotation.x = -Math.PI / 2; inner.scale.set(0.56, 1.36, 1); inner.position.y = -0.2;
    boat.add(hull, rim, seat, inner);
    boat.position.set(K.pier[1].x0 - 1.0, 0.16, (K.pier[1].z0 + K.pier[1].z1) / 2 - 0.4);
    boat.rotation.y = 0.15;
    this.scene.add(boat);
    this.staticObjs.push(boat);
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
    for (const o of this.staticObjs) {
      o.updateMatrixWorld(true);
      o.traverse((m) => {
        if (!m.isMesh) return;
        const mat = m.material, vc = plain(mat);
        // 키 작은 장식(풀·꽃·덤불·작은 돌·연잎)은 그림자를 드리우지 않는 묶음으로 → 그림자 패스 삼각형 감소
        const small = (o.userData.h ??= new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y) < 0.7;
        const key = (small ? 'ns|' : '') + (vc ? `vc|${mat.userData.enhanced || 'none'}|${mat.roughness.toFixed(2)}|${mat.metalness.toFixed(2)}|${mat.side}|${mat.toneMapped}` : mat.uuid);
        if (!buckets.has(key)) buckets.set(key, { mat, vc, geos: [], small });
        let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        const src = mat.vertexColors ? g.attributes.color : null;
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
        if (g.index) g = g.toNonIndexed();
        if (!g.attributes.normal) g.computeVertexNormals();
        if (vc) { // 재질 색 × (있으면) 원래 정점 색
          const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = mat.color;
          const sc = mat.vertexColors && g.attributes.color;
          for (let i = 0; i < n; i++) {
            arr[i * 3] = c.r * (sc ? sc.getX(i) : 1); arr[i * 3 + 1] = c.g * (sc ? sc.getY(i) : 1); arr[i * 3 + 2] = c.b * (sc ? sc.getZ(i) : 1);
          }
          g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        } else if (!src) g.deleteAttribute('color');
        buckets.get(key).geos.push(g);
      });
      this.scene.remove(o);
    }
    let n = 0;
    for (const { mat, vc, geos, small } of buckets.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) { console.warn('정적 병합 실패:', mat.name, geos.length); continue; }
      let material = mat;
      if (vc) {
        material = mat.clone();
        material.color.set(0xffffff);
        material.vertexColors = true;
        const kind = mat.userData.enhanced;
        material.userData = {};
        if (kind) enhanceMaterial(material, kind);
      }
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !small; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      n++;
    }
    this.staticObjs = [];
    this.batchCount = n;
  }

  /** 표지판(sign 모델) 앞면에 글자 붙이기 — 위 판: 큰 글씨, 아래 판: 작은 글씨 */
  signText(m, title, sub) {
    const tex = (text, w, h, size, bg) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a2f1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${size}px Jua, "Noto Sans KR", sans-serif`;
      g.fillText(text, w / 2, h / 2 + 2);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    };
    const mk = (text, w, h, y, rz, bg, size) => {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(text, 512, Math.round(512 * h / w), size, bg), roughness: 0.9 }));
      pl.position.set(0, y, 0.115);
      pl.rotation.z = rz;
      m.add(pl);
    };
    mk(title, 1.16, 0.46, 1.2, 0, '#f5efe0', 92);
    if (sub) mk(sub, 0.86, 0.31, 0.75, -0.14, '#e8c872', 54);
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
  resolveCollision(next, r, { swim = false } = {}) {
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
    this.frameNo = (this.frameNo || 0) + 1; // 프레임 번호 (연못 반사 갱신 주기 등)
    for (const a of this.animated) a.update(dt);
    if (this.groundTime) this.groundTime.value += dt;
    if (focus) {
      // 그림자 카메라를 플레이어 주변으로 이동
      this.sun.target.position.set(focus.x, 0, focus.z);
      this.cameraPos = focus;
    }
    this.time += dt / DAY_LENGTH;
    if (this.time >= 1) { this.time -= 1; this.day++; this.onNewDay?.(this.day); }
    const t = this.time;
    const sunA = (t - 0.25) * Math.PI * 2; // 06:00 일출, 18:00 일몰
    const elev = Math.sin(sunA);
    const fx = focus?.x || 0, fz = focus?.z || 0;
    this.sun.position.set(fx + Math.cos(sunA) * 60, Math.max(elev, -0.2) * 80 + 12, fz + 35);
    // 날씨 값 부드럽게 보간 (약 4초)
    const W = this.weatherCur, WT = this.weatherTarget, k = Math.min(1, dt * 0.25);
    for (const key of ['cloud', 'precip', 'fog', 'wind']) W[key] += (WT[key] - W[key]) * k;
    W.kind = WT.kind;
    const overcast = W.cloud;
    const daylight = THREE.MathUtils.clamp(elev * 2.2 + 0.25, 0, 1) * (1 - overcast * 0.35);
    this.daylight = daylight;
    this.sun.intensity = (0.15 + daylight * 2.2) * (1 - overcast * 0.8);
    this.hemi.intensity = 0.1 + daylight * 1.0 + this.precip.flash * 2.5;
    this.scene.environmentIntensity = 0.06 + daylight * 0.28; // 환경광도 밤에는 줄임
    // 눈: 지면이 점점 하얗게 덮임
    const snowCover = W.kind === 'snow' ? Math.min(1, W.precip * 1.2) : 0;
    this.snowCover = (this.snowCover || 0) + (snowCover - (this.snowCover || 0)) * Math.min(1, dt * 0.15);
    this.groundMat.emissive.setRGB(1, 1, 1).multiplyScalar(this.snowCover * 0.32 * (0.3 + daylight * 0.7));
    this.hemi.color.setHex(0xd8eeff).lerp(GREY, overcast * 0.6);
    const dayCol = new THREE.Color(0xbfe4ff), duskCol = new THREE.Color(0xf4b183), nightCol = new THREE.Color(0x1d2a4a);
    const sky = new THREE.Color();
    if (elev > 0.25) sky.copy(dayCol);
    else if (elev > -0.1) sky.copy(duskCol).lerp(dayCol, (elev + 0.1) / 0.35);
    else sky.copy(nightCol).lerp(duskCol, Math.max(0, (elev + 0.35) / 0.25));
    sky.lerp(GREY.clone().multiplyScalar(0.55 + daylight * 0.45), overcast * 0.6);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = THREE.MathUtils.lerp(45, 6, W.fog);
    this.scene.fog.far = THREE.MathUtils.lerp(110, 38, W.fog);
    this.precip.set(W.kind, W.precip, W.wind);
    this.precip.update(dt, focus || { x: 0, z: 0 });
    this.sun.color.setHex(elev < 0.15 ? 0xffb080 : 0xfff3dd);
    const night = daylight < 0.4 ? 1 : 0;
    for (const m of this.lampMaterials) m.emissiveIntensity = 1 + night * 3;
    const dusk = THREE.MathUtils.clamp(1 - daylight * 1.6, 0, 1);
    for (const m of this.lampGlows || []) m.emissiveIntensity = 0.15 + dusk * 3.2;
    for (const p of this.lampPools || []) { p.material.opacity = dusk * 0.42; p.visible = dusk > 0.02; }
    this.rim.position.set(fx - Math.cos(sunA) * 50, 25, fz - 35);
    this.rim.target.position.set(fx, 0, fz);
    this.rim.intensity = 0.25 + daylight * 0.45;
    this.ambient.intensity = 0.03 + daylight * 0.12;
    this.scenery?.update(dt, daylight, this.sun.position.clone().sub(new THREE.Vector3(fx, 0, fz)), W);
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

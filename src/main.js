import { josa } from './game/sim/josa.js';
import { HomeView } from './game/view/home_view.js';
import { TownView } from './game/view/town_view.js';
import { AutoPlay } from './game/autoplay.js';
import * as THREE from 'three';
import { Assets, DEFERRED_MODELS } from './game/assets.js';
import { World, LAYOUT } from './game/world.js';
import { Input, lookHold, isSubmitEnter } from './game/input.js';
import { FollowCamera, BASE_FOV, fovFor, releaseInput } from './game/camera.js';
import { Player } from './game/player.js';
import { Unico } from './game/unico.js';
import { FarmView } from './game/view/farm_view.js';
import { RanchView } from './game/view/ranch_view.js';
import { Pet } from './game/view/pet.js';
import { ExploreView } from './game/view/explore_view.js';
import { Pests } from './game/view/pests.js';
import { Herding } from './game/view/herding.js';
import { Bees } from './game/view/bees.js';
import { Cinematics } from './game/cutscene.js';
import { Dialogue } from './ui/dialogue.js';
import { TractorView } from './game/view/tractor_view.js';
import { SmartFarmView } from './game/view/smartfarm_view.js';
import { NPCs } from './game/view/npcs.js';
import { Economy } from './game/sim/economy.js';
import { Quests, QUESTS } from './game/sim/quests.js';
import { UI } from './ui/ui.js';
import { FX } from './game/fx.js';
import { Audio } from './game/audio.js';
import { Net } from './game/net.js';
import { saveGame, loadSave, clearSave } from './game/save.js';
import { Minimap } from './ui/minimap.js';
import { randomName } from './game/names.js';
import { Juice } from './game/juice.js';
import { PostFX, FrameCap } from './game/postfx.js';
import { loadSettings, saveSettings, resolveQuality, applyPreset, FpsGovernor, LEVELS, PRESET_INFO, uiScaleOf, isMobileDevice } from './game/quality.js';
import { SURF } from './game/surface.js';
import { Music } from './game/music.js';
import { Guide } from './game/guide.js';
import { WeatherService } from './game/weather.js';
import { PointerNav, PromptPick, arrivalStep } from './game/pointer.js';
import { RiceView } from './game/view/rice_view.js';
import { NatureView } from './game/view/nature_view.js';
import { Villagers } from './game/sim/villagers.js';
import { Collection } from './game/sim/collection.js';
import { KoatView } from './game/view/koat_view.js';
import { LakeView } from './game/view/lake_view.js';
import { Angling } from './game/sim/angling.js';
import { WaterFX } from './game/waterfx.js';
import { FarmCraftView } from './game/view/farmcraft_view.js';
import { CostumeSim, COSTUME, encodeLook } from './game/sim/costume.js';
import { joinQrBox } from './ui/join_qr.js';
import { SocialSim } from './game/sim/social.js';
import { SocialView } from './game/view/social_view.js';
import { SeasonView } from './game/view/season_view.js';
import { DecorView } from './game/view/decor_view.js';
import { DIVISIONS } from './game/sim/koat.js';
import { HILLS } from './game/terrain.js';

/** 뒤로 가기용 기록 하나 끼워 두기 (주소·쿼리는 그대로) */
function pushBackGuard() {
  try { if (!history.state?.unicoBack) history.pushState({ unicoBack: 1 }, ''); } catch { /* 무시 */ }
}
/** 캔버스로 굽는 이름표·표지판 글자: Jua 한글 조각을 미리 받아 대체 글꼴로 굳지 않게 */
const LABEL_TEXT = [
  ...Object.values(LAYOUT.npcs).map((n) => n.name), ...HILLS.map((h) => h.name),
  '유니코 팜 스마트팜 목장 밭갈이 트랙터 체험 양 몰이 우리에 넣어요 전망대 올라와 보세요 오늘의 주문서 로컬푸드 직매장 납품',
  '낚시터 기록판 의뢰 최대어 새 마을 부지 코인으로 건물을 지어요 KOAT 체험관 콩이 명예 연구원',
].join(' ');

class Game {
  constructor(canvas, assets, name, audio) {
    this.playerName = name;
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.watchContext(canvas);
    // 배포판: 셰이더마다 오류 확인을 기다리지 않음 → 드라이버가 여러 셰이더를 한꺼번에(병렬) 준비 (개발 중에는 오류를 보려고 켜 둠)
    if (import.meta.env.PROD) this.renderer.debug.checkShaderErrors = false;
    this.gfx = loadSettings();
    this.quality = resolveQuality(this.gfx);
    this.governor = new FpsGovernor();
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    // three r182 는 PCFSoftShadowMap 을 실제로 1탭(Basic) 그림자로 그림 → 같은 결과·비용을 그대로 명시 (버전을 올려도 몰래 비싸지지 않게)
    // three 버전을 올릴 때는 모바일 그림자 비용(프레임 시간)을 다시 잴 것. type 은 부팅 때만 정함 (바꾸면 모든 재질을 다시 컴파일)
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 600);
    this.input = new Input(canvas);
    this.audio = audio || new Audio(); // 입장 탭 안에서 미리 만든 것 (iOS: 탭 처리 안에서 만들어야 소리가 남)
    this.audio.wakeOnGesture();
    this.music = new Music(this.audio);
    this.world = new World(assets, this.renderer, this.quality);
    this.postfx = new PostFX(this.renderer, this.world.scene, this.camera, this.quality);
    this.postfx.enabled = this.quality.post;
    this.followCam = new FollowCamera(this.camera);
    this.economy = new Economy();
    this.costume = new CostumeSim(); // 코스튬 (옷장·장터 의상 탭)
    this.social = new SocialSim();   // 다른 플레이어와 상호작용 (인사·하이파이브·선물·친구)
    this.economy.bonus = (k) => this.costume.mult(k);
    this.quests = new Quests();
    this.player = new Player(assets, this.world, name);
    this.ui = new UI(this, document.getElementById('ui'));
    this.cinema = new Cinematics(this, document.getElementById('ui'));
    this.dialogue = new Dialogue(this, document.getElementById('ui'));
    this.flags = {};
    this.fx = new FX(this.world.scene, this.quality);
    this.waterfx = new WaterFX(this.world.scene, this.world.scenery, this.quality);
    this.player.unico.onStep = (x, z) => this.fx.dust(x, z);
    this.farm = new FarmView(this);
    this.ranch = new RanchView(this);
    this.tractor = new TractorView(this);
    this.smartfarm = new SmartFarmView(this);
    this.villagers = new Villagers();
    this.collection = new Collection();
    this.npcs = new NPCs(this);
    this.rice = new RiceView(this);
    this.angling = new Angling();
    this.nature = new NatureView(this);
    this.koat = new KoatView(this);
    this.pet = new Pet(this);
    this.explore = new ExploreView(this);
    this.pests = new Pests(this);
    this.herding = new Herding(this);
    this.bees = new Bees(this);
    this.lake = new LakeView(this);
    this.farmcraft = new FarmCraftView(this);
    this.town = new TownView(this);
    this.home = new HomeView(this);
    this.net = new Net(this);
    this.socialView = new SocialView(this);
    this.season = new SeasonView(this); // 계절 (7일마다 봄·여름·가을·겨울)
    this.decor = new DecorView(this);   // 농장 꾸미기
    this.juice = new Juice();
    this.minimap = new Minimap(this, document.getElementById('ui'));
    this.pointer = new PointerNav(this);
    this.autoplay = new AutoPlay(this);
    this.guide = new Guide(this);
    this.fx.onPop = (t, p) => { if (!/[❤️🌿]/u.test(t)) this.ui.flyToBag(t, p); };
    this.world.onNewDay = (day) => {
      const ev = this.economy.newDay(day);
      this.ranch.sim.newDay(day);
      this.town.newDay();
      this.home.newDay();
      this.social.newDay(day);
      this.ui.toast(`🌅 ${day}일차 아침! 장터 시세가 바뀌었어요`);
      if (ev) this.ui.toast('📈 ' + ev.name);
      if (this.economy.festival) { this.ui.toast(this.economy.festival.name + ' (장터에서 팔면 이득!)'); this.audio.play('levelup'); this.onEvent('festival'); }
      else if (Economy.isFestival(day + 1)) this.ui.toast('🎪 내일은 유니코 수확 축제! 수확물을 모아 두면 더 비싸게 팔 수 있어요');
    };
    this.saveTimer = 0;
    this.resize();
    this.applyQuality(this.quality, { rebuildPost: false });
    window.addEventListener('resize', () => this.resize());
    this.watchLifecycle();
    this.restore();
    this.net.connect();
    // 현재 위치 실시간 날씨
    this.rainAcc = 0;
    this.world.precip.onThunder = () => { this.juice.shake(0.25); this.audio.play('thunder'); };
    this.weather = new WeatherService((w, svc) => {
      const prev = this.world.weatherKind;
      this.world.setWeather(w);
      this.farm.sim.weatherMult = w.kind === 'snow' ? 0.6 : 1;
      this.ui.setWeather(w, svc);
      if (prev !== w.kind) {
        const where = svc.loc?.name ? `${svc.loc.name} ` : '';
        const effect = w.autoWater ? ' 밭에 저절로 물이 뿌려져요 💧' : w.kind === 'snow' ? ' 작물이 조금 천천히 자라요 (스마트팜은 영향 없음)' : '';
        this.ui.toast(`${w.emoji} ${where}지금 ${w.label}${w.temperature != null ? ` ${Math.round(w.temperature)}°C` : ''}.${effect}`);
      }
    });
    this.weather.start();
    // 렌더 루프: setAnimationLoop + Timer (탭 복귀 시 dt 폭주 방지 위해 클램프). 시작은 셰이더 준비 뒤 startLoop()
    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    this.frameCap = isMobileDevice() ? new FrameCap() : null; // 고주사율 폰은 화면 갱신 정수 배로 건너뛰어 약 60fps
    this.armBackGuard();
  }

  /** 셰이더 미리 준비가 끝난 뒤 boot() 에서 시작: 로딩 화면 뒤에서 첫 렌더가 셰이더를 동기로 컴파일하거나 로직이 먼저 돌지 않게 */
  startLoop() {
    if (this._looping) return;
    this._looping = true;
    this.timer.update(); // 첫 프레임 dt 에 로딩 시간이 들어가지 않게
    this.governor.reset();
    this.renderer.setAnimationLoop((t) => this.loop(t));
  }

  /** 지금 상태 저장 (초기화 중이면 save.js 가 막음) */
  save() {
    this.saveTimer = 0;
    if (this._introPending) return; // 첫 접속: 인트로 시작 전에는 저장하지 않음 (저장이 생기면 다음 접속에 인트로가 안 나옴)
    saveGame(this);
  }

  /** 앱 전환·탭 닫기: 바로 저장, 눌린 입력 정리, (모바일) 소리 멈춤 → 돌아오면 다시 켬 */
  watchLifecycle() {
    document.addEventListener('visibilitychange', () => {
      this.governor.reset();
      this.frameCap?.reset();
      if (document.hidden) {
        this.save();
        releaseInput(this.input); // 손을 뗀 이벤트를 못 받아 눌린 채 남은 조이스틱·시점 터치·키
        if (this.nature) this.nature.holdBtn = false;
        if (isMobileDevice()) { this.audio.sleep(); this.music.pause(); } // 데스크톱은 지금처럼 배경에서도 재생
      } else if (this.audio.hold) {
        this.audio.wake();
        this.music.resume();
      }
    });
    window.addEventListener('pagehide', () => this.save());
  }

  /**
   * 모바일 뒤로 가기: 열린 창·꾸미기를 먼저 닫음. 기록은 하나만 끼워 두고 닫을 때마다 다시 끼움
   * 닫을 것이 없으면 저장하고 '한 번 더 누르면 나가요' (화면을 다시 만지면 다시 끼움)
   */
  armBackGuard() {
    if (!isMobileDevice() || this._backGuard) return;
    this._backGuard = true;
    pushBackGuard();
    window.addEventListener('popstate', () => {
      if (history.state?.unicoBack) return;
      let closed = false;
      if (this.ui.panel) { this.ui.closePanel(); closed = true; } else if (this.decor.mode) { this.decor.stop(); closed = true; }
      if (closed || this.cinema.locked || this.dialogue.active) { pushBackGuard(); return; }
      this.save();
      this.ui.toast('↩️ 한 번 더 누르면 게임에서 나가요');
      this._exitArmed = true;
    });
    window.addEventListener('pointerup', () => { if (this._exitArmed) { this._exitArmed = false; pushBackGuard(); } }, { capture: true, passive: true });
  }

  /** WebGL 컨텍스트 손실: 복구되면 환경맵·그림자를 다시 만들고, 5초 안에 안 되면 다시 불러오기 안내 */
  watchContext(canvas) {
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // 복구를 기다림
      this.save();
      this.ui?.toast('🖥️ 화면을 다시 준비하는 중이에요…');
      clearTimeout(this._ctxTimer);
      this._ctxTimer = setTimeout(() => {
        if (!this.renderer.getContext().isContextLost()) return;
        const p = this.ui?.openPanel('🖥️ 화면을 다시 불러와야 해요');
        if (!p) return;
        p.dataset.kind = 'ctxlost';
        const row = document.createElement('div');
        row.className = 'row';
        row.textContent = '기기 메모리가 부족해 그래픽이 멈췄어요. 농장은 저장해 두었어요.';
        const btn = document.createElement('button');
        btn.textContent = '🔄 다시 불러오기';
        btn.onclick = () => { this.save(); location.reload(); };
        p.append(row, btn);
      }, 5000);
    });
    // three 의 복구 처리(렌더러 생성자에서 먼저 등록) 다음에 실행됨
    canvas.addEventListener('webglcontextrestored', () => {
      clearTimeout(this._ctxTimer);
      if (this.ui?.panel?.dataset.kind === 'ctxlost') this.ui.closePanel();
      this.postfx?.rebuildEnvironment();
      this.renderer.shadowMap.needsUpdate = true;
    });
  }

  /** 환경설정에서 그래픽 설정을 바꿨을 때 (저장 + 즉시 적용) */
  setGraphics(settings) {
    this.saver = 0; // 설정을 바꾸면 절전 단계 풀림
    this.gfx = settings;
    saveSettings(settings);
    const prev = this.quality;
    const q = resolveQuality(settings);
    const rebuildPost = prev.post !== q.post || prev.ao !== q.ao || prev.tiltShift !== q.tiltShift || prev.env !== q.env; // env: 환경맵(IBL) 켜고 끄기
    this.applyQuality(q, { rebuildPost });
  }

  applyQuality(q, { rebuildPost = false } = {}) {
    this.quality = q;
    this.world.quality = q;
    Unico.setQuality(q.level); // 낮음이면 NPC·다른 접속자는 저해상도 몸·실제 그림자 끔
    this.renderer.setPixelRatio(q.pixelRatio);
    // 그림자: 끄기/켜기, 해상도 바꾸면 그림자 맵 다시 만들기
    const sun = this.world.sun;
    sun.castShadow = q.shadows !== 'off';
    if (sun.shadow.mapSize.x !== q.shadowMap) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // 그림자 맵은 loop 에서 한 프레임에 한 번만 갱신 (자동 갱신이면 GTAO·반사 연못의 추가 render 마다 똑같이 다시 그림)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.world.scenery?.setDensity(q.grass);
    this.fx?.setQuality(q); // 입자 상한
    if (rebuildPost) {
      this.world.scenery?._water(); // 반사 연못은 화면 효과가 켜진 품질에서만
      this.postfx.dispose();
      this.postfx = new PostFX(this.renderer, this.world.scene, this.camera, q);
    }
    this.postfx.enabled = q.post;
    this.resize();
    this.ui?.updateFps?.();
    this.applyUiScale();
  }

  /** 자동 품질이 이미 가장 낮은데도 끊길 때: 저장하지 않는 절전 단계 (새로 고치거나 설정을 바꾸면 원래대로) */
  lighten() {
    if ((this.saver || 0) >= 2) return;
    this.saver = (this.saver || 0) + 1;
    this.applyQuality(this.withSaver(resolveQuality(this.gfx)));
    if (this.saver === 1) this.ui.toast('⚙️ 화면이 끊겨서 풀과 그림자 갱신을 줄여 더 가볍게 했어요');
  }

  /** 절전 단계: 1) 풀 절반 + 그림자 갱신 덜 자주 2) 해상도 80% (셰이더를 다시 만들지 않는 항목만) */
  withSaver(q) {
    const s = this.saver || 0;
    if (!s) return q;
    return {
      ...q,
      grass: q.grass * 0.5,
      shadowEvery: q.shadowEvery > 0 ? Math.max(q.shadowEvery, 6) : q.shadowEvery,
      pixelRatio: s >= 2 ? Math.max(0.5, q.pixelRatio * 0.8) : q.pixelRatio,
    };
  }

  /** 글자·버튼 크기: 화면 UI 요소마다 배율 (환경설정) */
  applyUiScale() {
    const v = uiScaleOf(this.gfx);
    document.getElementById('ui')?.style.setProperty('--ui-zoom', String(v));
    document.body.classList.toggle('ui-big', v > 1);
    this.ui?.syncHudBottom?.();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fovFor(w / h); // 세로 폰: 주변이 보이도록 시야를 넓힘
    this.camera.updateProjectionMatrix();
    this.postfx?.setSize(w, h);
  }

  restore() {
    const s = loadSave();
    if (!s) { this._introPending = true; this.whenShown(() => setTimeout(() => this.introCutscene(), 700)); return; }
    this.flags = s.flags || {};
    this.farm.sim.load(s.farm);
    this.farm.refreshAll();
    this.economy.load(s.economy);
    this.quests.load(s.quests);
    this.ranch.load(s.ranch);
    this.rice.load(s.rice);
    this.nature.load(s.nature);
    this.villagers.load(s.villagers);
    this.collection.load(s.collection);
    this.koat.load(s.koat);
    this.explore.load(s.explore);
    this.bees.load(s.bees);
    this.angling.load(s.angling);
    this.farmcraft.load(s.farmcraft);
    this.town.load(s.town);
    this.home.load(s.home);
    this.costume.load(s.costume);
    this.social.load(s.social);
    this.decor.load(s.decor);
    this.applyLook(false);
    if (this.pet.ok) this.pet.load(s.pet);
    if (this.koat.book.rewarded) this.player.setTitle('KOAT 명예 연구원');
    if (s.world) { this.world.time = s.world.time; this.world.day = s.world.day; }
    this.social.newDay(this.world.day);
    if (s.player) this.player.position.set(s.player.x, 0, s.player.z);
    this.ui.toast('💾 저장된 농장을 불러왔어요');
  }

  /** 로딩 화면 뒤에서 인트로 전경 시점으로 한 번 그려 둠: 처음 화면에 들어오는 물체·그림자를 미리 준비해 인트로 첫 몇 초의 끊김을 줄임 */
  warmUp() {
    if (this.flags.intro) return; // 인트로를 이미 본 저장이면 생략
    const cam = this.camera, p = cam.position.clone(), q = cam.quaternion.clone();
    try {
      for (const [pos, look] of [[[10, 22, 30], [0, 0, 0]], [[16, 16, 26], [0, 0, 0]]]) {
        cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld();
        this.renderer.shadowMap.needsUpdate = true;
        this.postfx.render();
      }
    } catch { /* 첫 프레임에 준비 */ }
    cam.position.copy(p); cam.quaternion.copy(q); cam.updateMatrixWorld();
  }

  /** 로딩 화면이 사라진 뒤 실행 (첫 접속 컷신 등) */
  whenShown(fn) { if (this._shown) fn(); else (this._onShown ||= []).push(fn); }
  shown() {
    this._shown = true;
    for (const fn of this._onShown || []) fn();
    this._onShown = null;
    // 첫 화면에 필요 없는 모델(boot 에서 이미 받는 중)을 다 받으면 셰이더만 미리 준비.
    // 목장 손님 동물은 ranch.update 가 1초마다 플레이어 위치를 보고 화면 밖 먼 자리에 풀어 놓음 (여기서 바로 넣으면 눈앞에 나타날 수 있음)
    this.assets.loadDeferred?.().then(() => this.warmDeferred()).catch(() => {});
  }

  /**
   * 뒤에서 받은 동물(말·당나귀·알파카·늑대·여우)의 셰이더를 미리 준비 → 처음 화면에 나올 때 끊기지 않게 (가능하면 병렬).
   * 도착한 것 중 아직 안 한 것만 (여러 번 불러도 모델마다 한 번). 준비가 끝나면 풀리는 약속, 할 것이 없으면 null
   */
  warmDeferred() {
    const r = this.renderer, A = this.assets;
    if (this._warmedDeferred) return null;
    if (!r?.compileAsync) { this._warmedDeferred = true; return null; }
    const done = (this._warmedNames ||= new Set());
    const batch = new THREE.Object3D();
    for (const n of DEFERRED_MODELS.flat()) {
      if (done.has(n) || !A.has(n)) continue;
      done.add(n);
      batch.add(A.anims.get(n)?.length ? A.cloneAnimated(n).root : A.clone(n)); // 실제로 놓을 때와 같은 복제 (재질 공유)
    }
    if (A.deferredDone || done.size === DEFERRED_MODELS.flat().length) this._warmedDeferred = true; // 더 올 것이 없음
    if (!batch.children.length) return null;
    const prevRT = r.getRenderTarget?.() ?? null;
    try {
      // 화면 효과가 켜져 있으면 그 버퍼에 그리므로(톤매핑·색 공간이 다름) 그 대상으로 준비, 불빛·안개는 실제 장면 것
      r.setRenderTarget?.(this.postfx?.enabled ? this.postfx.composer.readBuffer : null);
      return r.compileAsync(batch, this.camera, this.world.scene).catch(() => {});
    } catch { return null; /* 처음 나올 때 준비 */ } finally { r.setRenderTarget?.(prevRT); }
  }

  resetSave() { clearSave(); location.reload(); } // clearSave 뒤에는 떠날 때 저장이 막힘 (지운 농장이 되살아나지 않게)

  /** KOAT 체험관 입구로 이동 */
  goKoat() {
    if (this.tractor.driving || this.smartfarm.active || this.nature.fishing || this.rice.threshing) return this.ui.toast('지금은 이동할 수 없어요');
    this.teleport(25, -24, { yaw: 0, pitch: 0.62, distance: 13, facing: Math.PI });
    this.audio.play('levelup');
    if (!this.flags.koatIntro) { this.flags.koatIntro = true; this.koatCutscene(); }
    else this.ui.toast('🏢 KOAT 체험관에 도착! 본부별 부스에서 체험하고 안내데스크에서 스탬프를 확인하세요');
  }

  /** 처음 접속: 마을을 한 바퀴 둘러보며 안내 강아지가 소개 */
  introCutscene() {
    const ge = this.npcs.list.find((e) => e.id === 'guide'), guide = ge?.u;
    const G = { speaker: guide, name: ge?.name ?? LAYOUT.npcs.guide.name, color: '#6dbb4f', emote: 'megaphone' };
    const pp = this.player.position;
    this.flags.intro = true;
    this._introPending = false; // 이제부터 저장 (다음 접속은 인트로 없이 이어 하기)
    return this.cinema.play([
      // 첫 장면: 비스듬한 마을 전경 (정면 높은 전경보다 그리기 25% 가벼움 — 인트로 첫 몇 초 끊김 완화)
      { cam: [[10, 22, 30], [0, 0, 0], 0.01], hold: 0 },
      { cam: [[16, 16, 26], [0, 0, 0], 3.2] },
      { say: [{ ...G, text: `안녕, ${this.playerName}! 유니코 팜에 온 걸 환영해 🦄${guide?.species ? ' 나는 마을 안내를 맡은 강아지야!' : ''}` }] },
      { cam: [[6, 6, -2], [0, 1, -10], 2.0] },
      { say: [{ ...G, text: '북쪽 장터에서는 씨앗과 사료를 사고, 키운 작물을 팔 수 있어. 시세는 매일 바뀌니까 잘 보고 팔아!' }] },
      { cam: [[10, 9, 14], [22, 0, 0], 2.2] },
      { say: [{ ...G, text: '동쪽 목장에는 젖소·양·닭이 있고, 말이랑 알파카도 놀러 와. 사료를 주면 우유랑 달걀이 생겨.' }] },
      { cam: [[8, 14, -6], [22, 0, -28], 2.4] },
      { say: [{ ...G, text: '저 너머 북동쪽은 KOAT 체험관! 한국농업기술진흥원 본부들이 하는 일을 미니게임으로 체험할 수 있어.' }] },
      { cam: [[pp.x + 3.5, 3.2, pp.z + 6], [pp.x, 1, pp.z], 2.2] },
      { say: [{ ...G, text: '먼저 밭부터 갈아 보자! 노란 빛기둥이 지금 할 일을 알려 줄 거야. 궁금하면 언제든 나한테 말 걸어 줘 😊' }] },
      { run: () => { this.ui.toast('🎯 왼쪽 위 목표를 따라가 보세요 · ⚙️ 환경설정에서 그래픽 품질을 바꿀 수 있어요'); saveGame(this); } },
    ]);
  }

  /** KOAT 체험관 첫 방문: 광장과 본관을 비추며 안내데스크가 설명 */
  koatCutscene() {
    const desk = this.koat.desk;
    const D = { speaker: desk, name: '안내데스크 (기획운영본부)', color: '#30b6aa', emote: 'present' };
    return this.cinema.play([
      { cam: [[25, 7, -12], [25, 2, -30], 2.4] },
      { say: [{ ...D, text: '한국농업기술진흥원(KOAT) 체험관에 온 걸 환영해요!' }] },
      { cam: [[19.5, 3.4, -24], [17.2, 1.3, -27], 1.8] },
      { say: [{ ...D, text: '왼쪽은 기술사업화·벤처창업·종자사업, 오른쪽은 스마트농업·농기계검정·농업환경분석 본부 부스예요.' }] },
      { cam: [[25, 2.6, -26.2], [25, 1.3, -29.3], 1.6] },
      { say: [{ ...D, text: '부스마다 미니게임을 통과하면 스탬프를 드려요. 여섯 개를 모아 오면 \'KOAT 명예 연구원\' 칭호를 드릴게요!' }] },
    ]);
  }


  /** 순간이동 (지도·체험관 버튼). 카메라는 현재 각도 유지가 기본 */
  /** 지금 옷차림 (옷장 소품 + 코스튬) */
  outfitNow() {
    const o = this.home.sim.outfit || {};
    return { hat: o.hat ?? null, scarf: o.scarf ?? null, goggles: !!o.goggles, sprout: o.sprout === undefined ? true : !!o.sprout, costume: this.costume.wearing };
  }
  /** 다른 접속자에게 보내는 모습 문자열 */
  look() { return encodeLook(this.outfitNow()); }
  /** 옷차림을 내 유니코에 입히고 (send 면) 접속자에게 알림 */
  applyLook(send = true) {
    const o = this.outfitNow();
    this.player.unico.setOutfit(o);
    if (send) this.net?.sendLook();
  }

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
  }

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
  }

  /** 도감 등록 후: 진행 퀘스트, 카테고리 완성 보상 */
  afterCollect() {
    this.onEvent('book', Object.keys(this.collection.entries).length);
    for (const r of this.collection.claimCompletions()) {
      this.economy.earn(r.money);
      this.audio.play('levelup');
      this.ui.result('🏅 도감 완성!', [`${{ fish: '물고기', bug: '곤충', fruit: '과일' }[r.cat]} 도감을 모두 채웠어요!`, `보상 +${r.money}🪙`]);
    }
  }

  /** 게임 이벤트 → 퀘스트 진행 */
  onEvent(event, amount = 1) {
    const done = this.quests.report(event, amount);
    for (const q of done) this.ui.toast(`✅ 퀘스트 완료: ${q.title} (Q 에서 보상 받기)`);
    if (event !== 'money') this.quests.report('money', this.economy.money);
  }

  claimQuest(id) {
    const r = this.quests.claim(id);
    if (!r) return;
    this.economy.earn(r.reward.money);
    this.audio.play(r.levelUp ? 'levelup' : 'coin');
    this.ui.toast(`🎁 +${r.reward.money} 코인, +${r.reward.xp} XP`);
    if (r.levelUp) { this.ui.toast(`⬆️ 레벨 ${r.level} 달성! 새 씨앗이 해금됐는지 장터를 확인하세요`); this.player.unico.playAction('cheer', 2); }
    this.onEvent('money', this.economy.money);
    this.saveTimer = Math.max(this.saveTimer, 9); // 보상은 1초 안에 저장 (연속으로 받아도 한 번만 직렬화)
  }

  loop(now = performance.now()) {
    // 고주사율(100Hz 이상) 모바일 화면: 건너뛴 시간은 다음 프레임 dt 에 그대로 들어가고 입력도 남음
    if (this.frameCap && !this.frameCap.tick(now)) return;
    this.timer.update();
    const rawDt = Math.max(0, this.timer.getDelta());
    const dt = Math.min(0.05, rawDt);
    this.fpsDt = rawDt;
    // 자동 품질: 화면이 계속 끊기면 한 단계 낮춤 (탭을 숨겼다 돌아온 공백은 visibilitychange 에서 측정 초기화)
    // 컷신 중에는 측정하지 않음: 전경 샷은 평소보다 1.5배 무거워 화질이 중간에 바뀌며(화면 재구성) 더 끊김
    if (rawDt < 3 && !this.cinema.locked && this.governor.tick(rawDt)) {
      this.ui.updateFps?.(this.governor.fps);
      if (this.gfx.preset === 'auto') {
        const i = LEVELS.indexOf(this.gfx.autoLevel);
        if (i > 0) {
          this.setGraphics(applyPreset({ ...this.gfx, autoLevel: LEVELS[i - 1] }, 'auto'));
          this.ui.toast(`⚙️ 화면이 끊겨서 그래픽 품질을 '${PRESET_INFO[LEVELS[i - 1]].name}'${josa(PRESET_INFO[LEVELS[i - 1]].name, '으로/로')} 낮췄어요 (환경설정에서 바꿀 수 있어요)`);
        } else if (i === 0) this.lighten(); // 이미 '낮음' (모바일 시작 단계): 저장하지 않는 절전 단계
      }
    } else if (this.governor.frames === 0) this.ui.updateFps?.(this.governor.fps);
    const input = this.input;
    if (input.justPressed('KeyI')) this.ui.panel ? this.ui.closePanel() : this.ui.openInventory();
    if (input.justPressed('KeyQ')) this.ui.panel ? this.ui.closePanel() : this.ui.openQuests();
    if (input.justPressed('Escape') && this.ui.panel) this.ui.closePanel();
    if (input.justPressed('KeyT')) this.ui.chatInput.focus();
    if (input.justPressed('KeyP') && !this.ui.panel) this.autoplay.toggle(); // 오토플레이
    if (input.pressed.has('KeyM') && (!this.ui.panel || this.ui.panel.dataset.kind === 'map')) this.minimap.openBig(); // 지도 열기/닫기

    const pp = this.player.position;
    if (!this._warmedDeferred) this.warmDeferred(); // 뒤에서 받는 동물: 도착한 프레임에 셰이더 준비 (목장이 1초마다 풀어 놓기 전에)
    this.world.update(dt, this.tractor.driving ? this.tractor.riderGroup.position : pp);
    this.season.update(dt);
    // 상호작용 후보: 진행 중인 미니게임(d<0)이 최우선, 그다음 가장 가까운 대상
    // 탭해서 걸어간 대상의 안내 종류도 함께 봄 (도착하면 옆의 다른 안내가 아니라 그 대상을 실행)
    const cand = new PromptPick(this.player.arrivedKey);
    const pick = (p) => cand.add(p);
    let prompt = null;
    const pw = this.home.inside ? this.home.outVec : pp; // 집 안이면 바깥 것들은 문 앞 기준
    pick(this.tractor.update(dt, input, pw));
    if (!this.tractor.driving) {
      pick(this.smartfarm.update(dt, input, pw));
      pick(this.npcs.update(dt, pw));
      pick(this.farm.update(dt, pw));
      pick(this.ranch.update(dt, pw));
      pick(this.rice.update(dt, pw));
      pick(this.nature.update(dt, pw));
      pick(this.koat.update(dt, pw));
      pick(this.pet.update(dt, pw));
      pick(this.explore.update(dt, pw));
      pick(this.pests.update(dt, pw));
      pick(this.herding.update(dt, pw));
      pick(this.bees.update(dt, pw));
      pick(this.lake.update(dt, pw));
      pick(this.farmcraft.update(dt, pw));
      pick(this.town.update(dt, pw));
      pick(this.net.prompt(pw)); // 가까운 다른 플레이어
      pick(this.decor.update(dt, pp)); // 꾸미기 모드 (켜져 있을 때만, 다른 안내보다 먼저)
      const homePrompt = this.home.update(dt, pp);
      if (this.home.inside) cand.only(homePrompt); else pick(homePrompt); // 집 안에서는 가구 안내만
      this.pointer.update(dt, input);
      this.autoplay.update(dt, input);
      const arrived = this.player.arrivedInteract, arrivedAt = this.player.arrivedTarget;
      this.player.arrivedInteract = false;
      this.player.arrivedKey = this.player.arrivedTarget = null;
      const talking = this.dialogue.active || this.cinema.locked || this.dialogue.justClosed();
      if (!talking) prompt = cand.prompt;
      // 탭해 걸어가 도착하면 자동 상호작용: 종류가 있는 대상은 그 대상만, 없으면(밭·동물) 가장 가까운 안내
      const step = arrived && !talking ? arrivalStep(cand, arrivedAt) : {};
      if (!this.ui.panel) {
        if (prompt?.onInteract && input.interact()) prompt.onInteract();
        else if (step.run) step.run.onInteract();
        else if (step.closer) { this.player.goTo(arrivedAt.pos, Math.min(arrivedAt.stop, 0.35), true, arrivedAt.key); this.player.moveTarget.closer = true; }
      }
      this.player.update(dt, input, this.followCam);
      this.followCam.update(dt, this.ui.panel || this.cinema.locked ? null : input, pp);
    } else {
      prompt = cand.prompt; // 운전 중 안내 (쟁기 상태)
      this.smartfarm.update(dt, input, pp);
      this.farm.update(dt, pp);
      this.ranch.update(dt, pp);
      this.npcs.update(dt, pp);
      this.rice.update(dt, pp);
      this.nature.update(dt, pp);
      this.koat.update(dt, pp);
      this.pet.update(dt, this.tractor.riderGroup.position);
      this.explore.update(dt, pp);
      this.pests.update(dt, pp);
      this.bees.update(dt, pp);
      this.lake.update(dt, pp);
      this.farmcraft.update(dt, pp);
      this.town.update(dt, pp);
      this.home.update(dt, pp);
      // 운전 중에는 카메라가 트랙터 뒤를 따라감 (마우스·터치로 돌리는 동안은 멈추고, 손을 뗀 뒤 0.5초 지나면 천천히 복귀)
      const behind = this.tractor.vehicle.heading + Math.PI;
      const dy = ((behind - this.followCam.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this._lookHold = lookHold(this._lookHold, input.looking, dt);
      if (!this._lookHold) this.followCam.yaw += dy * Math.min(1, dt * 3);
      this.followCam.update(dt, input, this.tractor.riderGroup.position);
    }
    this.cinema.update(dt); // 대화·컷신 연출 카메라 (따라가기 카메라 위에 섞음)
    // 잔디를 눕히는 위치: 나, 반려견, 트랙터, 가장 가까운 다른 플레이어
    const pu = this.world.scenery?.pushers?.value;
    if (pu) {
      const far = (v) => v.set(9999, 0.01, 9999);
      if (this.tractor.driving) { const t = this.tractor.riderGroup.position; pu[0].set(t.x, 1.8, t.z); } else pu[0].set(pp.x, 0.85, pp.z);
      const pe = this.pet.e?.m.position; if (pe) pu[1].set(pe.x, 0.5, pe.z); else far(pu[1]);
      const tv = this.tractor.vehicle; if (!this.tractor.driving) pu[2].set(tv.x, 1.6, tv.z); else far(pu[2]);
      const rm = this.net.remote.values().next().value; if (rm) { const q = rm.unico.group.position; pu[3].set(q.x, 0.85, q.z); } else far(pu[3]);
    }
    this.ui.setPrompt(this.ui.panel ? null : prompt);
    this.net.update(dt);
    this.fx.update(dt);
    this.waterfx.update(dt, this.camera, this.renderer);
    this.juice.update(dt, this.camera);
    SURF.time.value += dt;
    SURF.seeCam.value.copy(this.camera.position);
    SURF.seeTarget.value.copy(this.followCam.smooth);
    if (this.music.on) { const W = this.world.weatherCur || {}; this.music.setScene({ daylight: this.world.daylight, kind: this.world.weatherKind || 'clear', precip: W.precip || 0, wind: W.wind || 0.15 }); }
    SURF.wind.value = this.world.weatherCur?.wind ?? 0.15;
    // 눈 쌓임/녹음: 날씨가 바뀌면 서서히, 처음 접속했을 때 이미 눈이면 바로 덮인 상태
    const snowTarget = Math.max(this.world.weatherKind === 'snow' ? 1 : 0, (this.world.seasonSnow || 0) * 0.85); // 겨울엔 지붕·나무에도 눈
    if (this.snowSeen === undefined && this.world.weatherKind) { this.snowSeen = true; SURF.snow.value = snowTarget; }
    SURF.snow.value += (snowTarget - SURF.snow.value) * Math.min(1, dt * 0.35);
    if (this.home.inside) SURF.snow.value = 0; // 실내 가구에는 눈이 쌓이지 않음 (나가면 다시 서서히)
    this.minimap.update(dt);
    // 코스튬 자동 지급 (체험관 스탬프 투어 완주 → 체험관 조끼)
    if ((this._cosT = (this._cosT || 0) + dt) > 2) {
      this._cosT = 0;
      for (const id of this.costume.autoUnlock({ stamps: this.koat.book.count, stampsTotal: DIVISIONS.length })) {
        this.ui.toast(`🎁 새 코스튬 '${COSTUME[id].icon} ${COSTUME[id].name}'${josa(COSTUME[id].name, '을/를')} 받았어요! 집 옷장에서 입어 보세요`);
        this.audio.play('levelup');
        this.onEvent('costume', this.costume.owned.size);
      }
    }
    this.guide.update(dt);
    this.ui.updateHud();
    // 비 오는 날 자동 물주기 (3초마다 점검)
    if (this.world.weatherKind === 'rain' || this.world.weatherKind === 'storm') {
      this.rainAcc += dt;
      if (this.rainAcc > 3) { this.rainAcc = 0; this.farm.sim.rain(); }
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) this.save();
    // 그림자 맵 갱신 주기 (높음: 매 프레임, 보통: 2프레임, 낮음: 3프레임마다 — 정적 장면이 대부분이라 체감 차이 작음)
    // 자동 갱신은 끄고 프레임마다 한 번만 요청 → 한 프레임 안의 여러 render(GTAO·반사 연못)가 그림자를 다시 그리지 않음
    const shBase = this.quality.shadowEvery;
    const shEvery = shBase > 0 && this.cinema.locked ? Math.max(3, shBase) : shBase;
    this.renderer.shadowMap.autoUpdate = false;
    this.frameNo = (this.frameNo || 0) + 1;
    if (shEvery > 0 && this.frameNo % Math.max(1, shEvery) === 0) this.renderer.shadowMap.needsUpdate = true;
    this.postfx.setGrade(this.home?.inside ? null : this.world.tod, this.world.weatherCur?.cloud || 0); // 시간대 색 (집 안은 그대로)
    this.postfx.render();
    input.endFrame();
  }
}

async function boot() {
  const canvas = document.getElementById('game');
  const bar = document.getElementById('loading-bar');
  const btn = document.getElementById('start-btn');
  const nick = document.getElementById('nickname');
  const saved = loadSave();
  nick.value = saved?.name || randomName();
  const assets = new Assets();
  // 글자를 넘겨야 그 글자가 든 한글 조각을 받음 (글자 없이 부르면 라틴 조각만 받아 이름표가 대체 글꼴로 구워짐)
  const fontReady = Promise.race([Promise.all([document.fonts?.load?.('40px Jua', `${LABEL_TEXT} ${nick.value}`), document.fonts?.load?.("20px 'Unico Coin'", '🪙')]).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  await Promise.all([assets.loadAll((p) => (bar.style.width = Math.round(p * 100) + '%')), fontReady]);
  assets.loadDeferred(saved?.player).catch(() => {}); // 첫 화면에 필요 없는 모델(늑대·산여우·주민 원본 몸·KOAT 네 발 원본)은 닉네임을 고르는 동안 뒤에서, 원본 몸은 저장 위치에서 가까운 주민부터
  const lt = document.getElementById('loading-text');
  if (lt) lt.textContent = '준비 완료! 닉네임을 정하고 입장하세요';
  // 로그인 화면 접속 QR (휴대폰으로 같은 게임에 바로 들어오기, 좁은 화면·터치 기기에서는 숨김)
  try { const q = joinQrBox(); q.classList.add('login-qr'); document.getElementById('loading')?.append(q); } catch { /* QR 없이도 입장 가능 */ }
  btn.disabled = false;
  btn.textContent = '입장하기';
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    // iOS: 소리 장치는 탭 처리 안에서(첫 await 전에) 만들고 켜야 함
    const audio = new Audio();
    audio.unlock();
    if (isMobileDevice()) pushBackGuard(); // 뒤로 가기 기록도 탭 처리 안에서 (사용자 동작 없이 넣은 기록은 브라우저가 건너뜀)
    const name = (nick.value.trim() || randomName()).slice(0, 12);
    const ld = document.getElementById('loading');
    btn.disabled = true;
    if (lt) lt.textContent = '농장을 만드는 중…';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // 문구가 먼저 그려지게 (월드 만들기는 한 번에 실행돼 화면이 잠시 멈춤)
    await Promise.race([Promise.resolve(document.fonts?.load?.('40px Jua', name)).catch(() => {}), new Promise((r) => setTimeout(r, 800))]); // 바꾼 닉네임 글자
    window.game = new Game(canvas, assets, name, audio);
    window.game.audio.play('click'); // 입장 소리 (소리 장치는 위에서 탭 처리 안에 이미 켬)
    window.game.music.start();
    // 첫 화면 끊김 방지: 로딩 화면 뒤에서 셰이더를 미리 컴파일(가능하면 병렬)하고 두 프레임 그린 뒤 보여 줌
    if (lt) lt.textContent = '화면 준비 중…';
    await new Promise((r) => requestAnimationFrame(r)); // '화면 준비 중' 문구가 먼저 보이게
    // 셰이더 미리 준비: 지원 브라우저(KHR_parallel_shader_compile)는 병렬로, 화면을 멈추지 않고 기다림.
    // 일부 환경에서 compileAsync 가 끝나지 않는 일이 있어 최대 5초만 기다림 (남은 것은 첫 프레임에)
    // 닉네임을 고르는 동안 받아 둔 동물도 여기서 함께 (로딩 화면이 사라지는 순간에 컴파일이 몰리지 않게)
    const R = window.game.renderer, sc = window.game.world.scene, cm = window.game.camera;
    try {
      try { await Promise.race([Promise.all([R.compileAsync(sc, cm), window.game.warmDeferred()]), new Promise((r) => setTimeout(r, 5000))]); }
      catch { try { R.compile(sc, cm); } catch { /* 첫 프레임에 컴파일 */ } }
      window.game.warmUp?.();
    } finally { window.game.startLoop(); } // 이제부터 루프: 아래 두 프레임은 로딩 화면 뒤에서 실제로 그려짐
    await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 1500))]);
    ld.classList.add('out');
    setTimeout(() => ld.remove(), 650);
    window.game.shown();
  };
  btn.onclick = start;
  nick.addEventListener('keydown', (e) => { if (isSubmitEnter(e)) start(); }); // 한글 조합 중 Enter 로 이름 끝 글자가 빠진 채 입장하지 않게
  if (new URLSearchParams(location.search).has('autostart')) start();
}

boot();
export { QUESTS };

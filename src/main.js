import { josa } from './game/sim/josa.js';
import { HomeView } from './game/view/home_view.js';
import { TownView } from './game/view/town_view.js';
import { AutoPlay } from './game/autoplay.js';
import * as THREE from 'three';
import './game/assets.js'; // 모델 로더는 예전처럼 여기서 평가 (three·공유 청크 내용과 해시가 그대로 → 브라우저 캐시 재사용)
import { World } from './game/world.js';
import { Input, lookHold } from './game/input.js';
import { FollowCamera, BASE_FOV, releaseInput } from './game/camera.js';
import { Player } from './game/player.js';
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
import { Minimap } from './ui/minimap.js';
import { Juice } from './game/juice.js';
import { PostFX, FrameCap } from './game/postfx.js';
import { loadSettings, resolveQuality, applyPreset, FpsGovernor, LEVELS, PRESET_INFO, isMobileDevice } from './game/quality.js';
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
import { SocialSim } from './game/sim/social.js';
import { SocialView } from './game/view/social_view.js';
import { SeasonView } from './game/view/season_view.js';
import { DecorView } from './game/view/decor_view.js';
import { DIVISIONS } from './game/sim/koat.js';
import { boot, pushBackGuard } from './boot.js';
import { GameGfx } from './game/game_gfx.js';
import { GameSave } from './game/game_save.js';
import { GameStory } from './game/game_story.js';
import { GameTravel } from './game/game_travel.js';
import { GameProgress } from './game/game_progress.js';

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

// 메서드 묶음 (그래픽·저장·컷신·이동·퀘스트 진행): 파일별로 나눠 두고 여기서 Game 에 붙임
Object.assign(Game.prototype, GameGfx, GameSave, GameStory, GameTravel, GameProgress);

boot(Game);
export { QUESTS };

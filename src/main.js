import * as THREE from 'three';
import { Assets } from './game/assets.js';
import { World, LAYOUT } from './game/world.js';
import { Input } from './game/input.js';
import { FollowCamera } from './game/camera.js';
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
import { saveGame, loadSave, clearSave } from './game/save.js';
import { Minimap } from './ui/minimap.js';
import { randomName } from './game/names.js';
import { Juice } from './game/juice.js';
import { PostFX } from './game/postfx.js';
import { loadSettings, saveSettings, resolveQuality, applyPreset, FpsGovernor, LEVELS, PRESET_INFO, uiScaleOf } from './game/quality.js';
import { SURF } from './game/surface.js';
import { Music } from './game/music.js';
import { Guide } from './game/guide.js';
import { WeatherService } from './game/weather.js';
import { PointerNav } from './game/pointer.js';
import { RiceView } from './game/view/rice_view.js';
import { NatureView } from './game/view/nature_view.js';
import { Villagers } from './game/sim/villagers.js';
import { Collection } from './game/sim/collection.js';
import { KoatView } from './game/view/koat_view.js';
import { LakeView } from './game/view/lake_view.js';
import { Angling } from './game/sim/angling.js';
import { WaterFX } from './game/waterfx.js';
import { FarmCraftView } from './game/view/farmcraft_view.js';

class Game {
  constructor(canvas, assets, name) {
    this.playerName = name;
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gfx = loadSettings();
    this.quality = resolveQuality(this.gfx);
    this.governor = new FpsGovernor();
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.music = new Music(this.audio);
    this.world = new World(assets, this.renderer, this.quality);
    this.postfx = new PostFX(this.renderer, this.world.scene, this.camera, this.quality);
    this.postfx.enabled = this.quality.post;
    this.followCam = new FollowCamera(this.camera);
    this.economy = new Economy();
    this.quests = new Quests();
    this.player = new Player(assets, this.world, name);
    this.ui = new UI(this, document.getElementById('ui'));
    this.cinema = new Cinematics(this, document.getElementById('ui'));
    this.dialogue = new Dialogue(this, document.getElementById('ui'));
    this.flags = {};
    this.fx = new FX(this.world.scene);
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
    this.net = new Net(this);
    this.juice = new Juice();
    this.minimap = new Minimap(this, document.getElementById('ui'));
    this.pointer = new PointerNav(this);
    this.guide = new Guide(this);
    this.fx.onPop = (t, p) => { if (!/[❤️🌿]/u.test(t)) this.ui.flyToBag(t, p); };
    this.world.onNewDay = (day) => {
      const ev = this.economy.newDay();
      this.ranch.sim.newDay(day);
      this.ui.toast(`🌅 ${day}일차 아침! 장터 시세가 바뀌었어요`);
      if (ev) this.ui.toast('📈 ' + ev.name);
    };
    this.saveTimer = 0;
    this.resize();
    this.applyQuality(this.quality, { rebuildPost: false });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.governor.reset());
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
    // 렌더 루프: setAnimationLoop + Timer (탭 복귀 시 dt 폭주 방지 위해 클램프)
    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    this.renderer.setAnimationLoop(() => this.loop());
  }

  /** 환경설정에서 그래픽 설정을 바꿨을 때 (저장 + 즉시 적용) */
  setGraphics(settings) {
    this.gfx = settings;
    saveSettings(settings);
    const prev = this.quality;
    const q = resolveQuality(settings);
    const rebuildPost = prev.post !== q.post || prev.ao !== q.ao || prev.tiltShift !== q.tiltShift;
    this.applyQuality(q, { rebuildPost });
  }

  applyQuality(q, { rebuildPost = false } = {}) {
    this.quality = q;
    this.world.quality = q;
    this.renderer.setPixelRatio(q.pixelRatio);
    // 그림자: 끄기/켜기, 해상도 바꾸면 그림자 맵 다시 만들기
    const sun = this.world.sun;
    sun.castShadow = q.shadows !== 'off';
    if (sun.shadow.mapSize.x !== q.shadowMap) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    this.renderer.shadowMap.autoUpdate = q.shadowEvery <= 1;
    this.renderer.shadowMap.needsUpdate = true;
    this.world.scenery?.setDensity(q.grass);
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
    this.camera.updateProjectionMatrix();
    this.postfx?.setSize(w, h);
  }

  restore() {
    const s = loadSave();
    if (!s) { this.whenShown(() => setTimeout(() => this.introCutscene(), 700)); return; }
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
    if (this.pet.ok) this.pet.load(s.pet);
    if (this.koat.book.rewarded) this.player.setTitle('KOAT 명예 연구원');
    if (s.world) { this.world.time = s.world.time; this.world.day = s.world.day; }
    if (s.player) this.player.position.set(s.player.x, 0, s.player.z);
    this.ui.toast('💾 저장된 농장을 불러왔어요');
  }

  /** 로딩 화면이 사라진 뒤 실행 (첫 접속 컷신 등) */
  whenShown(fn) { if (this._shown) fn(); else (this._onShown ||= []).push(fn); }
  shown() { this._shown = true; for (const fn of this._onShown || []) fn(); this._onShown = null; }

  resetSave() { clearSave(); location.reload(); }

  /** KOAT 체험관 입구로 이동 */
  goKoat() {
    if (this.tractor.driving || this.smartfarm.active || this.nature.fishing || this.rice.threshing) return this.ui.toast('지금은 이동할 수 없어요');
    this.teleport(25, -24, { yaw: 0, pitch: 0.62, distance: 13, facing: Math.PI });
    this.audio.play('levelup');
    if (!this.flags.koatIntro) { this.flags.koatIntro = true; this.koatCutscene(); }
    else this.ui.toast('🏢 KOAT 체험관에 도착! 본부별 부스에서 체험하고 안내데스크에서 스탬프를 확인하세요');
  }

  /** 처음 접속: 마을을 한 바퀴 둘러보며 안내 유니코가 소개 */
  introCutscene() {
    const guide = this.npcs.list.find((e) => e.id === 'guide')?.u;
    const G = { speaker: guide, name: '안내 유니코', color: '#6dbb4f', emote: 'megaphone' };
    const pp = this.player.position;
    this.flags.intro = true;
    return this.cinema.play([
      { cam: [[0, 34, 46], [0, 0, -4], 0.01], hold: 0 },
      { cam: [[16, 16, 26], [0, 0, 0], 3.2] },
      { say: [{ ...G, text: `안녕, ${this.playerName}! 유니코 팜에 온 걸 환영해 🦄` }] },
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
  teleport(x, z, { yaw, pitch, distance, facing } = {}) {
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
  }

  loop() {
    this.timer.update();
    const rawDt = this.timer.getDelta();
    const dt = Math.min(0.05, rawDt);
    this.fpsDt = rawDt;
    // 자동 품질: 화면이 계속 끊기면 한 단계 낮춤 (탭을 숨겼다 돌아온 공백은 visibilitychange 에서 측정 초기화)
    if (rawDt < 3 && this.governor.tick(rawDt)) {
      this.ui.updateFps?.(this.governor.fps);
      if (this.gfx.preset === 'auto') {
        const i = LEVELS.indexOf(this.gfx.autoLevel);
        if (i > 0) {
          this.setGraphics(applyPreset({ ...this.gfx, autoLevel: LEVELS[i - 1] }, 'auto'));
          this.ui.toast(`⚙️ 화면이 끊겨서 그래픽 품질을 '${PRESET_INFO[LEVELS[i - 1]].name}'(으)로 낮췄어요 (환경설정에서 바꿀 수 있어요)`);
        }
      }
    } else if (this.governor.frames === 0) this.ui.updateFps?.(this.governor.fps);
    const input = this.input;
    if (input.justPressed('KeyI')) this.ui.panel ? this.ui.closePanel() : this.ui.openInventory();
    if (input.justPressed('KeyQ')) this.ui.panel ? this.ui.closePanel() : this.ui.openQuests();
    if (input.justPressed('Escape') && this.ui.panel) this.ui.closePanel();
    if (input.justPressed('KeyT')) this.ui.chatInput.focus();
    if (input.pressed.has('KeyM') && (!this.ui.panel || this.ui.panel.dataset.kind === 'map')) this.minimap.openBig(); // 지도 열기/닫기

    const pp = this.player.position;
    this.world.update(dt, this.tractor.driving ? this.tractor.riderGroup.position : pp);
    // 상호작용 후보: 진행 중인 미니게임(d<0)이 최우선, 그다음 가장 가까운 대상
    let prompt = null;
    const pick = (p) => { if (p && (!prompt || (p.d ?? 99) < (prompt.d ?? 99))) prompt = p; };
    pick(this.tractor.update(dt, input, pp));
    if (!this.tractor.driving) {
      pick(this.smartfarm.update(dt, input, pp));
      pick(this.npcs.update(dt, pp));
      pick(this.farm.update(dt, pp));
      pick(this.ranch.update(dt, pp));
      pick(this.rice.update(dt, pp));
      pick(this.nature.update(dt, pp));
      pick(this.koat.update(dt, pp));
      pick(this.pet.update(dt, pp));
      pick(this.explore.update(dt, pp));
      pick(this.pests.update(dt, pp));
      pick(this.herding.update(dt, pp));
      pick(this.bees.update(dt, pp));
      pick(this.lake.update(dt, pp));
      pick(this.farmcraft.update(dt, pp));
      this.pointer.update(dt, input);
      const arrived = this.player.arrivedInteract;
      this.player.arrivedInteract = false;
      const talking = this.dialogue.active || this.cinema.locked || this.dialogue.justClosed();
      if (talking) prompt = null;
      if (prompt?.onInteract && (input.interact() || arrived) && !this.ui.panel) prompt.onInteract();
      this.player.update(dt, input, this.followCam);
      this.followCam.update(dt, this.ui.panel || this.cinema.locked ? null : input, pp);
    } else {
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
      // 운전 중에는 카메라가 트랙터 뒤를 따라감 (마우스로 돌려도 천천히 복귀)
      const behind = this.tractor.vehicle.heading + Math.PI;
      const dy = ((behind - this.followCam.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (!input.drag.active) this.followCam.yaw += dy * Math.min(1, dt * 3);
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
    const snowTarget = this.world.weatherKind === 'snow' ? 1 : 0;
    if (this.snowSeen === undefined && this.world.weatherKind) { this.snowSeen = true; SURF.snow.value = snowTarget; }
    SURF.snow.value += (snowTarget - SURF.snow.value) * Math.min(1, dt * 0.35);
    this.minimap.update(dt);
    this.guide.update(dt);
    this.ui.updateHud();
    // 비 오는 날 자동 물주기 (3초마다 점검)
    if (this.world.weatherKind === 'rain' || this.world.weatherKind === 'storm') {
      this.rainAcc += dt;
      if (this.rainAcc > 3) { this.rainAcc = 0; this.farm.sim.rain(); }
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; saveGame(this); }
    // 그림자 맵 갱신 주기 (낮음: 3프레임, 보통: 2프레임마다 — 정적 장면이 대부분이라 체감 차이 작음)
    if (this.quality.shadowEvery > 1) {
      this.frameNo = (this.frameNo || 0) + 1;
      if (this.frameNo % this.quality.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
    }
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
  const fontReady = Promise.race([document.fonts?.load?.('40px Jua') || Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);
  await Promise.all([assets.loadAll((p) => (bar.style.width = Math.round(p * 100) + '%')), fontReady]);
  const lt = document.getElementById('loading-text');
  if (lt) lt.textContent = '준비 완료! 닉네임을 정하고 입장하세요';
  btn.disabled = false;
  btn.textContent = '입장하기';
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    const name = (nick.value.trim() || randomName()).slice(0, 12);
    const ld = document.getElementById('loading');
    window.game = new Game(canvas, assets, name);
    window.game.audio.play('click'); // 사용자 동작 안에서 오디오 시작
    window.game.music.start();
    // 첫 화면 끊김 방지: 로딩 화면 뒤에서 셰이더를 미리 컴파일(가능하면 병렬)하고 두 프레임 그린 뒤 보여 줌
    btn.disabled = true;
    if (lt) lt.textContent = '화면 준비 중…';
    // (compileAsync 는 일부 환경에서 끝나지 않아 동기 compile 사용 + 안전장치: 길어도 로딩 화면은 내려감)
    await new Promise((r) => requestAnimationFrame(r)); // '화면 준비 중' 문구가 먼저 보이게
    try { window.game.renderer.compile(window.game.world.scene, window.game.camera); } catch { /* 첫 프레임에 컴파일 */ }
    await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 1500))]);
    ld.classList.add('out');
    setTimeout(() => ld.remove(), 650);
    window.game.shown();
  };
  btn.onclick = start;
  nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  if (new URLSearchParams(location.search).has('autostart')) start();
}

boot();
export { QUESTS };

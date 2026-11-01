import * as THREE from 'three';
import { Assets } from './game/assets.js';
import { World } from './game/world.js';
import { Input } from './game/input.js';
import { FollowCamera } from './game/camera.js';
import { Player } from './game/player.js';
import { FarmView } from './game/view/farm_view.js';
import { RanchView } from './game/view/ranch_view.js';
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
import { pickQuality } from './game/quality.js';
import { SURF } from './game/surface.js';
import { WeatherService } from './game/weather.js';
import { PointerNav } from './game/pointer.js';
import { RiceView } from './game/view/rice_view.js';
import { NatureView } from './game/view/nature_view.js';
import { Villagers } from './game/sim/villagers.js';
import { Collection } from './game/sim/collection.js';
import { KoatView } from './game/view/koat_view.js';

class Game {
  constructor(canvas, assets, name) {
    this.playerName = name;
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.quality = pickQuality();
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.world = new World(assets, this.renderer, this.quality);
    this.postfx = new PostFX(this.renderer, this.world.scene, this.camera, this.quality);
    this.followCam = new FollowCamera(this.camera);
    this.followCam.blockers = this.world.camBlockers;
    this.economy = new Economy();
    this.quests = new Quests();
    this.player = new Player(assets, this.world, name);
    this.ui = new UI(this, document.getElementById('ui'));
    this.fx = new FX(this.world.scene);
    this.player.unico.onStep = (x, z) => this.fx.dust(x, z);
    this.farm = new FarmView(this);
    this.ranch = new RanchView(this);
    this.tractor = new TractorView(this);
    this.smartfarm = new SmartFarmView(this);
    this.villagers = new Villagers();
    this.collection = new Collection();
    this.npcs = new NPCs(this);
    this.rice = new RiceView(this);
    this.nature = new NatureView(this);
    this.koat = new KoatView(this);
    this.net = new Net(this);
    this.juice = new Juice();
    this.minimap = new Minimap(this, document.getElementById('ui'));
    this.pointer = new PointerNav(this);
    this.world.onNewDay = (day) => {
      const ev = this.economy.newDay();
      this.ui.toast(`🌅 ${day}일차 아침! 장터 시세가 바뀌었어요`);
      if (ev) this.ui.toast('📈 ' + ev.name);
    };
    this.saveTimer = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
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

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx?.setSize(w, h);
  }

  restore() {
    const s = loadSave();
    if (!s) { this.ui.toast('🦄 유니코 팜에 온 걸 환영해요! 안내 유니코에게 말을 걸어보세요'); return; }
    this.farm.sim.load(s.farm);
    this.farm.refreshAll();
    this.economy.load(s.economy);
    this.quests.load(s.quests);
    this.ranch.sim.load(s.ranch);
    this.rice.load(s.rice);
    this.nature.load(s.nature);
    this.villagers.load(s.villagers);
    this.collection.load(s.collection);
    this.koat.load(s.koat);
    if (this.koat.book.rewarded) this.player.setTitle('KOAT 명예 연구원');
    if (s.world) { this.world.time = s.world.time; this.world.day = s.world.day; }
    if (s.player) this.player.position.set(s.player.x, 0, s.player.z);
    this.ui.toast('💾 저장된 농장을 불러왔어요');
  }

  resetSave() { clearSave(); location.reload(); }

  /** KOAT 체험관 입구로 이동 */
  goKoat() {
    if (this.tractor.driving || this.smartfarm.active || this.nature.fishing || this.rice.threshing) return this.ui.toast('지금은 이동할 수 없어요');
    this.ui.closePanel();
    this.player.position.set(25, 0, -24);
    this.player.unico.facing = Math.PI;
    this.player.moveTarget = null;
    this.followCam.yaw = 0;
    this.followCam.pitch = 0.62;
    this.followCam.distance = 13;
    this.followCam.first = true;
    this.audio.play('levelup');
    this.ui.toast('🏢 KOAT 체험관에 도착! 본부별 부스에서 체험하고 안내데스크에서 스탬프를 확인하세요');
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
    const dt = Math.min(0.05, this.timer.getDelta());
    const input = this.input;
    if (input.justPressed('KeyI')) this.ui.panel ? this.ui.closePanel() : this.ui.openInventory();
    if (input.justPressed('KeyQ')) this.ui.panel ? this.ui.closePanel() : this.ui.openQuests();
    if (input.justPressed('Escape') && this.ui.panel) this.ui.closePanel();
    if (input.justPressed('KeyT')) this.ui.chatInput.focus();

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
      this.pointer.update(dt, input);
      const arrived = this.player.arrivedInteract;
      this.player.arrivedInteract = false;
      if (prompt?.onInteract && (input.interact() || arrived) && !this.ui.panel) prompt.onInteract();
      this.player.update(dt, input, this.followCam);
      this.followCam.update(dt, this.ui.panel ? null : input, pp);
    } else {
      this.smartfarm.update(dt, input, pp);
      this.farm.update(dt, pp);
      this.ranch.update(dt, pp);
      this.npcs.update(dt, pp);
      this.rice.update(dt, pp);
      this.nature.update(dt, pp);
      this.koat.update(dt, pp);
      // 운전 중에는 카메라가 트랙터 뒤를 따라감 (마우스로 돌려도 천천히 복귀)
      const behind = this.tractor.vehicle.heading + Math.PI;
      const dy = ((behind - this.followCam.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (!input.drag.active) this.followCam.yaw += dy * Math.min(1, dt * 3);
      this.followCam.update(dt, input, this.tractor.riderGroup.position);
    }
    this.ui.setPrompt(this.ui.panel ? null : prompt);
    this.net.update(dt);
    this.fx.update(dt);
    this.juice.update(dt, this.camera);
    SURF.time.value += dt;
    SURF.wind.value = this.world.weatherCur?.wind ?? 0.15;
    this.minimap.update(dt);
    this.ui.updateHud();
    // 비 오는 날 자동 물주기 (3초마다 점검)
    if (this.world.weatherKind === 'rain' || this.world.weatherKind === 'storm') {
      this.rainAcc += dt;
      if (this.rainAcc > 3) { this.rainAcc = 0; this.farm.sim.rain(); }
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; saveGame(this); }
    // 저사양: 그림자 맵을 3프레임마다 갱신 (정적 장면이 대부분이라 체감 차이 작음)
    if (this.quality.level === 'low') {
      this.renderer.shadowMap.autoUpdate = false;
      this.frameNo = (this.frameNo || 0) + 1;
      if (this.frameNo % 3 === 0) this.renderer.shadowMap.needsUpdate = true;
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
  await assets.loadAll((p) => (bar.style.width = Math.round(p * 100) + '%'));
  btn.disabled = false;
  btn.textContent = '입장하기';
  const start = () => {
    const name = (nick.value.trim() || randomName()).slice(0, 12);
    document.getElementById('loading').remove();
    window.game = new Game(canvas, assets, name);
    window.game.audio.play('click');
  };
  btn.onclick = start;
  nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  if (new URLSearchParams(location.search).has('autostart')) start();
}

boot();
export { QUESTS };

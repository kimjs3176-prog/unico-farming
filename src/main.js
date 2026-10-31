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

class Game {
  constructor(canvas, assets, name) {
    this.playerName = name;
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.world = new World(assets, this.renderer);
    this.followCam = new FollowCamera(this.camera);
    this.economy = new Economy();
    this.quests = new Quests();
    this.player = new Player(assets, this.world, name);
    this.ui = new UI(this, document.getElementById('ui'));
    this.fx = new FX(this.world.scene);
    this.farm = new FarmView(this);
    this.ranch = new RanchView(this);
    this.tractor = new TractorView(this);
    this.smartfarm = new SmartFarmView(this);
    this.npcs = new NPCs(this);
    this.net = new Net(this);
    this.minimap = new Minimap(this, document.getElementById('ui'));
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
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  restore() {
    const s = loadSave();
    if (!s) { this.ui.toast('🦄 유니코 팜에 온 걸 환영해요! 안내 유니코에게 말을 걸어보세요'); return; }
    this.farm.sim.load(s.farm);
    this.farm.refreshAll();
    this.economy.load(s.economy);
    this.quests.load(s.quests);
    this.ranch.sim.load(s.ranch);
    if (s.world) { this.world.time = s.world.time; this.world.day = s.world.day; }
    if (s.player) this.player.position.set(s.player.x, 0, s.player.z);
    this.ui.toast('💾 저장된 농장을 불러왔어요');
  }

  resetSave() { clearSave(); location.reload(); }

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
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const input = this.input;
    if (input.justPressed('KeyI')) this.ui.panel ? this.ui.closePanel() : this.ui.openInventory();
    if (input.justPressed('KeyQ')) this.ui.panel ? this.ui.closePanel() : this.ui.openQuests();
    if (input.justPressed('Escape') && this.ui.panel) this.ui.closePanel();
    if (input.justPressed('KeyT')) this.ui.chatInput.focus();

    this.world.update(dt);
    const pp = this.player.position;
    // 상호작용 후보 (우선순위: 운전 > 스마트팜 > NPC > 트랙터 > 밭 > 목장)
    let prompt = null;
    prompt = this.tractor.update(dt, input, pp) || prompt;
    if (!this.tractor.driving) {
      prompt = this.smartfarm.update(dt, input, pp) || prompt;
      prompt = prompt || this.npcs.update(dt, pp);
      const farmP = this.farm.update(dt, pp);
      const ranchP = this.ranch.update(dt, pp);
      prompt = prompt || farmP || ranchP;
      if (prompt?.onInteract && input.interact() && !this.ui.panel) prompt.onInteract();
      this.player.update(dt, input, this.followCam);
      this.followCam.update(dt, this.ui.panel ? null : input, pp);
    } else {
      this.smartfarm.update(dt, input, pp);
      this.farm.update(dt, pp);
      this.ranch.update(dt, pp);
      this.npcs.update(dt, pp);
      this.followCam.update(dt, input, this.tractor.riderGroup.position);
    }
    this.ui.setPrompt(this.ui.panel ? null : prompt);
    this.net.update(dt);
    this.fx.update(dt);
    this.minimap.update(dt);
    this.ui.updateHud();
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; saveGame(this); }
    this.renderer.render(this.world.scene, this.camera);
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

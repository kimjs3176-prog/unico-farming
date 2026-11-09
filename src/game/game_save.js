// Game 믹스인: 저장·불러오기·초기화
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import { saveGame, loadSave, clearSave } from './save.js';

export const GameSave = {
  /** 지금 상태 저장 (초기화 중이면 save.js 가 막음) */
  save() {
    this.saveTimer = 0;
    if (this._introPending) return; // 첫 접속: 인트로 시작 전에는 저장하지 않음 (저장이 생기면 다음 접속에 인트로가 안 나옴)
    saveGame(this);
  },

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
  },

  resetSave() { clearSave(); location.reload(); }, // clearSave 뒤에는 떠날 때 저장이 막힘 (지운 농장이 되살아나지 않게)
};

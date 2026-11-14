// Game 믹스인: 첫 접속 인트로·KOAT 체험관 첫 방문 컷신
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import { LAYOUT } from './world.js';
import { saveGame } from './save.js';

export const GameStory = {
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
  },

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
  },
};

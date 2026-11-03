import { starsHtml, starsFor } from './minigame_frame.js';
import {
  DIVISIONS, PASS_SCORE, TOUR_REWARD, makeMatchRound, scoreMatch, makeStagesRound, scoreStages, makeSortRound, scoreSort, SEED_KINDS,
  makeInspectRound, scoreInspect, makeCarbonRound, scoreCarbon,
} from '../game/sim/koat.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/** UI 클래스에 KOAT 체험관 패널들을 추가 */
export function installKoatUI(UI) {
  /** 부스: 본부 소개 → 체험 시작 */
  UI.prototype.openKoatBooth = function (d) {
    const g = this.game, book = g.koat.book;
    const p = this.openPanel(`${d.emoji} ${d.name}`);
    p.classList.add('koat');
    p.style.setProperty('--div', hex(d.color));
    p.append(h('div', 'koat-summary', d.summary));
    p.append(h('div', 'koat-teams', d.teams.map((t) => `<span>${t}</span>`).join('')));
    p.append(h('div', 'koat-game', `<b>🎮 ${d.game.title}</b><br>${d.game.how}`));
    const best = book.best[d.id];
    p.append(h('div', 'koat-meta', `${book.stamps[d.id] ? '✅ 스탬프 획득' : `⬜ ${PASS_SCORE}점 이상이면 스탬프`}${best !== undefined ? ` · 최고 ${best}점` : ''} · 스탬프 ${book.count}/${DIVISIONS.length}`));
    const go = h('button', 'gold koat-go', '체험 시작 ▶');
    go.onclick = () => this.startKoatGame(d);
    p.append(go);
  };

  UI.prototype.startKoatGame = function (d) {
    const fn = { match: this.koatMatch, stages: this.koatStages, sort: this.koatSort, inspect: this.koatInspect, carbon: this.koatCarbon, smartfarm: this.koatSmart }[d.game.type];
    fn.call(this, d);
  };

  /** 결과 화면 공통 */
  UI.prototype.koatResult = function (d, score, lines = []) {
    const g = this.game;
    const r = g.koat.record(d.id, score);
    const p = this.openPanel(`${d.emoji} ${d.game.title} 결과`);
    p.classList.add('koat');
    p.style.setProperty('--div', hex(d.color));
    p.append(h('div', `koat-score ${r.passed ? 'pass' : 'fail'}`, `${score}<small>점</small>`));
    p.append(h('div', 'mg-starrow koat-stars', starsHtml(starsFor(score, [PASS_SCORE, 85, 100]))));
    p.append(h('div', 'koat-meta', r.passed ? (r.newStamp ? `🎉 ${d.name} 스탬프 획득! (${g.koat.book.count}/${DIVISIONS.length})` : '👍 통과!') : `조금만 더! ${PASS_SCORE}점 이상이면 스탬프를 받아요`));
    if (lines.length) p.append(h('div', 'rows', lines.map((t) => `<div class="row">${t}</div>`).join('')));
    const row = h('div', 'koat-btns');
    const again = h('button', 'ghost', '🔁 다시 하기'); again.onclick = () => this.startKoatGame(d);
    const book = h('button', '', '🏷️ 스탬프 투어'); book.onclick = () => this.openKoatDesk();
    row.append(again, book);
    p.append(row);
    if (g.koat.book.complete && !g.koat.book.rewarded) this.toast('🏅 모든 스탬프를 모았어요! 안내데스크에서 보상을 받으세요');
  };

  // ---------------------------------------------------------- 기술사업: 기술이전 매칭
  UI.prototype.koatMatch = function (d) {
    const round = makeMatchRound();
    const ans = {};
    let sel = null;
    const p = this.openPanel(`${d.emoji} ${d.game.title}`);
    p.classList.add('koat'); p.style.setProperty('--div', hex(d.color));
    p.append(h('p', 'koat-how', '① 왼쪽 기술을 누르고 ② 오른쪽에서 그 기술이 필요한 기업을 누르세요.'));
    const grid = h('div', 'koat-match');
    const L = h('div', 'col'), R = h('div', 'col');
    const colors = ['#f2a33a', '#30b6aa', '#e35d5d', '#8e7cc3'];
    const paint = () => {
      L.querySelectorAll('button').forEach((b) => { const t = b.dataset.t; b.classList.toggle('sel', sel === t); const ci = round.techs.indexOf(t); b.style.borderColor = ans[t] ? colors[ci] : ''; });
      R.querySelectorAll('button').forEach((b) => { const owner = Object.keys(ans).find((t) => ans[t] === b.dataset.b); b.style.borderColor = owner ? colors[round.techs.indexOf(owner)] : ''; b.classList.toggle('used', !!owner); });
      done.disabled = Object.keys(ans).length < round.techs.length;
    };
    for (const t of round.techs) { const b = h('button', 'pick', t); b.dataset.t = t; b.onclick = () => { sel = t; this.game.audio.play('click'); paint(); }; L.append(b); }
    for (const by of round.buyers) {
      const b = h('button', 'pick', by); b.dataset.b = by;
      b.onclick = () => { if (!sel) return; for (const k of Object.keys(ans)) if (ans[k] === by) delete ans[k]; ans[sel] = by; sel = null; this.game.audio.play('plant'); paint(); };
      R.append(b);
    }
    grid.append(L, h('div', 'arrow', '➡️'), R);
    p.append(grid);
    const done = h('button', 'gold koat-go', '기술이전 계약 체결 ✍️');
    done.onclick = () => {
      const score = scoreMatch(round, ans);
      this.koatResult(d, score, round.techs.map((t) => `${ans[t] === round.answer[t] ? '✅' : '❌'} ${t} → <b>${round.answer[t]}</b>`).concat(['기술사업본부는 특허 창출 → 기술이전 → 사업화 자금·마케팅까지 함께 지원해요.']));
    };
    p.append(done);
    paint();
  };

  // ---------------------------------------------------------- 벤처창업: 단계별 지원
  UI.prototype.koatStages = function (d) {
    const round = makeStagesRound();
    const picks = [];
    const show = (i) => {
      if (i >= round.length) {
        const score = scoreStages(round, picks);
        return this.koatResult(d, score, round.map((s, k) => `${picks[k] === s.answer ? '✅' : '❌'} <b>${s.stage}</b>: ${s.options[s.answer]}`).concat(['전국 6개 농식품벤처창업센터(서울·경기·강원·충청·호남·영남)가 단계별로 원스톱 지원해요.']));
      }
      const s = round[i];
      const p = this.openPanel(`${d.emoji} ${d.game.title} (${i + 1}/${round.length})`);
      p.classList.add('koat'); p.style.setProperty('--div', hex(d.color));
      p.append(h('div', 'koat-stage', `<span class="tag">${s.stage} 단계</span> ${s.situation}`));
      p.append(h('p', 'koat-how', '어떤 지원이 가장 필요할까요?'));
      const opts = h('div', 'rows');
      s.options.forEach((o, k) => {
        const b = h('button', 'koat-opt', o);
        b.onclick = () => {
          picks[i] = k;
          b.classList.add(k === s.answer ? 'right' : 'wrong');
          this.game.audio.play(k === s.answer ? 'coin' : 'bump');
          setTimeout(() => show(i + 1), 550);
        };
        opts.append(b);
      });
      p.append(opts);
      p.append(h('div', 'koat-progress', round.map((_, k) => `<i class="${k < i ? 'on' : k === i ? 'cur' : ''}"></i>`).join('')));
    };
    show(0);
  };

  // ---------------------------------------------------------- 종자사업: 정선·품질검사 (시간제한)
  UI.prototype.koatSort = function (d) {
    const round = makeSortRound();
    const picked = new Set();
    const p = this.openPanel(`${d.emoji} ${d.game.title}`);
    p.classList.add('koat'); p.style.setProperty('--div', hex(d.color));
    p.append(h('p', 'koat-how', `불량 종자 ${Object.values(SEED_KINDS).filter((k) => k.bad).map((k) => k.emoji).join(' ')} 만 눌러 골라내세요. 좋은 종자 🌰 는 그대로!`));
    const timer = h('div', 'koat-timer', '');
    p.append(timer);
    const grid = h('div', 'koat-seeds');
    for (const it of round.items) {
      const b = h('button', 'seed', SEED_KINDS[it.kind].emoji);
      b.onclick = () => { if (picked.has(it.id)) { picked.delete(it.id); b.classList.remove('out'); } else { picked.add(it.id); b.classList.add('out'); } this.game.audio.play('click', 0.4); };
      grid.append(b);
    }
    p.append(grid);
    let left = round.time, ended = false;
    const finish = () => {
      if (ended) return; ended = true; clearInterval(iv);
      const score = scoreSort(round, picked);
      const bad = round.items.filter((x) => SEED_KINDS[x.kind].bad);
      this.koatResult(d, score, [
        `불량 ${bad.length}개 중 ${bad.filter((x) => picked.has(x.id)).length}개 골라냄, 좋은 종자 ${round.items.filter((x) => !SEED_KINDS[x.kind].bad && picked.has(x.id)).length}개 실수로 버림`,
        '종자종합처리센터에서는 정선(골라내기)·검사·소독을 거쳐 품질 좋은 보급종을 농가에 공급하고, QR코드로 유통을 관리해요.',
      ]);
    };
    const iv = setInterval(() => { left -= 0.1; timer.innerHTML = `⏱ ${Math.max(0, left).toFixed(1)}초 <i style="width:${(left / round.time) * 100}%"></i>`; if (left <= 0 || !p.isConnected) { if (p.isConnected) finish(); else clearInterval(iv); } }, 100);
    const done = h('button', 'gold koat-go', '정선 완료 ✔');
    done.onclick = finish;
    p.append(done);
  };

  // ---------------------------------------------------------- 스마트농업: 실증 테스트 (기존 미니게임 재사용)
  UI.prototype.koatSmart = function (d) {
    this.closePanel();
    const sf = this.game.smartfarm;
    sf.onFinish = (r) => this.koatResult(d, r.score, [`적정 환경 유지율 ${r.score}%`, '김제·상주 스마트팜 혁신밸리 실증단지에서 기업의 스마트팜 기자재와 기술을 실제 온실에서 시험해요.']);
    sf.start();
  };

  // ---------------------------------------------------------- 농기계검정: 안전 검정
  UI.prototype.koatInspect = function (d) {
    const round = makeInspectRound();
    const verdicts = [];
    const p = this.openPanel(`${d.emoji} ${d.game.title}`);
    p.classList.add('koat'); p.style.setProperty('--div', hex(d.color));
    p.append(h('p', 'koat-how', '측정값이 기준을 만족하면 <b>적합</b>, 아니면 <b>부적합</b>을 누르세요.'));
    const rows = h('div', 'rows');
    round.forEach((it, i) => {
      const r = h('div', 'row koat-insp', `<span class="nm">${it.name}</span><span class="qty">기준 ${it.std}${it.unit ? ' ' + it.unit : ''}</span><span class="pr">${typeof it.value === 'number' ? it.value.toLocaleString() : it.value}${it.unit ? ' ' + it.unit : ''}</span>`);
      const ok = h('button', 'ghost', '적합'), ng = h('button', 'ghost', '부적합');
      ok.onclick = () => { verdicts[i] = true; ok.className = 'on-ok'; ng.className = 'ghost'; check(); };
      ng.onclick = () => { verdicts[i] = false; ng.className = 'on-ng'; ok.className = 'ghost'; check(); };
      r.append(ok, ng);
      rows.append(r);
    });
    p.append(rows);
    const done = h('button', 'gold koat-go', '검정 성적서 발급 📄');
    const check = () => { done.disabled = round.some((_, i) => verdicts[i] === undefined); };
    done.onclick = () => {
      const score = scoreInspect(round, verdicts);
      this.koatResult(d, score, round.map((it, i) => `${verdicts[i] === it.pass ? '✅' : '❌'} ${it.name}: ${it.pass ? '적합' : '부적합'}`).concat(['농기계검정본부는 농업기계 검정·시험평가와 자율주행 농기계 성능시험, OECD 트랙터 시험을 수행해요.']));
    };
    p.append(done);
    check();
  };

  // ---------------------------------------------------------- 농업환경분석: 저탄소 인증
  UI.prototype.koatCarbon = function (d) {
    const round = makeCarbonRound();
    const chosen = new Set();
    const p = this.openPanel(`${d.emoji} ${d.game.title}`);
    p.classList.add('koat'); p.style.setProperty('--div', hex(d.color));
    p.append(h('p', 'koat-how', '온실가스를 <b>줄이는</b> 영농 방법 카드만 골라 인증 신청서에 담으세요.'));
    const grid = h('div', 'koat-cards');
    round.forEach((c, i) => {
      const b = h('button', 'card', c.text);
      b.onclick = () => { if (chosen.has(i)) chosen.delete(i); else chosen.add(i); b.classList.toggle('on', chosen.has(i)); this.game.audio.play('click', 0.4); };
      grid.append(b);
    });
    p.append(grid);
    const done = h('button', 'gold koat-go', '저탄소 인증 심사 신청 🌿');
    done.onclick = () => {
      const score = scoreCarbon(round, chosen);
      this.koatResult(d, score, round.map((c, i) => `${chosen.has(i) === c.good ? '✅' : '❌'} ${c.text} — ${c.good ? '감축' : '배출 증가'}: ${c.why}`).concat(['농업환경분석본부는 토양·잔류농약 분석, 온실가스 감축사업, 저탄소 농축산물 인증을 운영해요.']));
    };
    p.append(done);
  };

  // ---------------------------------------------------------- 안내데스크: 기관 소개 + 스탬프 투어
  UI.prototype.openKoatDesk = function () {
    const g = this.game, book = g.koat.book;
    const p = this.openPanel('🏢 KOAT 체험관 안내데스크');
    p.classList.add('koat'); p.style.setProperty('--div', '#30b6aa');
    p.append(h('div', 'koat-summary', '한국농업기술진흥원(KOAT)은 농업 R&D 성과가 현장과 시장에서 쓰이도록 기술 사업화·창업·종자·스마트농업·검정·환경분석을 지원하는 기관이에요. 기획운영본부는 경영전략·인사·안전·예산으로 각 본부를 뒷받침해요. 6개 본부 부스를 돌며 체험하고 스탬프를 모아 보세요!'));
    const grid = h('div', 'koat-stamps');
    for (const d of DIVISIONS) {
      const got = book.stamps[d.id];
      const cell = h('button', `stamp ${got ? 'got' : ''}`, `<span class="em">${got ? d.emoji : '⬜'}</span><b>${d.name}</b><small>${d.game.title}${book.best[d.id] !== undefined ? ` · ${book.best[d.id]}점` : ''}</small>`);
      cell.style.setProperty('--div', hex(d.color));
      cell.onclick = () => this.openKoatBooth(d);
      grid.append(cell);
    }
    p.append(grid);
    p.append(h('div', 'koat-meta', `스탬프 ${book.count}/${DIVISIONS.length} · 모두 모으면 ${TOUR_REWARD.money}🪙 + ${TOUR_REWARD.xp}XP + 칭호 “${TOUR_REWARD.title}”`));
    if (book.complete) {
      const b = h('button', 'gold koat-go', book.rewarded ? `🏅 ${TOUR_REWARD.title}` : '🎁 투어 완주 보상 받기');
      b.disabled = book.rewarded;
      b.onclick = () => {
        const r = book.claim();
        if (!r) return;
        g.economy.earn(r.money);
        g.quests.xp += r.xp;
        g.player.setTitle?.(r.title);
        g.audio.play('levelup');
        g.player.unico.playAction('cheer', 2);
        this.toast(`🏅 칭호 “${r.title}” 획득! +${r.money}🪙 +${r.xp}XP`);
        this.openKoatDesk();
      };
      p.append(b);
    }
    const go = h('div', 'koat-meta', '💡 부스 앞에서 E 를 누르거나 부스를 클릭하면 체험이 시작돼요. 출처: koat.or.kr 조직도·주요사업');
    p.append(go);
  };
}

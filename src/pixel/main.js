import './style.css';
import { buildSprites } from './sprites.js';
import { Renderer } from './render.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Audio } from '../game/audio.js';
import { Music } from '../game/music.js';

/**
 * 유니코 팜 — 도트(2.5D) 버전
 * 3D 버전과 같은 게임 규칙(src/game/sim)을 쓰고, 그래픽만 코드로 찍은 도트 + HD-2D 풍 후처리
 */
const canvas = document.getElementById('game');
const audio = new Audio();
const music = new Music(audio);
const t0 = performance.now();
const S = buildSprites();
const ui = new UI(document.getElementById('ui'), S, audio);
const game = new Game(S, ui, audio, music);
const R = new Renderer(canvas, S, game.map);
window.__pixel = { game, R, S, bootMs: Math.round(performance.now() - t0) };

try { const fx = JSON.parse(localStorage.getItem('unico-pixel-fx') || 'null'); if (fx) { Object.assign(R.fx, fx); R.auto = false; } } catch { /* */ }
const saveFx = () => { try { localStorage.setItem('unico-pixel-fx', JSON.stringify(R.fx)); } catch { /* */ } };

ui.onAction = (a) => {
  if (a === 'bag') game.bag();
  else if (a === 'quests') game.questMenu();
  else if (a === 'seed') game.cycleSeed();
  else if (a === 'weather') { game.raining = !game.raining; ui.toast(game.raining ? '비가 내려요 (밭에 물이 저절로 차요)' : '날이 개었어요', game.raining ? 'rain' : 'sun'); }
  else if (a === 'fx') { const on = !R.fx.dof; R.fx.dof = R.fx.bloom = R.fx.vignette = on; R.auto = false; saveFx(); ui.toast(on ? 'HD-2D 효과 켬 (흐림·빛 번짐·비네팅)' : 'HD-2D 효과 끔 (순수 도트)', 'star'); }
  else if (a === 'sound') { audio.cycle(); }
};

/* ── 키보드 ── */
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyE: 'ok', Space: 'ok', Enter: 'ok', KeyZ: 'ok', Escape: 'back', KeyX: 'back', Backspace: 'back',
};
addEventListener('keydown', (e) => {
  if (!started) { if (e.code === 'Enter' || e.code === 'Space') start(); return; }
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { game.run = true; return; }
  if (e.code === 'Space' && game.tr.driving && !ui.busy) { e.preventDefault(); if (!e.repeat) game.togglePlow(); return; }
  const k = KEYMAP[e.code] || (/^Digit[1-9]$/.test(e.code) ? e.code.slice(5) : null);
  if (k) { e.preventDefault(); if (!e.repeat || !['up', 'down', 'left', 'right'].includes(k) || ui.busy) game.press(k); return; }
  if (ui.busy) return;
  if (e.code === 'KeyQ') game.cycleSeed();
  else if (e.code === 'KeyI') game.bag();
  else if (e.code === 'KeyJ') game.questMenu();
  else if (e.code === 'KeyR') ui.onAction('weather');
  else if (e.code === 'KeyF') ui.onAction('fx');
  else if (e.code === 'KeyM') audio.cycle();
});
addEventListener('keyup', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') game.run = false;
  const k = KEYMAP[e.code]; if (k) game.release(k);
});
addEventListener('blur', () => { game.held = []; game.run = false; });

/* ── 마우스·터치: 누른 곳으로 걸어가기 ── */
canvas.addEventListener('pointerdown', (e) => {
  if (!started) return;
  audio._ctx();
  const t = R.screenToTile(e.clientX, e.clientY);
  game.tapTile(t.x, t.y);
});
const pad = document.querySelector('.pad'), ab = document.querySelector('.abtns');
pad.addEventListener('pointerdown', (e) => { const d = e.target.closest('[data-d]')?.dataset.d; if (d) { e.preventDefault(); game.press(d); e.target.setPointerCapture?.(e.pointerId); } });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) pad.addEventListener(ev, (e) => { const d = e.target.closest('[data-d]')?.dataset.d; if (d) game.release(d); });
ab.addEventListener('pointerdown', (e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return; e.preventDefault(); if (k === 'a') game.press('ok'); else if (game.tr.driving) game.togglePlow(); else if (ui.busy || game.fish) game.press('back'); else { game.run = !game.run; e.target.classList.toggle('on', game.run); } });
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

addEventListener('resize', () => R.resize());
addEventListener('beforeunload', () => game.save());
document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

/* ── 시작 화면 ── */
let started = false;
const title = document.getElementById('title');
const btn = document.getElementById('start');
btn.disabled = false;
for (const [id, key, look, dir, f] of [['hero1', 'granny', { mane: 'silver', shawl: 'purple' }, 'right', 0], ['hero2', 'player', { scarf: 'scarf' }, 'down', 0], ['hero3', 'kid', { mane: 'rose', small: true }, 'left', 0]]) document.getElementById(id).src = S.char(key, look, dir, f).toDataURL();
btn.onclick = () => start();
function start() {
  if (started) return;
  started = true;
  document.body.classList.add('started');
  title.classList.add('out');
  setTimeout(() => title.remove(), 700);
  audio._ctx(); music.start();
  if (!localStorage.getItem('unico-pixel-intro')) {
    try { localStorage.setItem('unico-pixel-intro', '1'); } catch { /* */ }
    const n = game.npcs.find((x) => x.id === 'guide');
    setTimeout(() => game.talk(n), 600);
  }
}

/* ── 루프 ── */
let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (started) game.update(dt);
  R.render(game, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

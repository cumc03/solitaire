// 같은 그림 찾기: 16장(8쌍). 그림은 과일·꽃·동물 12가지 중 판마다 8가지를 섞어 쓴다.
import { play } from '../../core/sound.js';
import { mountShell } from '../../core/shell.js';
import { createClock, formatTime, formatMinutes } from '../../core/clock.js';
import { addWin, clearSave, getSave, putSave } from '../../core/records.js';
import { winProgressHtml } from '../../core/progress-view.js';
import { shuffleInPlace } from '../../core/random.js';
import { PICTURES, pictureSrc } from '../pictures.js';

const GAME = 'memory';
const PAIRS = 8;
const MISMATCH_MS = 900;

export const entry = {
  mount,
  describeSave: (save) => `찾은 짝 ${save.state.cards.filter((c) => c.matched).length / 2}개, ${formatMinutes(save.elapsedMs)}`,
  recordLine: (rec) => `이긴 판 ${rec.wins}${rec.best.time ? `, 최고 기록 ${formatTime(rec.best.time)}` : ''}`,
};

function newGame() {
  const pics = shuffleInPlace(PICTURES.map((p) => p.id)).slice(0, PAIRS);
  return { cards: shuffleInPlace([...pics, ...pics].map((pic) => ({ pic, matched: false }))), open: [], flips: 0 };
}

function mount(root, { onHome }) {
  const shell = mountShell(root, {
    game: GAME,
    tally: [{ id: 'time', label: '시간' }, { id: 'flips', label: '뒤집기' }, { id: 'pairs', label: '찾은 짝' }],
    actions: [{ id: 'new', icon: 'ph-plus-circle', label: '새 게임' }],
    onAction: (a) => { if (a === 'new') askNewGame(); },
    onHome: () => { persist(); onHome(); },
  });
  const board = shell.board;
  board.setAttribute('aria-label', '같은 그림 찾기 판');

  const saved = getSave(GAME);
  // 저장된 판에서 짝이 안 맞은 채 열려 있던 카드는 덮은 상태로 이어 간다
  let state = saved?.state ? { ...saved.state, open: [] } : newGame();
  const clock = createClock(saved?.elapsedMs ?? 0);
  let locked = false;

  function persist() {
    const done = state.cards.every((c) => c.matched);
    if (!done && state.flips > 0) putSave(GAME, { state, elapsedMs: clock.elapsed() });
  }

  function draw() {
    board.innerHTML = `<div class="memory-grid">${state.cards.map((c, i) => `
      <button type="button" class="mcard${c.matched ? ' is-up is-matched' : ''}" data-i="${i}" aria-label="${c.matched ? '맞춘 카드' : '덮인 카드'}">
        <span class="mcard__inner">
          <span class="mcard__face mcard__front"><img src="${pictureSrc(c.pic)}" alt="" draggable="false"></span>
          <span class="mcard__face mcard__back"></span>
        </span>
      </button>`).join('')}</div>`;
    fit();
    sync();
  }

  function sync() {
    shell.set('flips', state.flips);
    shell.set('pairs', `${state.cards.filter((c) => c.matched).length / 2}/${PAIRS}`);
  }

  // 판에 꼭 맞는 카드 크기. 세로로 긴 화면은 3:4 카드로 높이까지 쓴다.
  function fit() {
    const grid = board.querySelector('.memory-grid');
    if (!grid) return;
    const r = board.getBoundingClientRect();
    const gap = 10;
    const ratio = r.height > r.width * 1.15 ? 4 / 3 : 1;
    const cw = Math.max(48, Math.min((r.width - 24 - 3 * gap) / 4, (r.height - 24 - 3 * gap) / 4 / ratio));
    grid.style.setProperty('--cw', `${cw}px`);
    grid.style.setProperty('--ch', `${cw * ratio}px`);
    grid.style.setProperty('--gap', `${gap}px`);
  }

  const cardEl = (i) => board.querySelector(`.mcard[data-i="${i}"]`);

  function flipUp(i) {
    const el = cardEl(i);
    el.classList.add('is-up');
    el.setAttribute('aria-label', '열린 카드');
  }

  function flipDown(i) {
    const el = cardEl(i);
    el.classList.remove('is-up');
    el.setAttribute('aria-label', '덮인 카드');
  }

  function onPick(e) {
    const btn = e.target.closest('.mcard');
    if (!btn || locked) return;
    const i = Number(btn.dataset.i);
    const card = state.cards[i];
    if (card.matched || state.open.includes(i)) return;
    if (!clock.running()) clock.start();
    flipUp(i);
    play('flip');
    state.open.push(i);
    state.flips += 1;
    sync();
    if (state.open.length < 2) return persist();

    const [a, b] = state.open;
    if (state.cards[a].pic === state.cards[b].pic) {
      state.cards[a].matched = true;
      state.cards[b].matched = true;
      state.open = [];
      [a, b].forEach((k) => cardEl(k).classList.add('is-matched'));
      play('match');
      sync();
      if (state.cards.every((c) => c.matched)) return win();
      return persist();
    }
    locked = true;
    setTimeout(() => {
      [a, b].forEach(flipDown);
      state.open = [];
      locked = false;
      play('miss');
      persist();
    }, MISMATCH_MS);
  }

  async function win() {
    clock.pause();
    const ms = clock.elapsed();
    clearSave(GAME);
    const { record, improved, monthCount } = addWin(GAME, { time: ms, flips: state.flips }, { time: 'min', flips: 'min' });
    play('win');
    const lines = [`걸린 시간 ${formatTime(ms)}`, `뒤집은 횟수 ${state.flips}번`];
    if (improved.includes('time')) lines.push('가장 빠른 기록을 새로 세웠어요');
    const choice = await shell.ask({
      title: '다 찾았습니다',
      body: lines.join('<br>'),
      extra: winProgressHtml(record.wins, monthCount),
      choices: [{ id: 'new', label: '새 게임', primary: true }, { id: 'home', label: '처음으로' }],
    });
    if (choice === 'new') startGame();
    else onHome();
  }

  async function askNewGame() {
    if (state.flips === 0) return startGame();
    const choice = await shell.ask({
      title: '새 게임',
      body: '카드를 새로 섞을까요? 하던 판은 없어집니다.',
      choices: [{ id: 'new', label: '새로 섞기', primary: true }, { id: 'keep', label: '하던 판 계속' }],
    });
    if (choice === 'new') startGame();
  }

  function startGame() {
    state = newGame();
    locked = false;
    clock.reset(0);
    clearSave(GAME);
    draw();
    tick();
  }

  function tick() {
    shell.set('time', formatTime(clock.elapsed()));
  }

  board.addEventListener('click', onPick);
  const ro = new ResizeObserver(fit);
  ro.observe(board);
  draw();
  if (saved) clock.start();
  tick();
  const timer = setInterval(tick, 1000);
  window.addEventListener('pagehide', persist);

  return {
    destroy() {
      persist();
      ro.disconnect();
      clearInterval(timer);
      clock.dispose();
      window.removeEventListener('pagehide', persist);
      shell.destroy();
    },
  };
}

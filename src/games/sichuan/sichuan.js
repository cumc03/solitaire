// 사천성: 같은 그림 두 장을 꺾임 두 번 이하의 길로 이어 치운다. 규칙과 단계표는 rules.js.
// 판을 깰 때마다 다음 단계로 넘어가고, 세 단계마다 조금씩 어려워진다.
import { play } from '../../core/sound.js';
import { mountShell } from '../../core/shell.js';
import { shuffleInPlace } from '../../core/random.js';
import { createClock, formatTime, formatMinutes } from '../../core/clock.js';
import { addWin, clearSave, getProgress, getSave, putProgress, putSave } from '../../core/records.js';
import { winProgressHtml } from '../../core/progress-view.js';
import { MORE_PICTURES, PICTURES, pictureSrc } from '../pictures.js';
import { deal, findHint, findPath, settle, shuffle, stageSpec } from './rules.js';

const GAME = 'sichuan';
const TILE_RATIO = 1.2;   // 패 높이 / 너비
const GAP = 6;
const PAD = 0.35;         // 판 둘레 여백(패 너비 대비). 바깥 테두리로 잇는 길이 이 여백을 지난다.
const PATH_MS = 380;      // 떨어진 짝: 이은 길이 보이는 시간
const LEAVE_MS = 260;     // 떨어진 짝: 패가 줄며 사라지는 시간
const MEET_MS = 240;      // 바로 옆 짝: 서로 다가가 사라지는 시간
const SLIDE_MS = 260;     // 쏠림 단계: 남은 패가 빈칸으로 미끄러지는 시간
const HINT_MS = 2200;

const ALL_PICTURES = [...PICTURES, ...MORE_PICTURES];
const pictureName = (id) => ALL_PICTURES.find((p) => p.id === id).name;
const GRAVITY_WORD = { down: '아래로', up: '위로', left: '왼쪽으로', right: '오른쪽으로' };

const left = (board) => board.cells.filter((v) => v >= 0).length;
// 단계가 들어 있는 판만 이어 한다(단계 방식 전의 저장본은 버린다)
const validSave = (save) => Number.isInteger(save?.state?.stage);
const progressOf = () => getProgress(GAME, { stage: 1, top: 1 });

export const entry = {
  mount,
  describeSave: (save) => (validSave(save) ? `${save.state.stage}단계, 남은 패 ${left(save.state.board)}장, ${formatMinutes(save.elapsedMs)}` : '새로 시작'),
  recordLine: (rec) => `이긴 판 ${rec.wins}, 지금 ${progressOf().stage}단계`,
};

// 판 크기에 맞는 패 너비
function tileWidth(cols, rows, w, h) {
  return Math.min((w - (cols - 1) * GAP) / (cols + 2 * PAD), (h - (rows - 1) * GAP) / (rows * TILE_RATIO + 2 * PAD));
}

// 이 단계에서 처음 달라지는 점(판이 커짐·그림이 늘어남·패가 쏠림)을 한 줄로. 같으면 null.
function newRule(stage) {
  if (stage < 2) return null;
  const now = stageSpec(stage);
  const before = stageSpec(stage - 1);
  if (now.gravity && now.gravity !== before.gravity) return `짝을 치우면 남은 패가 ${GRAVITY_WORD[now.gravity]} 쏠립니다`;
  if (now.cols * now.rows > before.cols * before.rows) return '패가 조금 늘어납니다';
  if (now.counts.length > before.counts.length) return '그림 가짓수가 늘어납니다';
  return null;
}

function mount(root, { onHome }) {
  const shell = mountShell(root, {
    game: GAME,
    tally: [{ id: 'time', label: '시간' }, { id: 'stage', label: '단계' }, { id: 'left', label: '남은 패' }],
    actions: [
      { id: 'undo', icon: 'ph-arrow-counter-clockwise', label: '되돌리기' },
      { id: 'hint', icon: 'ph-lightbulb', label: '힌트' },
      { id: 'shuffle', icon: 'ph-shuffle', label: '섞기' },
      { id: 'new', icon: 'ph-plus-circle', label: '새 게임' },
    ],
    onAction: (a) => ({ undo, hint, shuffle: reshuffle, new: askNewGame })[a]?.(),
    onHome: () => { persist(); onHome(); },
  });
  const board = shell.board;
  board.setAttribute('aria-label', '사천성 판');

  let saved = getSave(GAME);
  if (saved && !validSave(saved)) {
    clearSave(GAME);
    saved = null;
  }
  let state = saved?.state ?? null;
  const clock = createClock(saved?.elapsedMs ?? 0);
  let picked = -1;
  let settling = false;     // 쏠림 단계에서 패가 미끄러지는 동안은 누르지 않는다
  let hintTimer = 0;
  let pathTimer = 0;

  // 판 모양(예: 8×6 또는 6×8)은 새 판을 낼 때 화면에 더 크게 들어가는 쪽으로 고른다.
  // 그림은 판마다 골라 state.pics에 두고, 칸에는 그 목록의 번호를 쓴다.
  function newGame(stage) {
    const { cols, rows, counts } = stageSpec(stage);
    const r = board.getBoundingClientRect();
    const wide = tileWidth(cols, rows, r.width - 16, r.height - 16) >= tileWidth(rows, cols, r.width - 16, r.height - 16);
    const pool = counts.length > PICTURES.length ? ALL_PICTURES : PICTURES;
    const pics = shuffleInPlace(pool.map((p) => p.id)).slice(0, counts.length);
    return { stage, pics, board: deal(wide ? { cols, rows, counts } : { cols: rows, rows: cols, counts }), history: [] };
  }

  function persist() {
    if (state && state.history.length > 0 && left(state.board) > 0) putSave(GAME, { state, elapsedMs: clock.elapsed() });
  }

  function tileHtml(i, v, k = 0) {
    if (v < 0) return `<span class="tile-slot" data-i="${i}"></span>`;
    const id = state.pics[v];
    return `<button type="button" class="tile" data-i="${i}" style="--d:${k}" aria-label="${pictureName(id)}">
      <img src="${pictureSrc(id)}" alt="" draggable="false"></button>`;
  }

  function draw({ dealing = false } = {}) {
    const { cols, rows, cells } = state.board;
    let k = 0;
    board.innerHTML = `<div class="sichuan${dealing ? ' is-dealing' : ''}" style="--cols:${cols};--rows:${rows}">
      ${cells.map((v, i) => tileHtml(i, v, v >= 0 ? k++ : 0)).join('')}
      <svg class="sichuan__path" aria-hidden="true"></svg>
    </div>`;
    picked = -1;
    fit();
    sync();
  }

  function sync() {
    shell.set('stage', `${state.stage}단계`);
    shell.set('left', left(state.board));
    shell.setDisabled('undo', state.history.length === 0);
  }

  function fit() {
    const wrap = board.querySelector('.sichuan');
    if (!wrap) return;
    const r = board.getBoundingClientRect();
    const tw = Math.max(28, tileWidth(state.board.cols, state.board.rows, r.width - 16, r.height - 16));
    wrap.style.setProperty('--tw', `${tw}px`);
    wrap.style.setProperty('--th', `${tw * TILE_RATIO}px`);
    wrap.style.setProperty('--gap', `${GAP}px`);
    wrap.style.setProperty('--pad', `${tw * PAD}px`);
  }

  const tileEl = (i) => board.querySelector(`[data-i="${i}"]`);

  // 판 좌표 [행, 열]의 패 한가운데. 테두리(-1, rows/cols)는 둘레 여백의 가운데로.
  function center([r, c]) {
    const { cols, rows } = state.board;
    const tw = parseFloat(board.querySelector('.sichuan').style.getPropertyValue('--tw'));
    const th = tw * TILE_RATIO;
    const pad = tw * PAD;
    const axis = (n, max, size) => {
      if (n < 0) return pad / 2;
      if (n >= max) return pad + max * (size + GAP) - GAP + pad / 2;
      return pad + n * (size + GAP) + size / 2;
    };
    return [axis(c, cols, tw), axis(r, rows, th)];
  }

  function showPath(path) {
    const svg = board.querySelector('.sichuan__path');
    const pts = path.map((p) => center(p).join(',')).join(' ');
    svg.innerHTML = `<polyline class="path-glow" points="${pts}"/><polyline class="path-line" points="${pts}" pathLength="1"/>`;
    clearTimeout(pathTimer);
    pathTimer = setTimeout(() => { svg.innerHTML = ''; }, PATH_MS + LEAVE_MS);
  }

  function select(i) {
    tileEl(picked)?.classList.remove('is-picked');
    picked = i;
    tileEl(i)?.classList.add('is-picked');
  }

  function clearHint() {
    clearTimeout(hintTimer);
    board.querySelectorAll('.tile.is-hint').forEach((el) => el.classList.remove('is-hint'));
  }

  function onPick(e) {
    const btn = e.target.closest('.tile');
    if (!btn || settling || btn.matches('.is-leaving, .is-meeting')) return;
    const i = Number(btn.dataset.i);
    if (!clock.running()) clock.start();
    if (picked === i) { select(-1); return play('place'); }
    if (picked < 0 || state.board.cells[picked] !== state.board.cells[i]) { select(i); return play('place'); }

    const a = picked;
    const path = findPath(state.board, a, i);
    if (!path) {
      // 같은 그림인데 이을 길이 없으면 두 장을 흔들어 알려 준다
      [a, i].forEach((k) => {
        const el = tileEl(k);
        el.classList.remove('is-shaking');
        void el.offsetWidth;
        el.classList.add('is-shaking');
      });
      select(-1);
      return play('miss');
    }
    match(a, i, path);
  }

  function match(a, b, path) {
    // 되돌리기는 짝을 치우기 전 판 전체로 돌아간다(쏠림으로 패가 움직여도 맞도록)
    state.history.push({ cells: state.board.cells, a, b });
    const cells = [...state.board.cells];
    cells[a] = -1;
    cells[b] = -1;
    state.board = { ...state.board, cells };
    select(-1);
    clearHint();
    play('match');
    // 바로 옆에 붙은 짝은 길을 그리지 않고 서로 다가가 사라진다(길이 그림을 가로지르기만 해서)
    const near = path.length === 2;
    const doneMs = near ? MEET_MS : PATH_MS + LEAVE_MS;
    if (!near) showPath(path);
    const { cols } = state.board;
    [[a, b], [b, a]].forEach(([k, other]) => {
      const el = tileEl(k);
      if (near) {
        el.style.setProperty('--meet-x', (other % cols) - (k % cols));
        el.style.setProperty('--meet-y', Math.floor(other / cols) - Math.floor(k / cols));
      }
      el.classList.add(near ? 'is-meeting' : 'is-leaving');
      setTimeout(() => { if (el.isConnected) el.outerHTML = tileHtml(k, -1); }, doneMs);
    });
    sync();
    if (left(state.board) === 0) return void setTimeout(win, doneMs);
    const { gravity } = stageSpec(state.stage);
    if (gravity) {
      settling = true;
      setTimeout(() => slide(gravity), doneMs);
    } else if (!findHint(state.board)) setTimeout(() => autoShuffle(), doneMs);
    persist();
  }

  // 쏠림: 남은 패가 빈칸으로 미끄러진다. 새 자리에 그린 뒤 옛 자리에서 출발하는 움직임을 붙인다.
  function slide(gravity) {
    const { board: next, moves } = settle(state.board, gravity);
    state.board = next;
    draw();
    const { cols } = next;
    for (const [from, to] of moves) {
      const el = tileEl(to);
      el.style.setProperty('--from-x', (from % cols) - (to % cols));
      el.style.setProperty('--from-y', Math.floor(from / cols) - Math.floor(to / cols));
      el.classList.add('is-sliding');
    }
    setTimeout(() => {
      settling = false;
      board.querySelectorAll('.is-sliding').forEach((el) => el.classList.remove('is-sliding'));
      if (!findHint(state.board)) autoShuffle();
      persist();
    }, moves.size ? SLIDE_MS : 0);
  }

  function autoShuffle() {
    if (findHint(state.board)) return;
    state.board = shuffle(state.board);
    draw({ dealing: true });
    shell.toast('이을 짝이 없어 섞었습니다');
    play('flip');
    persist();
  }

  function reshuffle() {
    if (!state || settling) return;
    if (left(state.board) === 0) return;
    state.board = shuffle(state.board);
    draw({ dealing: true });
    play('flip');
    persist();
  }

  function undo() {
    if (!state || settling) return;
    const last = state.history.pop();
    if (!last) return;
    const { cells, a, b } = last;
    state.board = { ...state.board, cells };
    draw();
    [a, b].forEach((k) => tileEl(k)?.classList.add('is-back'));
    play('place');
    persist();
  }

  function hint() {
    if (!state || settling) return;
    clearHint();
    const pair = findHint(state.board);
    if (!pair) return;
    pair.forEach((k) => tileEl(k)?.classList.add('is-hint'));
    hintTimer = setTimeout(clearHint, HINT_MS);
    play('tick');
  }

  async function win() {
    clock.pause();
    const ms = clock.elapsed();
    clearSave(GAME);
    const done = state.stage;
    putProgress(GAME, { stage: done + 1, top: Math.max(progressOf().top, done + 1) });
    const { record, monthCount } = addWin(GAME, {}, {});
    play('win');
    const lines = [`${done}단계를 깼습니다`, `걸린 시간 ${formatTime(ms)}`];
    const news = newRule(done + 1);
    if (news) lines.push(`다음 단계부터 ${news}`);
    const choice = await shell.ask({
      title: '다 치웠습니다',
      body: lines.join('<br>'),
      extra: winProgressHtml(record.wins, monthCount),
      choices: [{ id: 'next', label: `${done + 1}단계`, sub: '다음 단계로', primary: true }, { id: 'home', label: '처음으로' }],
    });
    if (choice === 'next') startGame(done + 1);
    else onHome();
  }

  // 새 판: 지금 단계를 새로 깔거나, 한 단계 쉽게(또는 이미 가 본 데까지 어렵게) 고른다
  async function askNewGame() {
    const { stage, top } = progressOf();
    const playing = state && state.history.length > 0 && left(state.board) > 0;
    const options = [
      stage > 1 && { id: String(stage - 1), label: `${stage - 1}단계`, sub: '한 단계 쉽게' },
      { id: String(stage), label: `${stage}단계`, sub: '새로 깔기', primary: true },
      stage < top && { id: String(stage + 1), label: `${stage + 1}단계`, sub: '한 단계 어렵게' },
    ].filter(Boolean);
    const choice = await shell.ask({
      title: '새 게임',
      body: playing ? '하던 판은 없어집니다.' : '',
      choices: options,
      dismiss: state && left(state.board) > 0 ? { id: 'keep', label: '하던 판 계속하기' } : { id: 'home', label: '처음으로' },
    });
    const chosen = Number(choice);
    if (Number.isInteger(chosen) && chosen > 0) {
      putProgress(GAME, { stage: chosen, top });
      startGame(chosen);
    } else if (choice === 'home') onHome();
  }

  function startGame(stage) {
    state = newGame(stage);
    settling = false;
    clearHint();
    clock.reset(0);
    clearSave(GAME);
    draw({ dealing: true });
    const { gravity } = stageSpec(stage);
    if (gravity) shell.toast(`이번 판은 짝을 치우면 남은 패가 ${GRAVITY_WORD[gravity]} 쏠립니다`);
    tick();
  }

  function tick() {
    shell.set('time', formatTime(clock.elapsed()));
  }

  board.addEventListener('click', onPick);
  const ro = new ResizeObserver(fit);
  ro.observe(board);
  if (state) draw();
  else startGame(progressOf().stage);
  if (saved) clock.start();
  tick();
  const timer = setInterval(tick, 1000);
  window.addEventListener('pagehide', persist);

  return {
    destroy() {
      persist();
      ro.disconnect();
      clearInterval(timer);
      clearHint();
      clearTimeout(pathTimer);
      clock.dispose();
      window.removeEventListener('pagehide', persist);
      shell.destroy();
    },
  };
}

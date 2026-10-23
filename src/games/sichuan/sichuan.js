// 사천성: 같은 그림 두 장을 꺾임 두 번 이하의 길로 이어 치운다. 규칙과 단계표는 rules.js.
// 판을 깰 때마다 다음 단계로 넘어가고, 세 단계마다 조금씩 어려워진다.
import { play } from '../../core/sound.js';
import { mountShell } from '../../core/shell.js';
import { shuffleInPlace } from '../../core/random.js';
import { createClock, formatTime, formatMinutes } from '../../core/clock.js';
import { addWin, bumpTip, clearSave, getProgress, getSave, putProgress, putSave, tipCount } from '../../core/records.js';
import { winProgressHtml } from '../../core/progress-view.js';
import { MORE_PICTURES, PICTURES, pictureSrc } from '../pictures.js';
import { deal, fewestTurnsPath, findHint, findPath, settle, shuffle, stageSpec } from './rules.js';

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
const GRAVITY_ICON = { down: 'ph-arrow-down', up: 'ph-arrow-up', left: 'ph-arrow-left', right: 'ph-arrow-right' };
const BLOCKED_TIPS = 3;   // 안 이어지는 이유는 처음 몇 번만 알려 준다
const BLOCKED_MS = 3200;  // 이유(빨간 점선 길과 한 줄)를 보여 주는 시간

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

// 판 좌표 [행, 열]의 패 한가운데. 테두리(-1, rows/cols)는 둘레 여백의 가운데로.
function centerOf([r, c], { cols, rows, tw }) {
  const th = tw * TILE_RATIO;
  const pad = tw * PAD;
  const axis = (n, max, size) => {
    if (n < 0) return pad / 2;
    if (n >= max) return pad + max * (size + GAP) - GAP + pad / 2;
    return pad + n * (size + GAP) + size / 2;
  };
  return [axis(c, cols, tw), axis(r, rows, th)];
}

const pathSvg = (path, size, bad = false) => {
  const pts = path.map((p) => centerOf(p, size).join(',')).join(' ');
  return `<polyline class="path-glow" points="${pts}"/><polyline class="path-line${bad ? ' is-bad' : ''}" points="${pts}" pathLength="1"/>`;
};

// '방법' 카드 장면: 실제 패(.tile)와 이은 길로 그린 작은 판. cells는 그림 id(빈칸은 null).
function miniBoard({ cols, rows, cells, path = null, bad = false, picked = [], finger = null }) {
  const size = { cols, rows, tw: 46 };
  const tiles = cells.map((id, i) => (id
    ? `<span class="tile${picked.includes(i) ? ' is-picked' : ''}"><img src="${pictureSrc(id)}" alt="" draggable="false"></span>`
    : '<span class="tile-slot"></span>')).join('');
  const [fx, fy] = finger === null ? [0, 0] : centerOf([Math.floor(finger / cols), finger % cols], size);
  return `<div class="sichuan sichuan--mini" style="--cols:${cols};--rows:${rows};--tw:46px;--th:${46 * TILE_RATIO}px;--gap:${GAP}px;--pad:${46 * PAD}px">
    ${tiles}
    <svg class="sichuan__path" aria-hidden="true">${path ? pathSvg(path, size, bad) : ''}</svg>
    ${finger === null ? '' : `<i class="ph-fill ph-hand-pointing howto__finger" style="left:${fx}px;top:${fy}px"></i>`}
  </div>`;
}

const toolChip = (icon, label) => `<span class="tool"><span class="tool__icon"><i class="ph ${icon}"></i></span><span class="tool__label">${label}</span></span>`;

// '방법' 그림 카드(위 막대 '방법' 단추). 한 장에 한 가지, 큰 한 문장.
const HOWTO = {
  title: '사천성 하는 법',
  cards: [
    {
      text: '같은 그림 두 장을 차례로 누르세요. 선으로 이어지면 두 장이 사라집니다.',
      scene: miniBoard({ cols: 4, rows: 2, cells: ['apple', null, null, 'tulip', 'cat', 'puppy', 'apple', 'grapes'], path: [[0, 0], [0, 1], [0, 2], [1, 2]], picked: [0, 6], finger: 6 }),
    },
    {
      text: '선은 두 번까지 꺾을 수 있어요. 판 바깥 둘레로 돌아가도 됩니다.',
      scene: miniBoard({ cols: 4, rows: 2, cells: ['apple', 'cat', 'apple', 'tulip', 'grapes', 'puppy', 'bird', 'rabbit'], path: [[0, 0], [-1, 0], [-1, 2], [0, 2]], picked: [0, 2] }),
    },
    {
      text: '세 번 이상 꺾어야만 닿으면 이을 수 없어요. 다른 짝을 찾아보세요.',
      scene: miniBoard({ cols: 4, rows: 2, cells: ['apple', 'cat', 'tulip', 'grapes', 'puppy', null, null, 'apple'], path: [[0, 0], [0, -1], [2, -1], [2, 3], [1, 3]], bad: true, picked: [0, 7] }),
    },
    {
      text: '막히면 힌트를 누르세요. 섞기는 남은 패를 다시 섞고, 되돌리기는 한 수 물립니다.',
      scene: `<div class="howto__tools">${toolChip('ph-lightbulb', '힌트')}${toolChip('ph-shuffle', '섞기')}${toolChip('ph-arrow-counter-clockwise', '되돌리기')}</div>`,
    },
    {
      text: '판을 깨면 다음 단계로 넘어갑니다. 19단계부터는 짝을 치우면 남은 패가 한쪽으로 쏠려요.',
      scene: `<div class="howto__stage"><span class="gravity-chip"><i class="ph ph-arrow-down"></i>아래로 쏠림</span></div>`,
    },
  ],
};

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
    howto: HOWTO,
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
    </div>${gravityChip()}`;
    picked = -1;
    fit();
    sync();
  }

  function gravityChip() {
    const { gravity } = stageSpec(state.stage);
    return gravity ? `<span class="gravity-chip"><i class="ph ${GRAVITY_ICON[gravity]}"></i>${GRAVITY_WORD[gravity]} 쏠림</span>` : '';
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
  // bad: 이을 수 없는 길(빨간 점선)을 잠깐 보여 줄 때
  function showPath(path, { bad = false } = {}) {
    const svg = board.querySelector('.sichuan__path');
    const tw = parseFloat(board.querySelector('.sichuan').style.getPropertyValue('--tw'));
    svg.innerHTML = pathSvg(path, { cols: state.board.cols, rows: state.board.rows, tw }, bad);
    clearTimeout(pathTimer);
    pathTimer = setTimeout(() => { svg.innerHTML = ''; }, bad ? BLOCKED_MS : PATH_MS + LEAVE_MS);
  }

  // 첫 판 손가락 안내(한 번만): 이을 수 있는 짝을 가리키고, 첫 짝을 치우면 힌트 단추를 알려 준다
  let guide = false;
  let coachTimer = 0;
  function coachFor(ms, opts) {
    clearTimeout(coachTimer);
    shell.coach.show(opts);
    if (ms) coachTimer = setTimeout(() => shell.coach.hide(), ms);
  }
  function partnerOf(i) {
    const { cells } = state.board;
    const j = cells.findIndex((v, k) => k !== i && v === cells[i] && findPath(state.board, i, k));
    return j < 0 ? null : j;
  }
  function guideStart() {
    if (tipCount('sichuan-coach') > 0) return;
    const pair = findHint(state.board);
    if (!pair) return;
    bumpTip('sichuan-coach');
    guide = true;
    coachFor(0, { text: '같은 그림 두 장을 차례로 누르세요', at: () => tileEl(pair[0]) });
  }
  function guideAfterPick() {
    if (!guide) return;
    if (!shell.coach.active) { guide = false; return; }
    if (picked < 0) return;
    const j = partnerOf(picked);
    coachFor(0, j === null
      ? { text: '이 그림은 지금 이을 짝이 없어요. 다른 그림을 눌러 보세요' }
      : { text: '이어지는 같은 그림을 하나 더 누르세요', at: () => tileEl(j) });
  }
  function guideAfterMatch() {
    if (!guide) return;
    guide = false;
    if (!shell.coach.active) return;
    coachFor(6500, { text: '잘하셨어요! 선은 두 번까지 꺾을 수 있어요. 막히면 힌트를 누르세요', at: () => document.querySelector('[data-act="hint"]') });
  }

  // 패가 쏠리는 방향을 처음 만나면 알려 주고, 쏠림 단계 내내 판 귀퉁이에 방향을 띄운다
  function gravityStart(gravity) {
    if (!gravity || tipCount(`sichuan-gravity-${gravity}`) > 0) return;
    bumpTip(`sichuan-gravity-${gravity}`);
    coachFor(6000, { text: `이번 단계부터 짝을 치우면 남은 패가 ${GRAVITY_WORD[gravity]} 쏠립니다`, at: () => board.querySelector('.gravity-chip') });
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
    if (picked < 0 || state.board.cells[picked] !== state.board.cells[i]) {
      select(i);
      guideAfterPick();
      return play('place');
    }

    const a = picked;
    const path = findPath(state.board, a, i);
    if (!path) {
      // 같은 그림인데 이을 길이 없으면 두 장을 흔들어 알려 주고, 처음 몇 번은 이유도 보여 준다
      [a, i].forEach((k) => {
        const el = tileEl(k);
        el.classList.remove('is-shaking');
        void el.offsetWidth;
        el.classList.add('is-shaking');
      });
      explainBlocked(a, i);
      select(-1);
      guideAfterPick();
      return play('miss');
    }
    match(a, i, path);
  }

  function explainBlocked(a, b) {
    if (tipCount('sichuan-blocked') >= BLOCKED_TIPS) return;
    bumpTip('sichuan-blocked');
    const why = fewestTurnsPath(state.board, a, b);
    if (why) showPath(why.path, { bad: true });
    shell.toast(why ? `${why.turns}번 꺾여야 해서 이을 수 없어요. 두 번까지만 됩니다` : '다른 패가 길을 막고 있어서 이을 수 없어요', BLOCKED_MS);
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
    guideAfterMatch();
    if (shell.coach.active && !guide && stageSpec(state.stage).gravity) shell.coach.hide();
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
    shell.coach.hide();
    guideStart();
    gravityStart(stageSpec(stage).gravity);
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

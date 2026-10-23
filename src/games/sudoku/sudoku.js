// 스도쿠 화면: 4×4·6×6·9×9(쉬움). 틀린 숫자 빨간색, 되돌리기, 힌트, 연필 메모.
import { makePuzzle, peers, SIZES } from './generator.js';
import { play } from '../../core/sound.js';
import { mountShell } from '../../core/shell.js';
import { createClock, formatTime, formatMinutes } from '../../core/clock.js';
import { addWin, bumpTip, clearSave, getSave, putSave, tipCount } from '../../core/records.js';
import { winProgressHtml } from '../../core/progress-view.js';

const GAME = 'sudoku';
const sizeLabel = (n) => `${n}×${n}`;

export const entry = {
  mount,
  describeSave: (save) => `${sizeLabel(save.state.n)}, ${formatMinutes(save.elapsedMs)}`,
  recordLine: (rec) => {
    const n = [9, 6, 4].find((k) => rec.best[`time${k}`] !== undefined);
    return `이긴 판 ${rec.wins}${n ? `, ${sizeLabel(n)} 최고 ${formatTime(rec.best[`time${n}`])}` : ''}`;
  },
};

// '방법' 카드 장면: 실제 칸 모양(.cell)으로 그린 작은 4×4 판
const MINI_SOLUTION = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
const MINI_CELL = 44;
function miniSudoku({ shown, selected = null, peerHi = false, conflict = null, notes = null, keys = false, finger = null, chips = '' }) {
  const peer = selected === null ? [] : peers(4)[selected];
  const cells = MINI_SOLUTION.map((v, i) => {
    const r = Math.floor(i / 4);
    const c = i % 4;
    const cls = [
      'cell',
      shown.includes(i) ? 'is-given' : '',
      c === 1 ? 'b-right' : '',
      r === 1 ? 'b-bottom' : '',
      i === selected ? 'is-selected' : '',
      peerHi && peer.includes(i) ? 'is-peer' : '',
      conflict && conflict.at === i ? 'is-conflict' : '',
    ].filter(Boolean).join(' ');
    let content = shown.includes(i) ? v : '';
    if (conflict && conflict.at === i) content = conflict.value;
    if (notes && notes.at === i) content = `<span class="notes">${[1, 2, 3, 4].map((k) => `<span>${notes.values.includes(k) ? k : ''}</span>`).join('')}</span>`;
    return `<span class="${cls}">${content}</span>`;
  }).join('');
  const keyRow = keys ? `<div class="sudoku-mini__keys">${[1, 2, 3, 4].map((k) => `<span class="key">${k}</span>`).join('')}</div>` : '';
  let fingerHtml = '';
  if (finger) {
    const [x, y] = finger.key
      ? [(finger.key - 1) * MINI_CELL + MINI_CELL / 2, 4 * MINI_CELL + 12 + MINI_CELL / 2]
      : [(finger.cell % 4) * MINI_CELL + MINI_CELL / 2, Math.floor(finger.cell / 4) * MINI_CELL + MINI_CELL / 2];
    fingerHtml = `<i class="ph-fill ph-hand-pointing howto__finger" style="left:${x}px;top:${y}px"></i>`;
  }
  return `<div class="sudoku-mini"><div class="sudoku__grid" style="--n:4;--bh:2;--bw:2;--board:${MINI_CELL * 4}px">${cells}</div>${keyRow}${chips}${fingerHtml}</div>`;
}
const toolChip = (icon, label) => `<span class="tool"><span class="tool__icon"><i class="ph ${icon}"></i></span><span class="tool__label">${label}</span></span>`;

const HOWTO = {
  title: '스도쿠 하는 법',
  cards: [
    {
      text: '빈칸을 누르고, 아래에서 숫자를 누르면 그 칸에 들어갑니다.',
      scene: miniSudoku({ shown: [0, 2, 3, 4, 5, 7, 9, 10, 12, 15], selected: 1, keys: true, finger: { key: 2 } }),
    },
    {
      text: '한 줄, 한 세로줄, 굵은 선으로 묶인 상자 안에는 같은 숫자가 한 번씩만 들어가요.',
      scene: miniSudoku({ shown: [0, 2, 3, 4, 5, 7, 9, 10, 12, 15], selected: 6, peerHi: true }),
    },
    {
      text: '규칙에 어긋나면 숫자가 빨갛게 보여요. 다른 숫자로 바꾸면 됩니다.',
      scene: miniSudoku({ shown: [0, 2, 3, 4, 5, 7, 9, 10, 12, 15], conflict: { at: 1, value: 3 } }),
    },
    {
      text: '연필 메모를 켜면 칸에 작은 숫자로 후보를 적어 둘 수 있어요.',
      scene: miniSudoku({ shown: [0, 2, 3, 4, 5, 7, 9, 10, 12, 15], notes: { at: 6, values: [1, 4] }, chips: `<div class="howto__tools">${toolChip('ph-pencil-simple', '연필 메모')}</div>` }),
    },
    {
      text: '빈칸을 모두 채우면 끝입니다. 막히면 힌트를 누르세요.',
      scene: miniSudoku({ shown: MINI_SOLUTION.map((_, i) => i), chips: `<div class="howto__tools">${toolChip('ph-lightbulb', '힌트')}</div>` }),
    },
  ],
};

function newState(n) {
  const { puzzle, solution } = makePuzzle(n);
  return { n, puzzle, solution, entries: new Array(n * n).fill(0), notes: Array.from({ length: n * n }, () => []), hinted: [], history: [] };
}

function mount(root, { onHome }) {
  const shell = mountShell(root, {
    game: GAME,
    tally: [{ id: 'time', label: '시간' }, { id: 'size', label: '크기' }, { id: 'left', label: '남은 칸' }],
    actions: [
      { id: 'undo', icon: 'ph-arrow-counter-clockwise', label: '되돌리기' },
      { id: 'hint', icon: 'ph-lightbulb', label: '힌트' },
      { id: 'memo', icon: 'ph-pencil-simple', label: '연필 메모', toggle: true },
      { id: 'new', icon: 'ph-plus-circle', label: '새 게임' },
    ],
    onAction: (a) => ({ undo: doUndo, hint: doHint, memo: toggleMemo, new: askNewGame })[a]?.(),
    onHome: () => { persist(); onHome(); },
    howto: HOWTO,
  });
  const board = shell.board;
  board.setAttribute('aria-label', '스도쿠 판');

  const saved = getSave(GAME);
  let state = saved?.state ?? null;
  const clock = createClock(saved?.elapsedMs ?? 0);
  let selected = null;
  let memo = false;

  const value = (i) => state.puzzle[i] || state.entries[i];
  const isGiven = (i) => state.puzzle[i] !== 0;
  const conflicts = (i) => {
    const v = value(i);
    return v !== 0 && !isGiven(i) && peers(state.n)[i].some((p) => value(p) === v);
  };
  const solved = () => state.solution.every((v, i) => value(i) === v);
  const emptyCount = () => state.solution.reduce((k, _, i) => k + (value(i) ? 0 : 1), 0);

  function persist() {
    if (state && !solved()) putSave(GAME, { state, elapsedMs: clock.elapsed() });
  }

  function draw() {
    const { n } = state;
    const [bh, bw] = SIZES[n].box;
    const cells = state.solution.map((_, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      const edge = `${(c + 1) % bw === 0 && c < n - 1 ? ' b-right' : ''}${(r + 1) % bh === 0 && r < n - 1 ? ' b-bottom' : ''}`;
      return `<button type="button" class="cell${isGiven(i) ? ' is-given' : ''}${edge}" data-i="${i}"></button>`;
    }).join('');
    const keys = [...Array(n)].map((_, k) => `<button type="button" class="key" data-key="${k + 1}">${k + 1}</button>`).join('');
    board.innerHTML = `
      <div class="sudoku sudoku--${n}" style="--n:${n}; --bh:${bh}; --bw:${bw}">
        <div class="sudoku__grid" role="grid">${cells}</div>
        <div class="sudoku__keys" style="--cols:${Math.ceil((n + 1) / 2)}">${keys}<button type="button" class="key key--erase" data-key="0"><i class="ph ph-eraser"></i><span>지우기</span></button></div>
      </div>`;
    fit();
    refresh();
  }

  // 가로 화면은 판 옆에 숫자 단추, 세로 화면은 판 아래에
  function fit() {
    const wrap = board.querySelector('.sudoku');
    if (!wrap) return;
    const r = board.getBoundingClientRect();
    const wide = r.width > r.height * 1.15;
    wrap.classList.toggle('is-wide', wide);
    // 바깥 여백 12px×2와 판 테두리 3px×2를 뺀 크기
    const size = wide ? Math.min(r.height - 30, r.width * 0.62) : Math.min(r.width - 30, r.height * 0.66);
    wrap.style.setProperty('--board', `${Math.max(220, size)}px`);
  }

  function refresh() {
    const { n } = state;
    const selVal = selected !== null ? value(selected) : 0;
    const selPeers = selected !== null ? new Set(peers(n)[selected]) : new Set();
    board.querySelectorAll('.cell').forEach((el) => {
      const i = Number(el.dataset.i);
      const v = value(i);
      el.classList.toggle('is-selected', i === selected);
      el.classList.toggle('is-peer', selPeers.has(i));
      el.classList.toggle('is-same', v !== 0 && v === selVal && i !== selected);
      el.classList.toggle('is-conflict', conflicts(i));
      el.classList.toggle('is-hinted', state.hinted.includes(i));
      if (v) {
        el.textContent = v;
        el.setAttribute('aria-label', `${v}`);
      } else {
        const notes = state.notes[i];
        el.innerHTML = notes.length
          ? `<span class="notes">${[...Array(n)].map((_, k) => `<span>${notes.includes(k + 1) ? k + 1 : ''}</span>`).join('')}</span>`
          : '';
        el.setAttribute('aria-label', '빈칸');
      }
    });
    shell.set('size', sizeLabel(n));
    shell.set('left', emptyCount());
    shell.setDisabled('undo', state.history.length === 0);
  }

  function record(i) {
    state.history.push({ i, entry: state.entries[i], notes: [...state.notes[i]], hinted: state.hinted.includes(i) });
    if (state.history.length > 300) state.history.shift();
  }

  function setValue(v) {
    if (selected === null || isGiven(selected)) return;
    const i = selected;
    if (!clock.running()) clock.start();
    record(i);
    if (memo && v !== 0) {
      const notes = state.notes[i];
      state.entries[i] = 0;
      state.notes[i] = notes.includes(v) ? notes.filter((k) => k !== v) : [...notes, v].sort();
      play('tick');
    } else {
      state.entries[i] = v === state.entries[i] ? 0 : v;
      state.notes[i] = [];
      state.hinted = state.hinted.filter((k) => k !== i);
      // 숫자를 넣으면 같은 줄·칸·상자의 같은 연필 메모는 지운다
      if (state.entries[i]) peers(state.n)[i].forEach((p) => { state.notes[p] = state.notes[p].filter((k) => k !== v); });
      play(conflicts(i) ? 'miss' : 'place');
    }
    refresh();
    guideAfterValue(i);
    if (solved()) return win();
    persist();
  }

  function doUndo() {
    const h = state?.history.pop();
    if (!h) return;
    state.entries[h.i] = h.entry;
    state.notes[h.i] = h.notes;
    state.hinted = h.hinted ? [...new Set([...state.hinted, h.i])] : state.hinted.filter((k) => k !== h.i);
    selected = h.i;
    play('flip');
    refresh();
    persist();
  }

  // 힌트: 고른 칸이 비었거나 틀렸으면 그 칸, 아니면 비었거나 틀린 칸 하나에 답을 넣는다
  function doHint() {
    if (!state) return;
    const wrong = (i) => !isGiven(i) && value(i) !== state.solution[i];
    let i = selected !== null && wrong(selected) ? selected : null;
    if (i === null) {
      const options = state.solution.map((_, k) => k).filter(wrong);
      if (!options.length) return;
      i = options[Math.floor(Math.random() * options.length)];
    }
    if (!clock.running()) clock.start();
    record(i);
    state.entries[i] = state.solution[i];
    state.notes[i] = [];
    state.hinted = [...new Set([...state.hinted, i])];
    selected = i;
    play('place');
    refresh();
    if (solved()) return win();
    persist();
  }

  function toggleMemo() {
    memo = !memo;
    shell.setPressed('memo', memo);
    shell.toast(memo ? '연필 메모: 숫자를 작게 적어 둡니다' : '연필 메모를 껐습니다');
  }

  async function win() {
    clock.pause();
    const ms = clock.elapsed();
    const { n } = state;
    clearSave(GAME);
    const key = `time${n}`;
    const { record: rec, improved, monthCount } = addWin(GAME, { [key]: ms }, { [key]: 'min' });
    play('win');
    const lines = [`${sizeLabel(n)} 판을 다 채웠습니다`, `걸린 시간 ${formatTime(ms)}`];
    if (improved.includes(key)) lines.push('가장 빠른 기록을 새로 세웠어요');
    const choice = await shell.ask({
      title: '다 풀었습니다',
      body: lines.join('<br>'),
      extra: winProgressHtml(rec.wins, monthCount),
      choices: [{ id: 'new', label: '새 게임', primary: true }, { id: 'home', label: '처음으로' }],
    });
    if (choice === 'new') askNewGame();
    else onHome();
  }

  async function askNewGame() {
    const playing = state && !solved();
    const choice = await shell.ask({
      title: '새 게임',
      body: '판 크기를 고르세요.',
      choices: [
        { id: '4', label: '4×4', sub: '작은 판', primary: !state || state.n === 4 },
        { id: '6', label: '6×6', sub: '중간 판', primary: state?.n === 6 },
        { id: '9', label: '9×9', sub: '큰 판, 쉬움', primary: state?.n === 9 },
      ],
      dismiss: playing ? { id: 'keep', label: '하던 판 계속하기' } : { id: 'home', label: '처음으로' },
    });
    if (['4', '6', '9'].includes(choice)) startGame(Number(choice));
    else if (choice === 'home') onHome();
  }

  function startGame(n) {
    state = newState(n);
    selected = null;
    clock.reset(0);
    clock.start();
    draw();
    tick();
    persist();
    guideStart();
  }

  // 첫 판 손가락 안내(한 번만): 빈칸 하나 → 들어갈 숫자 → 연필 메모 순으로 가리킨다
  let guide = false;
  let coachTimer = 0;
  const cellEl = (i) => board.querySelector(`.cell[data-i="${i}"]`);
  const keyEl = (v) => board.querySelector(`.key[data-key="${v}"]`);
  function coachFor(ms, opts) {
    clearTimeout(coachTimer);
    shell.coach.show(opts);
    if (ms) coachTimer = setTimeout(() => shell.coach.hide(), ms);
  }
  function guideStart() {
    if (tipCount('sudoku-coach') > 0) return;
    // 이미 찬 이웃이 가장 많은 빈칸(들어갈 숫자를 찾기 가장 쉬운 칸)
    const empties = state.solution.map((_, i) => i).filter((i) => !value(i));
    const easiest = empties.reduce((best, i) => {
      const filled = peers(state.n)[i].filter((p) => value(p)).length;
      return filled > best.filled ? { i, filled } : best;
    }, { i: empties[0], filled: -1 }).i;
    bumpTip('sudoku-coach');
    guide = true;
    coachFor(0, { text: '빈칸을 하나 누르세요', at: () => cellEl(easiest) });
  }
  function guideAfterSelect() {
    if (!guide) return;
    if (!shell.coach.active) { guide = false; return; }
    if (isGiven(selected)) return coachFor(0, { text: '처음부터 있던 숫자는 바꿀 수 없어요. 빈칸을 눌러 보세요' });
    coachFor(0, { text: '이 칸에 들어갈 숫자를 누르세요. 한 줄·한 세로줄·굵은 상자에 같은 숫자는 한 번씩만 들어가요', at: () => keyEl(state.solution[selected]), by: () => board.querySelector('.sudoku__keys') });
  }
  function guideAfterValue(i) {
    if (!guide || memo || !state.entries[i]) return;
    if (!shell.coach.active) { guide = false; return; }
    if (conflicts(i)) return coachFor(0, { text: '빨간 숫자는 같은 줄이나 상자에 이미 있다는 뜻이에요. 다른 숫자를 눌러 보세요', at: () => keyEl(state.solution[i]), by: () => board.querySelector('.sudoku__keys') });
    guide = false;
    coachFor(6500, { text: '잘하셨어요! 헷갈리면 연필 메모로 후보를 적어 두세요', at: () => screenTool('memo') });
  }
  const screenTool = (id) => document.querySelector(`[data-act="${id}"]`);

  function tick() {
    shell.set('time', formatTime(clock.elapsed()));
  }

  board.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) {
      selected = Number(cell.dataset.i);
      play('tick');
      refresh();
      return guideAfterSelect();
    }
    const key = e.target.closest('.key');
    if (key) setValue(Number(key.dataset.key));
  });

  // PC 자판: 숫자, 지우기, 화살표
  const onKey = (e) => {
    if (!state || document.querySelector('.sheet:not([hidden])')) return;
    const { n } = state;
    if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) return setValue(Number(e.key));
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return setValue(0);
    const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      selected = selected === null ? 0 : Math.min(n * n - 1, Math.max(0, selected + moves[e.key]));
      refresh();
    }
  };
  document.addEventListener('keydown', onKey);

  const ro = new ResizeObserver(fit);
  ro.observe(board);
  if (state) {
    draw();
    clock.start();
  } else {
    askNewGame();
  }
  tick();
  const timer = setInterval(tick, 1000);
  window.addEventListener('pagehide', persist);

  return {
    destroy() {
      persist();
      ro.disconnect();
      clearInterval(timer);
      clearTimeout(coachTimer);
      clock.dispose();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', persist);
      shell.destroy();
    },
  };
}

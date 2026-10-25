// 블록 쌓기: 10×20 판에 일곱 가지 블록이 천천히 떨어지고 가득 찬 줄은 사라진다. 규칙과 단계표는 rules.js.
// 사천성처럼 목표 줄을 채우면 다음 단계로 넘어가고, 세 단계마다 한 걸음씩(한 번에 하나만) 어려워진다.
// 조작은 화면 단추 넷(왼쪽·오른쪽·돌리기·내리기)과 PC 키보드. 되돌리기는 없고(2026-10-25 선생님 결정) 멈춤이 있다.
import { play } from '../../core/sound.js';
import { mountShell } from '../../core/shell.js';
import { createClock, formatMinutes } from '../../core/clock.js';
import { addWin, bumpTip, clearSave, getProgress, getSave, noteBest, putProgress, putSave, tipCount } from '../../core/records.js';
import { winProgressHtml } from '../../core/progress-view.js';
import { COLS, ROWS, cellsOf, colorOf, drop, ghost, lock, lockPiece, move, newGame, rotate, stageSpec } from './rules.js';

const GAME = 'blocks';
const LOCK_DELAY_MS = 500;    // 바닥 유예: 닿은 뒤 굳기까지(그 사이 옮기거나 돌릴 수 있다)
const LOCK_RESETS = 8;        // 한 블록에서 유예를 다시 시작할 수 있는 횟수
const REPEAT_DELAY_MS = 300;  // 길게 누르기: 반복이 시작되기까지
const REPEAT_MS = 120;        // 길게 누르기: 한 칸 간격
const SOFT_DROP_MS = 50;      // 내리기를 누르고 있을 때 한 칸 간격
const FLASH_MS = 260;         // 지워지는 줄이 하얗게 번쩍이는 시간
const NOTICE_MS = 3200;       // 단계 시작 알림이 보이는 시간
const SIDE_COL = 118;         // 좁은 화면: 판 옆 다음 블록 칸 너비(간격 포함)
const GAP = 12;               // 좁은 화면: 판과 아래 조작 칸 사이(styles/blocks.css의 .blocks gap과 같게)
const WIDE_GAP = 28;          // 넓은 화면: 판과 양옆 칸 사이(styles/blocks.css의 .is-wide gap과 같게)

// key: PC에서 단추 귀퉁이에 보여 주는 키(2026-10-25 선생님 지적: 키보드로 돌리기가 무엇인지 알려야 한다)
const PAD = [
  { id: 'left', icon: 'ph-arrow-left', label: '왼쪽', key: '←', code: 'ArrowLeft' },
  { id: 'right', icon: 'ph-arrow-right', label: '오른쪽', key: '→', code: 'ArrowRight' },
  { id: 'rotate', icon: 'ph-arrow-clockwise', label: '돌리기', key: '↑', code: 'ArrowUp' },
  { id: 'down', icon: 'ph-arrow-down', label: '내리기', key: '↓', code: 'ArrowDown' },
];
// 키보드가 있다고 보는 기기(마우스로 가리키는 PC). 키 표시는 styles/blocks.css가 같은 조건으로 켠다.
const hasKeyboard = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

// PC 판 옆 키보드 안내: 키 이름을 글로, 하는 일과 함께(2026-10-25 선생님 지적: "왼쪽 화살표"처럼 쓰고 스페이스 '한 번에 내리기'도 알려야)
const KEY_GUIDE = [
  { key: '←', act: '왼쪽으로', name: '왼쪽 화살표' },
  { key: '→', act: '오른쪽으로', name: '오른쪽 화살표' },
  { key: '↑', act: '돌리기', name: '위쪽 화살표' },
  { key: '↓', act: '빨리 내리기', name: '아래쪽 화살표, 누르고 있기' },
  { key: '스페이스', act: '한 번에 내리기', name: '스페이스 바', wide: true },
  { key: 'P', act: '멈춤', name: 'P 또는 Esc' },
];
const keyGuideHtml = () => `<div class="blocks-keyguide" role="note" aria-label="키보드 조작"><small>키보드</small><ul>${KEY_GUIDE.map((k) => (
  `<li><kbd class="keycap${k.wide ? ' keycap--wide' : ''}">${k.key}</kbd><span><b>${k.act}</b><small>${k.name}</small></span></li>`)).join('')}</ul></div>`;
const KEY_MOVE = { ArrowLeft: -1, ArrowRight: 1 };

const fmt = (n) => n.toLocaleString('ko-KR');
const progressOf = () => getProgress(GAME, { stage: 1, top: 1 });
const validSave = (save) => Number.isInteger(save?.state?.stage) && Array.isArray(save?.state?.board) && save.state.board.length === COLS * ROWS && !!save.state.piece;
const sheetOpen = () => !!document.querySelector('.sheet:not([hidden])');

export const entry = {
  mount,
  describeSave: (save) => (validSave(save)
    ? `${save.state.stage}단계, 줄 ${save.state.lines}/${stageSpec(save.state.stage).lines}, 점수 ${fmt(save.state.score)}, ${formatMinutes(save.elapsedMs)}`
    : '새로 시작'),
  recordLine: (rec) => `이긴 판 ${rec.wins}${rec.best.score ? `, 최고 점수 ${fmt(rec.best.score)}` : ''}`,
};

// 이 단계에서 처음 달라지는 점(목표 줄이 늚·빨라짐)을 한 줄로. 같으면 null.
function newRule(stage) {
  if (stage < 2) return null;
  const now = stageSpec(stage);
  const before = stageSpec(stage - 1);
  if (now.lines > before.lines) return `목표가 ${now.lines}줄이 됩니다`;
  if (now.intervalMs < before.intervalMs) return '조금 빨라집니다';
  return null;
}

// 작은 판(다음 블록 상자, '방법' 카드): filled[i] = { v: 색 번호, ghost?: true }
const miniCells = (cols, rows, filled = {}) => Array.from({ length: cols * rows }, (_, i) => (
  `<span class="bcell${filled[i]?.ghost ? ' is-ghost' : ''}${filled[i]?.clearing ? ' is-clearing' : ''}" data-v="${filled[i]?.v ?? ''}"></span>`)).join('');
const miniWell = (cols, rows, filled) => `<div class="blocks-mini" style="--cols:${cols}">${miniCells(cols, rows, filled)}</div>`;

// 블록 한 개를 작은 판 위에 놓은 칸 목록. 회전 0 모양을 상자 왼쪽 위로 당겨 (r0, c0)에 둔다.
function place(map, kind, r0, c0, { ghost: isGhost = false, rot = 0 } = {}, cols) {
  const cs = cellsOf({ kind, rot, r: 0, c: 0 });
  const rMin = Math.min(...cs.map(([r]) => r));
  const cMin = Math.min(...cs.map(([, c]) => c));
  cs.forEach(([r, c]) => { map[(r - rMin + r0) * cols + (c - cMin + c0)] = { v: colorOf(kind), ghost: isGhost }; });
  return map;
}
const floor = (map, cols, rows, text) => {   // 바닥에 쌓인 블록: 글자 그림(숫자는 색, '.'은 빈칸)을 아래 줄부터
  const lines = text.trim().split('\n').map((l) => l.trim());
  lines.forEach((line, k) => [...line].forEach((ch, c) => { if (ch !== '.') map[(rows - lines.length + k) * cols + c] = { v: Number(ch) }; }));
  return map;
};
const padChip = ({ icon, label }) => `<span class="pad__btn pad__btn--chip"><i class="ph ${icon}"></i><span>${label}</span></span>`;
const chips = (ids, finger = null) => `<div class="blocks-howto__pad">${ids.map((id) => padChip(PAD.find((p) => p.id === id))).join('')}${finger === null ? '' : `<i class="ph-fill ph-hand-pointing howto__finger" style="left:${finger}px;top:30px"></i>`}</div>`;
const scene = (well, pad = '') => `<div class="blocks-howto">${well}${pad}</div>`;
const keycap = (k, label, wide = false) => `<span class="blocks-keys__item"><kbd class="keycap${wide ? ' keycap--wide' : ''}">${k}</kbd><small>${label}</small></span>`;
const KEYBOARD_CARD = {
  text: '키보드로도 할 수 있어요. 화살표로 옮기고 돌리고, 스페이스 바를 누르면 블록이 한 번에 내려가요.',
  scene: `<div class="blocks-keys">
    <div class="blocks-keys__arrows"><span></span>${keycap('↑', '돌리기')}<span></span>${keycap('←', '왼쪽')}${keycap('↓', '내리기')}${keycap('→', '오른쪽')}</div>
    <div class="blocks-keys__row">${keycap('스페이스', '한 번에 내리기', true)}${keycap('P', '멈춤')}</div>
  </div>`,
};

const HOWTO_CARDS = [
    {
      text: '왼쪽·오른쪽 단추로 떨어지는 블록을 옮기세요.',
      scene: scene(miniWell(6, 6, floor(place({}, 'T', 0, 2, {}, 6), 6, 6, `
        1.1.11
        4433.5`)), chips(['left', 'right'], 134)),
    },
    {
      text: '돌리기 단추로 모양을 돌려 빈자리에 맞추세요.',
      scene: scene(miniWell(6, 6, floor(place({}, 'I', 1, 4, { rot: 1 }, 6), 6, 6, `
        22.3.6
        22.3.6
        5533.6`)), chips(['rotate'], 40)),
    },
    {
      text: '내리기를 누르고 있으면 빨리 내려와요. 옅은 테두리가 내려앉을 자리예요.',
      scene: scene(miniWell(6, 6, floor(place(place({}, 'L', 3, 0, { ghost: true }, 6), 'L', 0, 0, {}, 6), 6, 6, `
        ...166
        ..7166`)), chips(['down'], 40)),
    },
    {
      text: '한 줄을 가득 채우면 그 줄이 사라지고 점수가 올라요.',
      scene: scene(miniWell(6, 6, floor(Object.fromEntries([0, 1, 2, 3, 4, 5].map((c) => [5 * 6 + c, { v: 2, clearing: true }])), 6, 6, `
        1..3.6
        1.33.6
        ......`))),
    },
    {
      text: '목표 줄을 다 지우면 다음 단계로 넘어가요. 꼭대기까지 쌓이면 그 판은 끝이에요.',
      scene: scene(miniWell(6, 6, floor({}, 6, 6, `
        2.....
        22..3.
        5544.3
        767733
        167716`)), '<span class="blocks-goal"><i class="ph ph-flag-checkered"></i>줄 9/10</span>'),
    },
];
// PC에서는 세 단추 장 뒤에 키보드 장을 넣는다
const howto = () => ({
  title: '블록 쌓기 하는 법',
  cards: hasKeyboard() ? [...HOWTO_CARDS.slice(0, 3), KEYBOARD_CARD, ...HOWTO_CARDS.slice(3)] : HOWTO_CARDS,
});

function mount(root, { onHome }) {
  const shell = mountShell(root, {
    game: GAME,
    tally: [{ id: 'lines', label: '줄' }, { id: 'score', label: '점수' }, { id: 'stage', label: '단계' }],
    actions: [
      { id: 'pause', icon: 'ph-pause', label: '멈춤', toggle: true },
      { id: 'new', icon: 'ph-plus-circle', label: '새 게임' },
    ],
    onAction: (a) => ({ pause: togglePause, new: askNewGame })[a]?.(),
    onHome: () => { persist(); onHome(); },
    howto: howto(),
  });
  const board = shell.board;
  board.setAttribute('aria-label', '블록 쌓기 판');

  let saved = getSave(GAME);
  if (saved && !validSave(saved)) {
    clearSave(GAME);
    saved = null;
  }
  let state = saved?.state ?? null;
  const clock = createClock(saved?.elapsedMs ?? 0);
  let running = false;     // 블록이 내려오는 중인가(멈춤·덮개·대화상자·끝은 false)
  let acc = 0;             // 낙하 간격을 재는 누적 시간
  let landedMs = null;     // 바닥에 닿은 뒤 흐른 시간(null이면 공중)
  let resets = 0;
  let soft = false;        // 내리기를 누르고 있는가
  let flashing = false;    // 지워지는 줄이 번쩍이는 동안
  let raf = 0;
  let last = 0;
  let repeatTimer = 0;
  let repeatInterval = 0;
  let coachTimer = 0;
  let cells = [];          // 판의 칸 요소 200개
  let shown = [];          // 마지막으로 그린 칸 값(바뀐 칸만 고친다)

  const padButton = (p) => `<button type="button" class="pad__btn" data-pad="${p.id}" aria-label="${p.label}" aria-keyshortcuts="${p.code}"><i class="ph ${p.icon}"></i><span class="pad__name"><span>${p.label}</span><kbd class="keycap pad__key" aria-hidden="true">${p.key}</kbd></span></button>`;

  function draw() {
    board.innerHTML = `<div class="blocks">
      <div class="blocks__well" role="img" aria-label="블록 판">${Array.from({ length: COLS * ROWS }, () => '<span class="bcell" data-v=""></span>').join('')}
        <button type="button" class="blocks__cover" hidden><i class="ph-fill ph-play"></i><span></span></button>
      </div>
      <div class="blocks__side"><div class="blocks__next"><small>다음</small><div class="blocks-mini blocks-mini--next" style="--cols:4"></div></div></div>
      <div class="blocks__controls">
        <div class="pad" role="group" aria-label="조작 단추">${PAD.map(padButton).join('')}</div>
        ${keyGuideHtml()}
      </div>
    </div>`;
    cells = [...board.querySelectorAll('.blocks__well > .bcell')];
    shown = Array(cells.length).fill(null);
    fit();
    render();
    renderNext();
    sync();
  }

  // 칸 크기: 좁은 화면은 판 아래 조작 칸(단추 줄 + PC면 키보드 안내)과 옆 다음 블록 칸을 뺀 자리에,
  // 넓은 화면은 양옆 칸(다음 블록 / 단추 + 키보드 안내)을 뺀 자리에 맞춘다. 조작 칸 높이는 폭에 따라 달라지므로 두 번 잰다.
  function fit() {
    const wrap = board.querySelector('.blocks');
    if (!wrap) return;
    const r = board.getBoundingClientRect();
    const w = r.width - 20;
    const h = r.height - 20;
    const wide = w >= 760 || w >= h * 0.95;
    wrap.classList.toggle('is-wide', wide);
    const side = wrap.querySelector('.blocks__side');
    const controls = wrap.querySelector('.blocks__controls');
    // 판 크기 = 칸 × 수 + 칸 사이 1px 간격 + 판 안쪽 여백 6px×2 (styles/blocks.css의 .blocks__well)
    const frame = (n) => (n - 1) + 12;
    for (let k = 0; k < 2; k++) {
      const sides = wide ? side.offsetWidth + controls.offsetWidth + 2 * WIDE_GAP : SIDE_COL;
      const below = wide ? 0 : controls.offsetHeight + GAP;
      const cell = Math.floor(Math.max(12, Math.min((w - sides - frame(COLS)) / COLS, (h - below - frame(ROWS)) / ROWS)));
      wrap.style.setProperty('--cell', `${cell}px`);
    }
  }

  // 지금 판 + 내려앉을 자리 + 떨어지는 블록을 칸 값 목록으로('' 빈칸, '3' 블록, 'g3' 자리)
  function view() {
    const v = state.board.map((x) => (x ? String(x) : ''));
    if (!state.over && !state.won) {
      const color = String(colorOf(state.piece.kind));
      cellsOf(ghost(state.board, state.piece)).forEach(([r, c]) => { v[r * COLS + c] = `g${color}`; });
      cellsOf(state.piece).forEach(([r, c]) => { v[r * COLS + c] = color; });
    }
    return v;
  }

  function paint(v) {
    v.forEach((x, i) => {
      if (x === shown[i]) return;
      shown[i] = x;
      const el = cells[i];
      el.className = `bcell${x[0] === 'g' ? ' is-ghost' : x === 'x' ? ' is-clearing' : ''}`;
      el.dataset.v = x === 'x' ? '' : x.replace('g', '');
    });
  }
  const render = () => paint(view());

  function renderNext() {
    const box = board.querySelector('.blocks-mini--next');
    if (!box) return;
    const cs = cellsOf({ kind: state.next, rot: 0, r: 0, c: 0 });
    const w = Math.max(...cs.map(([, c]) => c)) - Math.min(...cs.map(([, c]) => c)) + 1;
    box.innerHTML = miniCells(4, 2, place({}, state.next, 0, Math.floor((4 - w) / 2), {}, 4));
  }

  function sync() {
    shell.set('lines', `${state.lines}/${stageSpec(state.stage).lines}`);
    shell.set('score', fmt(state.score));
    shell.set('stage', `${state.stage}단계`);
  }

  function persist() {
    if (!state || state.over || state.won) return;
    if (!state.board.some(Boolean)) return;   // 아직 한 블록도 굳지 않았으면 저장하지 않는다
    putSave(GAME, { state, elapsedMs: clock.elapsed() });
  }

  // 멈춤·덮개 -------------------------------------------------------------
  const coverEl = () => board.querySelector('.blocks__cover');
  function showCover(text) {
    const c = coverEl();
    if (!c) return;
    c.querySelector('span').textContent = text;
    c.hidden = false;
  }
  function hideCover() {
    const c = coverEl();
    if (c) c.hidden = true;
  }
  // 멈춤: 블록이 내려오지 않고 시계도 서며 판 위에 덮개가 뜬다(손가락 안내 중에는 덮개 없이)
  function pause(text = '누르면 계속') {
    if (!state || state.over || state.won) return;
    running = false;
    soft = false;
    stopRepeat();
    clock.pause();
    shell.setPressed('pause', true);
    if (!guiding()) showCover(text);
  }
  function resume() {
    if (!state || state.over || state.won || sheetOpen()) return;
    running = true;
    last = performance.now();
    acc = 0;
    clock.start();
    hideCover();
    shell.setPressed('pause', false);
  }
  function togglePause() {
    if (running) {
      pause();
      play('tick');
    } else resume();
  }

  // 게임 루프: 흐른 시간을 모아 낙하 간격마다 한 칸 내리고, 바닥에 닿으면 유예 뒤 굳는다
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last);
    last = now;
    if (!running || flashing) return;
    if (landedMs !== null) {
      landedMs += dt;
      if (landedMs >= LOCK_DELAY_MS) lockNow();
      return;
    }
    acc += dt;
    const interval = soft ? SOFT_DROP_MS : stageSpec(state.stage).intervalMs;
    while (acc >= interval) {
      acc -= interval;
      const next = drop(state.board, state.piece);
      if (!next) {
        landedMs = 0;
        acc = 0;
        break;
      }
      state.piece = next;
      render();
    }
  }

  // 굳히기: 가득 찬 줄은 하얗게 번쩍인 뒤 사라지고, 그다음 이김·꽉 참을 본다
  function lockNow() {
    const before = lock(state.board, state.piece);
    const { state: next, cleared } = lockPiece(state);
    state = next;
    landedMs = null;
    resets = 0;
    acc = 0;
    play(cleared.length ? 'match' : 'place');
    if (cleared.length === 0) return afterLock();
    flashing = true;
    paint(before.map((v, i) => (cleared.includes(Math.floor(i / COLS)) ? 'x' : v ? String(v) : '')));
    setTimeout(() => {
      flashing = false;
      afterLock();
    }, FLASH_MS);
  }
  function afterLock() {
    render();
    renderNext();
    sync();
    if (state.won) return win();
    if (state.over) return gameOver();
    persist();
  }

  // 조작 ----------------------------------------------------------------
  // 멈춤이나 덮개 중에 조작 단추를 누르면 바로 이어 간다(손가락 안내 중에는 멈춘 채 움직여 본다)
  function act(fn, { repeat = false } = {}) {
    if (!state || state.over || state.won || flashing || sheetOpen()) return false;
    if (!running && !guiding()) resume();
    const next = fn(state.board, state.piece);
    if (!next) return false;
    state.piece = next;
    if (!repeat) play('tick');
    touched();
    render();
    return true;
  }
  const moveBy = (dc, opts) => act((b, p) => move(b, p, dc), opts) && guideNext(1);
  const turn = () => act(rotate) && guideNext(2);
  // 바닥 유예 중 움직였으면: 다시 떨어질 수 있으면 공중으로, 아니면 유예를 다시 시작(횟수 제한)
  function touched() {
    if (landedMs === null) return;
    if (drop(state.board, state.piece)) {
      landedMs = null;
      return;
    }
    if (resets < LOCK_RESETS) {
      resets += 1;
      landedMs = 0;
    }
  }
  function setSoft(on) {
    if (on === soft) return;
    if (on) {
      if (!state || state.over || state.won || sheetOpen()) return;
      if (guideStep === 3) guideNext(3);
      else if (guiding()) endGuide();
      if (!running) resume();
    }
    soft = on;
    acc = 0;
  }
  // 한 번에 내리기(키보드 스페이스 바만): 내려앉을 자리로 가서 곧바로 굳는다
  function hardDrop() {
    if (!state || state.over || state.won || flashing || sheetOpen()) return;
    if (guiding()) endGuide();
    if (!running) resume();
    state.piece = ghost(state.board, state.piece);
    render();
    lockNow();
  }
  function startRepeat(dc) {
    stopRepeat();
    moveBy(dc);
    repeatTimer = setTimeout(() => { repeatInterval = setInterval(() => moveBy(dc, { repeat: true }), REPEAT_MS); }, REPEAT_DELAY_MS);
  }
  function stopRepeat() {
    clearTimeout(repeatTimer);
    clearInterval(repeatInterval);
    repeatTimer = 0;
    repeatInterval = 0;
  }

  function onPadDown(e) {
    const btn = e.target.closest('.pad__btn');
    if (!btn) return;
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('is-held');
    const { pad } = btn.dataset;
    if (pad === 'left' || pad === 'right') startRepeat(pad === 'left' ? -1 : 1);
    else if (pad === 'rotate') turn();
    else if (pad === 'down') setSoft(true);
  }
  function onPadUp(e) {
    const btn = e.target.closest('.pad__btn');
    if (!btn) return;
    btn.classList.remove('is-held');
    stopRepeat();
    setSoft(false);
  }
  function onKeyDown(e) {
    if (!state || sheetOpen()) return;
    if (e.key in KEY_MOVE) {
      e.preventDefault();
      if (!e.repeat) startRepeat(KEY_MOVE[e.key]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!e.repeat) turn();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSoft(true);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) hardDrop();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      togglePause();
    }
  }
  function onKeyUp(e) {
    if (e.key in KEY_MOVE) stopRepeat();
    if (e.key === 'ArrowDown') setSoft(false);
  }
  // 창을 떠나거나 가려지면 멈춘다(돌아와도 저절로 돌지 않고 덮개를 누르면 계속)
  const onBlur = () => { stopRepeat(); setSoft(false); pause(); };
  const onVisibility = () => { if (document.hidden) onBlur(); };

  // 첫 판 손가락 안내(한 번만): 멈춘 채 단추 넷을 차례로 가리키고, 내리기를 누르면 떨어지기 시작한다
  let guideStep = 0;   // 0 안 함, 1 옮기기, 2 돌리기, 3 내리기, 4 끝
  const guiding = () => guideStep > 0 && guideStep < 4;
  const padEl = (id) => board.querySelector(`.pad__btn[data-pad="${id}"]`);
  const padBox = () => board.querySelector('.pad');
  function coachFor(ms, opts) {
    clearTimeout(coachTimer);
    shell.coach.show(opts);
    if (ms) coachTimer = setTimeout(() => shell.coach.hide(), ms);
  }
  // PC면 단추와 함께 키보드 키도 알려 준다
  const say = (withKeys, buttonsOnly) => (hasKeyboard() ? withKeys : buttonsOnly);
  function guideStart() {
    if (tipCount('blocks-coach') > 0) return false;
    bumpTip('blocks-coach');
    guideStep = 1;
    coachFor(0, { text: say('블록을 옮겨 보세요. 왼쪽·오른쪽 단추나 키보드의 왼쪽·오른쪽 화살표를 누르세요.', '왼쪽·오른쪽 단추로 블록을 옮겨 보세요'), at: () => padEl('right'), by: padBox });
    return true;
  }
  function guideNext(step) {
    if (guideStep !== step) return true;
    if (!shell.coach.active) { endGuide(); return true; }
    guideStep += 1;
    if (guideStep === 2) coachFor(0, { text: say('모양을 돌려 보세요. 돌리기 단추나 키보드의 위쪽 화살표를 누르세요.', '돌리기 단추로 모양을 돌려 보세요'), at: () => padEl('rotate'), by: padBox });
    else if (guideStep === 3) coachFor(0, { text: say('빨리 내려 보세요. 내리기 단추나 키보드의 아래쪽 화살표를 누르고 계세요.', '내리기 단추를 누르고 있으면 빨리 내려와요'), at: () => padEl('down'), by: padBox });
    else {
      guideStep = 4;
      resume();
      coachFor(6500, { text: say('한 줄을 가득 채우면 그 줄이 사라져요. 스페이스 바를 누르면 블록이 한 번에 내려가요.', '한 줄을 가득 채우면 그 줄이 사라져요. 해 보세요!') });
    }
    return true;
  }
  function endGuide() {
    guideStep = 4;
    clearTimeout(coachTimer);
    shell.coach.hide();
    resume();
  }

  // 판의 끝 -------------------------------------------------------------
  async function win() {
    running = false;
    clock.pause();
    clearSave(GAME);
    shell.setPressed('pause', false);
    const done = state.stage;
    putProgress(GAME, { stage: done + 1, top: Math.max(progressOf().top, done + 1) });
    const { record, improved, monthCount } = addWin(GAME, { score: state.score }, { score: 'max' });
    play('win');
    const lines = [`${done}단계를 깼습니다`, `점수 ${fmt(state.score)}, 지운 줄 ${state.lines}`];
    if (improved.includes('score')) lines.push('최고 점수를 새로 세웠어요');
    const news = newRule(done + 1);
    if (news) lines.push(`다음 단계부터 ${news}`);
    const choice = await shell.ask({
      title: '이겼습니다',
      body: lines.join('<br>'),
      extra: winProgressHtml(record.wins, monthCount),
      choices: [{ id: 'next', label: `${done + 1}단계`, sub: '다음 단계로', primary: true }, { id: 'home', label: '처음으로' }],
    });
    if (choice === 'next') startGame(done + 1);
    else onHome();
  }

  // 꽉 참: 이긴 판에는 더하지 않지만 점수는 최고 기록에 남긴다(2026-10-25 선생님 결정)
  async function gameOver() {
    running = false;
    clock.pause();
    clearSave(GAME);
    shell.setPressed('pause', false);
    const { stage } = state;
    const { improved } = noteBest(GAME, { score: state.score }, { score: 'max' });
    play('miss');
    const lines = [`점수 ${fmt(state.score)}, 지운 줄 ${state.lines}/${stageSpec(stage).lines}`];
    if (improved.includes('score')) lines.push('그래도 최고 점수를 새로 세웠어요');
    const choice = await shell.ask({
      title: '더 쌓을 곳이 없어요',
      body: lines.join('<br>'),
      choices: [
        { id: 'again', label: `${stage}단계`, sub: '다시 하기', primary: true },
        stage > 1 && { id: 'easier', label: `${stage - 1}단계`, sub: '한 단계 쉽게' },
        { id: 'home', label: '처음으로' },
      ].filter(Boolean),
    });
    if (choice === 'again') startGame(stage);
    else if (choice === 'easier') {
      putProgress(GAME, { stage: stage - 1, top: progressOf().top });
      startGame(stage - 1);
    } else onHome();
  }

  // 새 판: 지금 단계를 새로 시작하거나, 한 단계 쉽게(또는 이미 가 본 데까지 어렵게) 고른다
  async function askNewGame() {
    const { stage, top } = progressOf();
    const playing = state && !state.over && !state.won && state.board.some(Boolean);
    pause();
    const options = [
      stage > 1 && { id: String(stage - 1), label: `${stage - 1}단계`, sub: '한 단계 쉽게' },
      { id: String(stage), label: `${stage}단계`, sub: '새로 시작', primary: true },
      stage < top && { id: String(stage + 1), label: `${stage + 1}단계`, sub: '한 단계 어렵게' },
    ].filter(Boolean);
    const choice = await shell.ask({
      title: '새 게임',
      body: playing ? '하던 판은 없어집니다.' : '',
      choices: options,
      dismiss: playing ? { id: 'keep', label: '하던 판 계속하기' } : { id: 'home', label: '처음으로' },
    });
    const chosen = Number(choice);
    if (Number.isInteger(chosen) && chosen > 0) {
      putProgress(GAME, { stage: chosen, top });
      startGame(chosen);
    } else if (choice === 'home') onHome();
  }

  function startGame(stage) {
    state = newGame(stage);
    landedMs = null;
    resets = 0;
    acc = 0;
    soft = false;
    flashing = false;
    stopRepeat();
    clock.reset(0);
    clearSave(GAME);
    shown.fill(null);
    render();
    renderNext();
    sync();
    hideCover();
    clearTimeout(coachTimer);
    shell.coach.hide();
    shell.setPressed('pause', false);
    const news = newRule(stage);
    if (news && tipCount(`blocks-stage-${stage}`) === 0) {
      bumpTip(`blocks-stage-${stage}`);
      shell.toast(`이번 단계부터 ${news}`, NOTICE_MS);
    }
    if (guideStart()) running = false;
    else resume();
  }

  // 이어 받기와 이벤트 ------------------------------------------------------
  const onCover = () => { if (!guiding()) resume(); };
  const onScreenClick = (e) => {
    if (e.target.closest('[data-act="howto"]')) pause();                   // '방법' 카드가 뜨는 동안 멈춘다
    if (e.target.closest('.coach__skip') && guiding()) endGuide();          // '바로 시작'
    if (e.target.closest('.blocks__cover')) onCover();
  };
  shell.screen.addEventListener('click', onScreenClick, true);
  board.addEventListener('pointerdown', onPadDown);
  board.addEventListener('pointerup', onPadUp);
  board.addEventListener('pointercancel', onPadUp);
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', persist);
  const ro = new ResizeObserver(fit);
  ro.observe(board);

  if (state) {
    draw();
    pause('누르면 시작');
  } else {
    state = newGame(progressOf().stage);
    draw();
    startGame(progressOf().stage);
  }
  last = performance.now();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      persist();
      cancelAnimationFrame(raf);
      stopRepeat();
      clearTimeout(coachTimer);
      ro.disconnect();
      clock.dispose();
      shell.screen.removeEventListener('click', onScreenClick, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', persist);
      shell.destroy();
    },
  };
}

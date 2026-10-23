// 사천성 규칙. 화면과 무관한 순수 로직.
// 판: { cols, rows, cells }. cells[i]는 그림 번호, 빈칸은 -1.
// 판 바깥에 빈 테두리 한 줄이 있다고 보고, 그 길로도 이을 수 있다.

import { shuffleInPlace } from '../../core/random.js';

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// 두 패를 꺾임 두 번 이하로 잇는 길(테두리 좌표 포함 [행, 열] 목록). 없으면 null.
export const findPath = (board, a, b) => search(board, a, b, 2)?.path ?? null;

// 이을 수 없을 때 이유를 보여 주려고: 꺾는 횟수 제한 없이 가장 적게 꺾는 길 { path, turns }. 아예 닿지 않으면 null.
export const fewestTurnsPath = (board, a, b) => search(board, a, b, Infinity);

function search(board, a, b, maxTurns) {
  const { cols, rows, cells } = board;
  if (a === b || cells[a] < 0 || cells[a] !== cells[b]) return null;
  const R = rows + 2;
  const C = cols + 2;
  const start = [Math.floor(a / cols) + 1, (a % cols) + 1];
  const goal = [Math.floor(b / cols) + 1, (b % cols) + 1];
  const free = (r, c) => {
    if (r === goal[0] && c === goal[1]) return true;
    if (r <= 0 || c <= 0 || r >= R - 1 || c >= C - 1) return r >= 0 && c >= 0 && r < R && c < C;
    return cells[(r - 1) * cols + (c - 1)] < 0;
  };
  // 상태: 칸 + 들어온 방향. 꺾임 수가 적은 순서로 넓혀 간다(0-1 BFS).
  const best = new Map();
  const queue = [];
  for (let d = 0; d < 4; d++) queue.push({ r: start[0], c: start[1], d, turns: 0, prev: null });
  while (queue.length) {
    queue.sort((x, y) => x.turns - y.turns);
    const cur = queue.shift();
    const [dr, dc] = DIRS[cur.d];
    const r = cur.r + dr;
    const c = cur.c + dc;
    if (!free(r, c)) continue;
    const node = { r, c, d: cur.d, turns: cur.turns, prev: cur };
    if (r === goal[0] && c === goal[1]) return { path: trace(node), turns: cur.turns };
    const key = `${r},${c},${cur.d}`;
    if ((best.get(key) ?? Infinity) <= cur.turns) continue;
    best.set(key, cur.turns);
    for (let nd = 0; nd < 4; nd++) {
      const t = cur.turns + (nd === cur.d ? 0 : 1);
      if (t <= maxTurns) queue.push({ ...node, d: nd, turns: t });
    }
  }
  return null;
}

// 길을 [행, 열] 목록으로(판 좌표 기준, 테두리는 -1 또는 rows/cols)
function trace(node) {
  const pts = [];
  for (let n = node; n; n = n.prev) {
    const p = [n.r - 1, n.c - 1];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  return pts.reverse();
}

// 이을 수 있는 같은 그림 한 쌍 [a, b]. 없으면 null.
export function findHint(board) {
  const byPic = new Map();
  board.cells.forEach((v, i) => { if (v >= 0) byPic.set(v, [...(byPic.get(v) ?? []), i]); });
  for (const idx of byPic.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        if (findPath(board, idx[x], idx[y])) return [idx[x], idx[y]];
      }
    }
  }
  return null;
}

// 남은 패를 같은 자리 안에서 섞는다. 이을 짝이 생길 때까지 다시 섞는다.
// 짝이 될 그림이 하나도 없으면(그림마다 한 장뿐) 그대로 돌려준다.
export function shuffle(board) {
  const slots = board.cells.map((v, i) => (v >= 0 ? i : -1)).filter((i) => i >= 0);
  const pics = slots.map((i) => board.cells[i]);
  if (new Set(pics).size === pics.length) return board;
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells = [...board.cells];
    shuffleInPlace([...pics]).forEach((v, k) => { cells[slots[k]] = v; });
    const next = { ...board, cells };
    if (findHint(next)) return next;
  }
  // 무작위로 못 찾으면 같은 그림 두 장을 바로 옆 자리에 붙여 반드시 짝을 만든다
  const cells = [...board.cells];
  const order = shuffleInPlace([...pics]);
  const twin = order.find((v, k) => order.indexOf(v) !== k);
  const rest = [...order];
  rest.splice(rest.indexOf(twin), 1);
  rest.splice(rest.indexOf(twin), 1);
  [twin, twin, ...rest].forEach((v, k) => { cells[slots[k]] = v; });
  return { ...board, cells };
}

// 새 판: 그림 kinds가지 × copies장(기본 12가지 × 4장), 또는 counts로 그림마다 장수를 따로.
// 처음부터 이을 짝이 있게 섞는다.
export function deal({ cols = 8, rows = 6, kinds = 12, copies = 4, counts = Array(kinds).fill(copies) } = {}) {
  const pics = [];
  counts.forEach((n, k) => { for (let c = 0; c < n; c++) pics.push(k); });
  return shuffle({ cols, rows, cells: shuffleInPlace(pics) });
}

// 쏠림: 짝을 치운 뒤 남은 패가 한쪽으로 모인다. moves는 [옛 칸, 새 칸] 목록(움직인 패만).
const SETTLE = {
  down: { lines: 'cols', reverse: true },
  up: { lines: 'cols', reverse: false },
  right: { lines: 'rows', reverse: true },
  left: { lines: 'rows', reverse: false },
};

export function settle(board, dir) {
  const { cols, rows } = board;
  const { lines, reverse } = SETTLE[dir];
  const cells = Array(board.cells.length).fill(-1);
  const moves = new Map();
  const count = lines === 'cols' ? cols : rows;
  const len = lines === 'cols' ? rows : cols;
  for (let l = 0; l < count; l++) {
    let at = (k) => (lines === 'cols' ? k * cols + l : l * cols + k);
    let order = [...Array(len).keys()];
    if (reverse) order = order.reverse();
    let fill = 0;
    for (const k of order) {
      const from = at(k);
      if (board.cells[from] < 0) continue;
      const to = at(order[fill++]);
      cells[to] = board.cells[from];
      if (to !== from) moves.set(from, to);
    }
  }
  return { board: { ...board, cells }, moves };
}

// 단계표: 세 판마다 한 걸음씩 천천히 어려워진다(2026-10-23 선생님 결정).
// 판 크기 → 그림 가짓수(짝이 적은 그림) → 패 쏠림 순. 시간 제한·폭탄은 없다.
const four = (n) => Array(n).fill(4);
const two = (n) => Array(n).fill(2);
const STEPS = [
  { cols: 6, rows: 4, counts: four(6) },
  { cols: 8, rows: 4, counts: four(8) },
  { cols: 8, rows: 5, counts: four(10) },
  { cols: 8, rows: 6, counts: four(12) },
  { cols: 8, rows: 6, counts: [...four(6), ...two(12)] },
  { cols: 8, rows: 6, counts: two(24) },
  { cols: 8, rows: 6, counts: four(12), gravity: 'down' },
  { cols: 8, rows: 6, counts: [...four(6), ...two(12)], gravity: 'down' },
  { cols: 8, rows: 6, counts: two(24), gravity: 'down' },
  { cols: 8, rows: 6, counts: two(24), gravity: 'left' },
];
const LATER = ['down', 'left', 'up', 'right'];
export const STAGES_PER_STEP = 3;

export function stageSpec(stage) {
  const step = Math.floor((stage - 1) / STAGES_PER_STEP);
  if (step < STEPS.length) return STEPS[step];
  // 마지막 걸음 뒤로는 가장 어려운 판에서 쏠리는 방향만 단계마다 바뀐다
  return { ...STEPS.at(-1), gravity: LATER[(stage - 1) % LATER.length] };
}

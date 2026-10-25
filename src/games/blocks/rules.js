// 블록 쌓기 규칙. 화면과 무관한 순수 로직.
// 판: 길이 COLS×ROWS의 배열(줄 순서, 0번 줄이 맨 위). 칸 값 0은 빈칸, 1~7은 블록 종류(KINDS 순서).
// 블록(piece): { kind, rot, r, c } — kind는 글자, rot은 0~3(시계 방향), r·c는 모양 상자의 왼쪽 위 칸.

import { shuffleInPlace } from '../../core/random.js';

export const COLS = 10;
export const ROWS = 20;
export const KINDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// 기본 모양(회전 0). I는 4×4 상자, O는 2×2 상자(꽉 차 있어 돌려도 그대로), 나머지는 3×3 상자.
const BASE = {
  I: ['....', 'XXXX', '....', '....'],
  O: ['XX', 'XX'],
  T: ['.X.', 'XXX', '...'],
  S: ['.XX', 'XX.', '...'],
  Z: ['XX.', '.XX', '...'],
  J: ['X..', 'XXX', '...'],
  L: ['..X', 'XXX', '...'],
};

// 시계 방향으로 한 번 돌린 상자: new[r][c] = old[n-1-c][r]
const turn = (m) => m.map((_, r) => m.map((__, c) => m[m.length - 1 - c][r]).join(''));

// I·S·Z는 두 모양만 제자리에서 오간다. 상자째 네 방향으로 돌리면 두 번째 돌림마다 한 칸씩 밀려 보인다
// (2026-10-25 선생님 지적: 정사각형을 돌리면 자리가 움직였다). T·J·L은 가운데 칸을 축으로 네 방향.
const TWO_WAY = new Set(['I', 'S', 'Z']);

// 종류마다 회전 0~3의 칸 목록 [[dr, dc], ...]
const SHAPES = Object.fromEntries(KINDS.map((kind) => {
  let rots = [BASE[kind]];
  for (let k = 1; k < 4; k++) rots.push(turn(rots[k - 1]));
  if (TWO_WAY.has(kind)) rots = [rots[0], rots[1], rots[0], rots[1]];
  return [kind, rots.map((m) => m.flatMap((row, dr) => [...row].flatMap((ch, dc) => (ch === 'X' ? [[dr, dc]] : []))))];
}));

export const colorOf = (kind) => KINDS.indexOf(kind) + 1;
export const emptyBoard = () => Array(COLS * ROWS).fill(0);

export const cellsOf = ({ kind, rot, r, c }) => SHAPES[kind][rot].map(([dr, dc]) => [r + dr, c + dc]);

// 새 블록: 맨 윗줄 가운데(모양의 첫 칸이 0번 줄에 오도록)
export function spawn(kind) {
  const n = BASE[kind].length;
  const top = Math.min(...SHAPES[kind][0].map(([dr]) => dr));
  return { kind, rot: 0, r: -top, c: Math.floor((COLS - n) / 2) };
}

// 블록이 판 안의 빈칸에만 놓이는가
export function fits(board, piece) {
  return cellsOf(piece).every(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === 0);
}

// 한 칸 내려온 블록. 더 못 내려가면 null.
export function drop(board, piece) {
  const next = { ...piece, r: piece.r + 1 };
  return fits(board, next) ? next : null;
}

// 옆으로 한 칸(dc = -1 왼쪽, 1 오른쪽). 벽이나 다른 블록에 막히면 null.
export function move(board, piece, dc) {
  const next = { ...piece, c: piece.c + dc };
  return fits(board, next) ? next : null;
}

// 시계 방향 회전. 제자리에서 안 되면 왼쪽 1 → 오른쪽 1 → 왼쪽 2 → 오른쪽 2 → 위 1 → 아래 1 순으로 비켜 본다. 다 안 되면 null.
// (아래 1: 맨 윗줄의 I를 세로로 돌릴 때 판 위로 삐져나가지 않게)
const KICKS = [[0, 0], [0, -1], [0, 1], [0, -2], [0, 2], [-1, 0], [1, 0]];
export function rotate(board, piece) {
  const rot = (piece.rot + 1) % 4;
  for (const [dr, dc] of KICKS) {
    const next = { ...piece, rot, r: piece.r + dr, c: piece.c + dc };
    if (fits(board, next)) return next;
  }
  return null;
}

// 지금 열에서 그대로 떨어뜨렸을 때 내려앉는 자리
export function ghost(board, piece) {
  let p = piece;
  for (let next = drop(board, p); next; next = drop(board, p)) p = next;
  return p;
}

// 일곱 종류를 한 묶음으로 섞은 순서(같은 블록만 오래 안 나오는 일을 막는다)
export const newBag = () => shuffleInPlace([...KINDS]);

// 블록을 판에 굳힌 새 판
export function lock(board, piece) {
  const next = [...board];
  const v = colorOf(piece.kind);
  cellsOf(piece).forEach(([r, c]) => { next[r * COLS + c] = v; });
  return next;
}

// 가득 찬 줄을 지우고 위 줄을 내린다. rows는 지운 줄 번호(위에서부터).
export function clearLines(board) {
  const rows = [];
  const kept = [];
  for (let r = 0; r < ROWS; r++) {
    const row = board.slice(r * COLS, r * COLS + COLS);
    if (row.every((v) => v !== 0)) rows.push(r);
    else kept.push(...row);
  }
  if (rows.length === 0) return { board, rows };
  return { board: [...Array(rows.length * COLS).fill(0), ...kept], rows };
}

// 점수: 한 번에 지운 줄 수(1~4)에 따라, 단계를 곱한다
const LINE_SCORE = [0, 100, 300, 500, 800];
export const scoreFor = (lines, stage) => LINE_SCORE[lines] * stage;

// 단계표(2026-10-25 선생님 결정): 세 단계마다 한 걸음, 한 번에 하나만 바뀐다.
// 걸음 0~2는 목표 줄이 10→15→20으로 늘고(1.2초 그대로), 걸음 3부터 0.1초씩 빨라져 걸음 10(31단계~)에서 0.45초로 고정.
export const STAGES_PER_STEP = 3;
const LINE_GOALS = [10, 15, 20];
const START_MS = 1200;
const FASTEST_MS = 450;
export function stageSpec(stage) {
  const step = Math.floor((stage - 1) / STAGES_PER_STEP);
  const lines = LINE_GOALS[Math.min(step, LINE_GOALS.length - 1)];
  const faster = Math.max(0, step - (LINE_GOALS.length - 1));
  return { lines, intervalMs: Math.max(FASTEST_MS, START_MS - 100 * faster) };
}

// 묶음에서 다음 블록을 꺼낸다(비면 새 묶음)
function take(bag) {
  const rest = bag.length ? [...bag] : newBag();
  return { kind: rest.shift(), bag: rest };
}

// 새 판: 지금 블록과 다음 블록을 들고 시작한다
export function newGame(stage) {
  const first = take([]);
  const second = take(first.bag);
  return { stage, board: emptyBoard(), piece: spawn(first.kind), next: second.kind, bag: second.bag, lines: 0, score: 0, over: false, won: false };
}

// 지금 블록을 굳힌다: 줄을 지우고 점수를 더하고, 목표에 닿으면 이김, 아니면 다음 블록을 내린다(놓을 자리가 없으면 꽉 참).
export function lockPiece(state) {
  const { board, rows } = clearLines(lock(state.board, state.piece));
  const lines = state.lines + rows.length;
  const score = state.score + scoreFor(rows.length, state.stage);
  const won = lines >= stageSpec(state.stage).lines;
  const { kind, bag } = take(state.bag);
  const piece = spawn(state.next);
  const over = !won && !fits(board, piece);
  return { state: { ...state, board, piece, next: kind, bag, lines, score, won, over }, cleared: rows };
}

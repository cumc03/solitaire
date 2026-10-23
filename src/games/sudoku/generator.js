// 스도쿠 문제 만들기: 답을 하나 채운 뒤 칸을 지우되, 답이 하나뿐일 때만 지운다.
import { shuffleInPlace } from '../../core/random.js';

// 판 크기별 상자 모양(세로×가로)과 남겨 둘 숫자 수(쉬운 난이도)
export const SIZES = {
  4: { box: [2, 2], givens: 8 },
  6: { box: [2, 3], givens: 18 },
  9: { box: [3, 3], givens: 38 },
};

// 칸마다 같은 줄·같은 칸·같은 상자에 속하는 칸 목록
function peersOf(n) {
  const [bh, bw] = SIZES[n].box;
  const peers = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const set = new Set();
    for (let k = 0; k < n; k++) { set.add(r * n + k); set.add(k * n + c); }
    const br = r - (r % bh);
    const bc = c - (c % bw);
    for (let y = br; y < br + bh; y++) for (let x = bc; x < bc + bw; x++) set.add(y * n + x);
    set.delete(i);
    peers.push([...set]);
  }
  return peers;
}

const PEERS = Object.fromEntries(Object.keys(SIZES).map((n) => [n, peersOf(Number(n))]));
export const peers = (n) => PEERS[n];

function candidates(grid, n, i) {
  const used = new Set(PEERS[n][i].map((p) => grid[p]));
  const out = [];
  for (let v = 1; v <= n; v++) if (!used.has(v)) out.push(v);
  return out;
}

// 빈칸 중 후보가 가장 적은 칸부터 채우며 해를 센다(limit에 닿으면 멈춤)
function countSolutions(grid, n, limit, randomize = false, fill = null) {
  let best = -1;
  let bestCands = null;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) continue;
    const c = candidates(grid, n, i);
    if (c.length === 0) return 0;
    if (!bestCands || c.length < bestCands.length) { best = i; bestCands = c; }
    if (c.length === 1) break;
  }
  if (best < 0) {
    if (fill) fill.splice(0, fill.length, ...grid);
    return 1;
  }
  let count = 0;
  for (const v of randomize ? shuffleInPlace(bestCands) : bestCands) {
    grid[best] = v;
    count += countSolutions(grid, n, limit - count, randomize, fill);
    grid[best] = 0;
    if (count >= limit) break;
  }
  return count;
}

export function makePuzzle(n) {
  const solution = [];
  countSolutions(new Array(n * n).fill(0), n, 1, true, solution);
  const puzzle = [...solution];
  let filled = n * n;
  for (const i of shuffleInPlace([...puzzle.keys()])) {
    if (filled <= SIZES[n].givens) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions([...puzzle], n, 2) === 1) filled -= 1;
    else puzzle[i] = keep;
  }
  return { n, puzzle, solution };
}

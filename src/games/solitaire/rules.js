// 클론다이크 규칙과 상태. 화면과 무관한 순수 로직.
// 무늬: 0 스페이드, 1 하트, 2 다이아, 3 클로버. 1·2가 빨강.

import { shuffleInPlace } from '../../core/random.js';

export const isRed = (suit) => suit === 1 || suit === 2;

// 윈도우 솔리테어 표준 점수
const SCORE = {
  wasteToTableau: 5,
  toFoundation: 10,
  turnUp: 5,
  foundationToTableau: -15,
  recycleDraw1: -100,
  recycleDraw3: -20,
};

function shuffledDeck() {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: `${suit}-${rank}`, suit, rank, up: false });
  }
  return shuffleInPlace(deck);
}

export function newGame(drawCount = 1) {
  const deck = shuffledDeck();
  const tableau = [];
  for (let col = 0; col < 7; col++) {
    const pile = deck.splice(0, col + 1);
    pile[pile.length - 1].up = true;
    tableau.push(pile);
  }
  return {
    drawCount,
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    score: 0,
    history: [],
    won: false,
  };
}

const top = (pile) => pile[pile.length - 1];

function snapshot(s) {
  const { history, ...rest } = s;
  return JSON.stringify(rest);
}

// 되돌리기는 최근 200수까지(기기 저장 용량을 지키기 위해)
const HISTORY_LIMIT = 200;
function pushHistory(s) {
  s.history.push(snapshot(s));
  if (s.history.length > HISTORY_LIMIT) s.history.shift();
}

export function undo(s) {
  const prev = s.history.pop();
  if (!prev) return false;
  const restored = JSON.parse(prev);
  Object.assign(s, restored);
  return true;
}

export function canPlaceOnFoundation(card, pile) {
  const t = top(pile);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && card.rank === t.rank + 1;
}

export function canPlaceOnTableau(card, pile) {
  const t = top(pile);
  if (!t) return card.rank === 13;
  return t.up && isRed(t.suit) !== isRed(card.suit) && card.rank === t.rank - 1;
}

// 위치 표기: { zone: 'tableau'|'waste'|'foundation'|'stock', pile, index }
export function pileOf(s, zone, pile) {
  if (zone === 'tableau') return s.tableau[pile];
  if (zone === 'foundation') return s.foundations[pile];
  if (zone === 'waste') return s.waste;
  return s.stock;
}

// 집어 들 수 있는 카드 묶음(그 카드와 그 아래 카드 전부)
export function pickable(s, from) {
  const pile = pileOf(s, from.zone, from.pile);
  const card = pile[from.index];
  if (!card || !card.up) return null;
  if (from.zone === 'tableau') return pile.slice(from.index);
  if (from.index !== pile.length - 1) return null;
  return [card];
}

export function isLegal(s, from, to) {
  const cards = pickable(s, from);
  if (!cards) return false;
  if (to.zone === from.zone && to.pile === from.pile) return false;
  const dest = pileOf(s, to.zone, to.pile);
  if (to.zone === 'foundation') return cards.length === 1 && canPlaceOnFoundation(cards[0], dest);
  if (to.zone === 'tableau') return canPlaceOnTableau(cards[0], dest);
  return false;
}

export function move(s, from, to) {
  if (!isLegal(s, from, to)) return false;
  pushHistory(s);
  const src = pileOf(s, from.zone, from.pile);
  const moving = src.splice(from.index);
  pileOf(s, to.zone, to.pile).push(...moving);

  if (to.zone === 'foundation') s.score += SCORE.toFoundation;
  else if (from.zone === 'waste') s.score += SCORE.wasteToTableau;
  else if (from.zone === 'foundation') s.score += SCORE.foundationToTableau;

  if (from.zone === 'tableau') {
    const newTop = top(src);
    if (newTop && !newTop.up) {
      newTop.up = true;
      s.score += SCORE.turnUp;
    }
  }
  s.score = Math.max(0, s.score);
  s.won = s.foundations.every((f) => f.length === 13);
  return true;
}

export function draw(s) {
  if (s.stock.length === 0 && s.waste.length === 0) return false;
  pushHistory(s);
  if (s.stock.length === 0) {
    s.stock = s.waste.reverse().map((c) => ({ ...c, up: false }));
    s.waste = [];
    s.score = Math.max(0, s.score + (s.drawCount === 1 ? SCORE.recycleDraw1 : SCORE.recycleDraw3));
    return true;
  }
  const n = Math.min(s.drawCount, s.stock.length);
  for (let i = 0; i < n; i++) {
    const c = s.stock.pop();
    c.up = true;
    s.waste.push(c);
  }
  return true;
}

// 한 번 누르기: 갈 수 있는 자리를 골라 준다. 윗줄(파운데이션) 우선, 그다음 빈 줄이 아닌 칸, 마지막에 빈 칸.
export function autoTarget(s, from) {
  const cards = pickable(s, from);
  if (!cards) return null;
  if (cards.length === 1) {
    for (let f = 0; f < 4; f++) {
      const to = { zone: 'foundation', pile: f };
      if (isLegal(s, from, to)) return to;
    }
  }
  let empty = null;
  for (let t = 0; t < 7; t++) {
    const to = { zone: 'tableau', pile: t };
    if (!isLegal(s, from, to)) continue;
    if (s.tableau[t].length > 0) return to;
    // 이미 줄 맨 아래에 있는 킹을 빈 줄로 옮기는 건 의미 없음
    if (!(from.zone === 'tableau' && from.index === 0)) empty ??= to;
  }
  return empty;
}

// 힌트: 의미 있는 움직임 하나
export function findHint(s) {
  const sources = [];
  if (s.waste.length) sources.push({ zone: 'waste', pile: 0, index: s.waste.length - 1 });
  s.tableau.forEach((pile, t) => {
    const firstUp = pile.findIndex((c) => c.up);
    if (firstUp >= 0) {
      sources.push({ zone: 'tableau', pile: t, index: pile.length - 1 });
      if (firstUp < pile.length - 1) sources.push({ zone: 'tableau', pile: t, index: firstUp });
    }
  });
  for (const from of sources) {
    const cards = pickable(s, from);
    if (cards.length === 1) {
      for (let f = 0; f < 4; f++) {
        if (isLegal(s, from, { zone: 'foundation', pile: f })) return { from, to: { zone: 'foundation', pile: f } };
      }
    }
  }
  for (const from of sources) {
    for (let t = 0; t < 7; t++) {
      const to = { zone: 'tableau', pile: t };
      if (!isLegal(s, from, to)) continue;
      const revealsCard = from.zone === 'tableau' && from.index > 0;
      const fromWaste = from.zone === 'waste';
      const kingToEmpty = s.tableau[t].length === 0;
      if (fromWaste || revealsCard || (kingToEmpty && from.index > 0)) return { from, to };
    }
  }
  if (s.stock.length || s.waste.length) return { stock: true };
  return null;
}

// 판의 카드가 모두 앞면이면, 남은 더미·넘긴 칸까지 넘겨 가며 끝까지 올릴 수 있는지 사본으로 미리 해 본다
export function canAutoFinish(s) {
  if (!s.tableau.every((p) => p.every((c) => c.up))) return false;
  const t = structuredClone({ ...s, history: [] });
  for (let k = 0; k < 1000 && !t.won; k++) if (!autoFinishStep(t)) return false;
  return t.won;
}

// 자동 마무리 한 걸음: 넘긴 칸·판 맨 위 카드를 모을 자리로. 올릴 게 없으면 더미를 넘긴다.
// 더미를 한 바퀴 다 돌아도 올린 카드가 없으면 멈춘다(false). 연달아 넘긴 횟수는 s.idleDraws에 센다.
export function autoFinishStep(s) {
  const tops = [
    ...(s.waste.length ? [{ zone: 'waste', pile: 0, index: s.waste.length - 1 }] : []),
    ...s.tableau.map((pile, t) => pile.length && { zone: 'tableau', pile: t, index: pile.length - 1 }).filter(Boolean),
  ];
  for (const from of tops) {
    for (let f = 0; f < 4; f++) {
      if (move(s, from, { zone: 'foundation', pile: f })) {
        s.idleDraws = 0;
        return true;
      }
    }
  }
  const cycle = s.stock.length + s.waste.length;
  if (!cycle || (s.idleDraws ?? 0) > cycle + 1) return false;
  s.idleDraws = (s.idleDraws ?? 0) + 1;
  return draw(s);
}

// 더 둘 곳이 있는지: 판 위 의미 있는 움직임, 또는 남은 카드 더미를 한 바퀴 넘기며 쓸 수 있는 카드
export function hasAnyMove(s) {
  const hint = findHint(s);
  if (hint && !hint.stock) return true;
  if (!s.stock.length && !s.waste.length) return false;
  const t = structuredClone({ ...s, history: [] });
  const rounds = 2 * (t.stock.length + t.waste.length) + 2;
  for (let i = 0; i < rounds; i++) {
    draw(t);
    const top = t.waste[t.waste.length - 1];
    if (!top) continue;
    if (t.foundations.some((f) => canPlaceOnFoundation(top, f))) return true;
    if (t.tableau.some((p) => canPlaceOnTableau(top, p))) return true;
  }
  return false;
}

// 윈도우 솔리테어식 시간 보너스: 30초 이상 걸린 판에 700000 ÷ 걸린 초
export function timeBonus(elapsedMs) {
  const sec = Math.floor(elapsedMs / 1000);
  return sec >= 30 ? Math.round(700000 / sec) : 0;
}

// 솔리테어 화면: 배치 계산, 카드 그리기, 누르기·끌기, 저장, 기록.
import * as K from './rules.js';
import { Spring2D } from '../../core/spring.js';
import { play } from '../../core/sound.js';
import { mountShell } from '../../core/shell.js';
import { createClock, formatTime, formatMinutes } from '../../core/clock.js';
import { addWin, bumpTip, clearSave, getSave, putSave, tipCount } from '../../core/records.js';
import { winProgressHtml } from '../../core/progress-view.js';
import { playFinale } from './finale.js';

const GAME = 'solitaire';
const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rankText = (r) => RANK_LABEL[r] ?? String(r);
const drawLabel = (n) => (n === 1 ? '한 장씩' : '세 장씩');

export const entry = {
  mount,
  describeSave: (save) => `${drawLabel(save.state.drawCount)}, ${formatMinutes(save.elapsedMs)}`,
  recordLine: (rec) => `이긴 판 ${rec.wins}${rec.best.score ? `, 최고 ${rec.best.score.toLocaleString()}점` : ''}`,
};

function cardMarkup(c) {
  const face = c.rank > 10 || c.rank === 1
    ? `<span class="card__court">${rankText(c.rank)}</span>`
    : `<svg class="card__center"><use href="#suit-${c.suit}"/></svg>`;
  return `<div class="card__inner">
      <div class="card__face card__front ${K.isRed(c.suit) ? 'is-red' : 'is-black'}">
        <div class="card__index"><span class="card__rank">${rankText(c.rank)}</span><svg class="card__pip"><use href="#suit-${c.suit}"/></svg></div>
        ${face}
      </div>
      <div class="card__face card__back"></div>
    </div>`;
}

// '방법' 카드 장면: 실제 카드 모양(cardMarkup)으로 그린 작은 테이블
const miniCard = (c, x, y, extra = '') => `<div class="card is-up${extra}" style="transform:translate(${x}px,${y}px)">${cardMarkup(c)}</div>`;
const miniBack = (x, y) => `<div class="card" style="transform:translate(${x}px,${y}px)">${cardMarkup({ suit: 0, rank: 1 })}</div>`;
const miniTable = (inner, x = null, y = null) => `<div class="solitaire-mini">${inner}${x === null ? '' : `<i class="ph-fill ph-hand-pointing howto__finger" style="left:${x}px;top:${y}px"></i>`}</div>`;
const toolChip = (icon, label) => `<span class="tool"><span class="tool__icon"><i class="ph ${icon}"></i></span><span class="tool__label">${label}</span></span>`;
const BLACK7 = { suit: 0, rank: 7 };
const RED6 = { suit: 1, rank: 6 };

const HOWTO = {
  title: '솔리테어 하는 법',
  cards: [
    {
      text: '카드를 누르면 갈 수 있는 곳으로 저절로 옮겨 갑니다.',
      scene: miniTable(`${miniCard(BLACK7, 40, 22)}${miniCard(RED6, 176, 30)}<i class="ph ph-arrow-bend-up-left howto__arrow" style="left:118px;top:20px"></i>`, 214, 92),
    },
    {
      text: '원하는 곳이 따로 있으면 카드를 끌어서 놓아도 됩니다.',
      scene: miniTable(`${miniCard(BLACK7, 70, 16)}${miniCard(RED6, 96, 46, ' is-lifted')}`, 132, 110),
    },
    {
      text: '왼쪽 위 더미를 누르면 새 카드가 나옵니다. 한 장씩 또는 세 장씩 넘길 수 있어요.',
      scene: miniTable(`${miniBack(56, 26)}${miniCard({ suit: 2, rank: 12 }, 150, 26)}`, 92, 92),
    },
    {
      text: '막히면 힌트를 누르세요. 되돌리기는 한 수 물립니다.',
      scene: `<div class="howto__tools">${toolChip('ph-lightbulb', '힌트')}${toolChip('ph-arrow-counter-clockwise', '되돌리기')}</div>`,
    },
  ],
};

// 판 크기에 맞춘 자리 계산. 휴대폰 가로처럼 낮은 화면은 남은 카드 더미를 왼쪽, 윗줄 4칸을 오른쪽 기둥으로.
function computeLayout(W, H) {
  const pad = Math.max(8, Math.min(28, Math.round(Math.min(W, H) * 0.03)));
  let L;
  if (W > H && H < 520) {
    const g = 0.1;
    const groupGap = 0.32;
    let cw = (W - 2 * pad) / (10 + 9 * g + 2 * groupGap);
    cw = Math.min(cw, (H - 2 * pad) / 2.9, 150);
    const ch = cw * 1.4;
    const gx = cw * g;
    const total = 10 * cw + 9 * gx + 2 * cw * groupGap;
    const x0 = (W - total) / 2;
    const tabX = x0 + cw + gx + cw * groupGap;
    const fX = tabX + 7 * cw + 6 * gx + cw * groupGap;
    L = {
      cw, ch,
      stock: { x: x0, y: pad },
      waste: { x: x0, y: pad + ch + cw * 0.3, fanX: 0, fanY: ch * 0.2 },
      foundations: [0, 1, 2, 3].map((i) => ({ x: fX + (i % 2) * (cw + gx), y: pad + Math.floor(i / 2) * (ch + cw * 0.3) })),
      tableau: [...Array(7)].map((_, i) => ({ x: tabX + i * (cw + gx), y: pad })),
    };
  } else {
    const g = 0.14;
    let cw = (W - 2 * pad) / (7 + 6 * g);
    cw = Math.min(cw, (H - 2 * pad) / 5.2, 150);
    const ch = cw * 1.4;
    const gx = cw * g;
    const x0 = (W - (7 * cw + 6 * gx)) / 2;
    const col = (i) => x0 + i * (cw + gx);
    const tabY = pad + ch * 1.22;
    L = {
      cw, ch,
      stock: { x: col(0), y: pad },
      waste: { x: col(1), y: pad, fanX: cw * 0.26, fanY: 0 },
      foundations: [3, 4, 5, 6].map((i) => ({ x: col(i), y: pad })),
      tableau: [...Array(7)].map((_, i) => ({ x: col(i), y: tabY })),
    };
  }
  L.bottom = H - pad;
  L.fanDown = L.ch * 0.13;
  L.fanUp = L.ch * 0.3;
  return L;
}

// 각 카드가 갈 자리와 쌓임 순서
function placements(s, L) {
  const out = new Map();
  s.stock.forEach((c, i) => out.set(c.id, { x: L.stock.x, y: L.stock.y, z: 10 + i }));
  const fanStart = s.drawCount === 3 ? Math.max(0, s.waste.length - 3) : s.waste.length;
  s.waste.forEach((c, i) => {
    const fanned = s.drawCount === 3 && i >= fanStart ? i - fanStart : 0;
    out.set(c.id, { x: L.waste.x + fanned * L.waste.fanX, y: L.waste.y + fanned * L.waste.fanY, z: 100 + i });
  });
  s.foundations.forEach((pile, f) => pile.forEach((c, i) => out.set(c.id, { x: L.foundations[f].x, y: L.foundations[f].y, z: 200 + i })));
  s.tableau.forEach((pile, t) => {
    const base = L.tableau[t];
    let natural = 0;
    for (let i = 0; i < pile.length - 1; i++) natural += pile[i].up ? L.fanUp : L.fanDown;
    const room = L.bottom - base.y - L.ch;
    const squeeze = natural > room && natural > 0 ? room / natural : 1;
    let y = base.y;
    pile.forEach((c, i) => {
      out.set(c.id, { x: base.x, y, z: 300 + i });
      y += (c.up ? L.fanUp : L.fanDown) * squeeze;
    });
  });
  return out;
}

function locate(s, id) {
  const find = (zone, pile, arr) => {
    const index = arr.findIndex((c) => c.id === id);
    return index >= 0 ? { zone, pile, index } : null;
  };
  return (
    find('stock', 0, s.stock) || find('waste', 0, s.waste) ||
    s.foundations.reduce((r, p, f) => r || find('foundation', f, p), null) ||
    s.tableau.reduce((r, p, t) => r || find('tableau', t, p), null)
  );
}

const allCards = (s) => [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flat()];

function mount(root, { onHome }) {
  const shell = mountShell(root, {
    game: GAME,
    tally: [{ id: 'time', label: '시간' }, { id: 'score', label: '점수' }, { id: 'moves', label: '이동' }],
    actions: [
      { id: 'undo', icon: 'ph-arrow-counter-clockwise', label: '되돌리기' },
      { id: 'hint', icon: 'ph-lightbulb', label: '힌트' },
      { id: 'new', icon: 'ph-plus-circle', label: '새 게임' },
    ],
    onAction: (a) => ({ undo: doUndo, hint: showHint, new: askNewGame })[a]?.(),
    onHome: () => { persist(); onHome(); },
    howto: HOWTO,
  });

  const board = shell.board;
  board.setAttribute('aria-label', '솔리테어 판');
  board.innerHTML = `
    <div class="slot slot--stock" data-slot="stock"><i class="ph ph-arrow-clockwise"></i></div>
    ${[0, 1, 2, 3].map((f) => `<div class="slot slot--foundation" data-slot="foundation-${f}"><span>A</span></div>`).join('')}
    ${[...Array(7)].map((_, t) => `<div class="slot slot--tableau" data-slot="tableau-${t}"></div>`).join('')}`;

  const saved = getSave(GAME);
  let state = saved?.state ?? null;
  const clock = createClock(saved?.elapsedMs ?? 0);
  const cards = new Map(); // id -> { el, spring }
  let L = null;
  let drag = null;
  let busy = false; // 자동 마무리 중
  let stuckAsked = false;

  function persist() {
    if (state && !state.won) putSave(GAME, { state, elapsedMs: clock.elapsed() });
  }

  function ensureCards() {
    for (const c of allCards(state)) {
      if (cards.has(c.id)) continue;
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.id = c.id;
      el.innerHTML = cardMarkup(c);
      board.appendChild(el);
      const spring = new Spring2D(el);
      spring.set(L.stock.x, L.stock.y);
      cards.set(c.id, { el, spring });
    }
  }

  function placeSlots() {
    board.style.setProperty('--cw', `${L.cw}px`);
    board.style.setProperty('--ch', `${L.ch}px`);
    const put = (sel, p) => { board.querySelector(sel).style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`; };
    put('[data-slot="stock"]', L.stock);
    L.foundations.forEach((p, f) => put(`[data-slot="foundation-${f}"]`, p));
    L.tableau.forEach((p, t) => put(`[data-slot="tableau-${t}"]`, p));
  }

  function render({ animate = true, spring = null, flying = null } = {}) {
    if (!state || !L) return;
    ensureCards();
    const target = placements(state, L);
    const up = new Map(allCards(state).map((c) => [c.id, c.up]));
    // 같은 자리에 겹쳐 가려진 카드: 그림자가 쌓여 테두리처럼 보이지 않게 그림자를 뺀다
    const buried = new Set([
      ...state.stock.slice(0, -1),
      ...state.waste.slice(0, state.drawCount === 3 ? -3 : -1),
      ...state.foundations.flatMap((f) => f.slice(0, -1)),
    ].map((c) => c.id));
    for (const [id, { el, spring: sp }] of cards) {
      const p = target.get(id);
      if (!p) continue;
      const wasUp = el.classList.contains('is-up');
      el.classList.toggle('is-up', up.get(id));
      el.classList.toggle('is-buried', buried.has(id));
      if (!wasUp && up.get(id) && animate) play('flip');
      if (!animate) {
        sp.set(p.x, p.y);
        el.style.zIndex = p.z;
      } else if (Math.hypot(sp.x - p.x, sp.y - p.y) > 2) {
        // 날아가는 동안은 위로 올려 다른 카드 밑으로 지나가지 않게
        el.style.zIndex = 1000 + p.z;
        const opts = flying?.has(id) && spring ? spring : { damping: 1, response: 0.36 };
        sp.to(p.x, p.y, { ...opts, onRest: () => { el.style.zIndex = p.z; } });
      } else if (!sp.moving) {
        el.style.zIndex = p.z;
      }
    }
    board.classList.toggle('stock-empty', state.stock.length === 0);
    shell.set('score', state.score.toLocaleString());
    shell.set('moves', state.history.length);
    shell.setDisabled('undo', state.history.length === 0 || busy);
  }

  function tick() {
    shell.set('time', formatTime(clock.elapsed()));
  }

  function changed() {
    render();
    persist();
    afterMove();
  }

  function afterMove() {
    if (state.won) return win();
    if (K.canAutoFinish(state) && !busy) return autoFinish();
    if (!K.hasAnyMove(state)) {
      if (!stuckAsked) askStuck();
    } else {
      stuckAsked = false;
    }
  }

  async function askStuck() {
    stuckAsked = true;
    const choice = await shell.ask({
      title: '더 옮길 카드가 없어요',
      body: '새 게임을 시작하거나, 몇 수 되돌려 다른 길을 찾아보세요.',
      choices: [{ id: 'new', label: '새 게임', primary: true }, { id: 'undo', label: '되돌리기' }],
      dismiss: { id: 'stay', label: '판 그대로 보기' },
    });
    if (choice === 'new') askNewGame();
    if (choice === 'undo') doUndo();
  }

  // 자동 마무리: 남은 카드가 한 장씩 모을 자리로 날아간다. 처음엔 천천히, 갈수록 빨라진다(필요하면 더미도 넘긴다).
  function autoFinish() {
    busy = true;
    shell.setDisabled('undo', true);
    let delay = 190;
    const step = () => {
      const before = state.foundations.reduce((n, f) => n + f.length, 0);
      if (!K.autoFinishStep(state)) { busy = false; return changed(); }
      render();
      play(state.foundations.reduce((n, f) => n + f.length, 0) > before ? 'place' : 'flip');
      if (state.won) { busy = false; return setTimeout(win, 420); }
      delay = Math.max(60, delay * 0.9);
      setTimeout(step, delay);
    };
    setTimeout(step, 300);
  }

  async function win() {
    clock.pause();
    const elapsedMs = clock.elapsed();
    const bonus = K.timeBonus(elapsedMs);
    state.score += bonus;
    render();
    clearSave(GAME);
    const { record, improved, monthCount } = addWin(GAME, { score: state.score, time: elapsedMs }, { score: 'max', time: 'min' });
    // 끝 장면(빛 물결)을 보여 준 뒤 창을 띄운다. 무늬는 창 뒤에서 계속 떨어지고, 창을 닫으면 정리한다.
    const cleanup = await playFinale({ board, kings: state.foundations.map((f) => cards.get(f[f.length - 1].id).el) });
    const lines = [`점수 ${state.score.toLocaleString()}점${bonus ? ` (시간 보너스 ${bonus.toLocaleString()}점 포함)` : ''}`, `걸린 시간 ${formatTime(elapsedMs)}`];
    if (improved.includes('score')) lines.push('최고 점수를 새로 세웠어요');
    const choice = await shell.ask({
      title: '이겼습니다',
      body: lines.join('<br>'),
      extra: winProgressHtml(record.wins, monthCount),
      choices: [{ id: 'new', label: '새 게임', primary: true }, { id: 'home', label: '처음으로' }],
    });
    cleanup();
    if (choice === 'new') askNewGame();
    else onHome();
  }

  async function askNewGame() {
    const playing = state && !state.won;
    const choice = await shell.ask({
      title: '새 게임',
      body: '남은 카드를 몇 장씩 넘길까요?',
      choices: [
        { id: '1', label: '한 장씩', sub: '쉬움', primary: true },
        { id: '3', label: '세 장씩', sub: '어려움' },
      ],
      dismiss: playing ? { id: 'keep', label: '하던 판 계속하기' } : { id: 'home', label: '처음으로' },
    });
    if (choice === '1' || choice === '3') startGame(Number(choice));
    else if (choice === 'home') onHome();
  }

  function startGame(drawCount) {
    for (const { el } of cards.values()) el.remove();
    cards.clear();
    state = K.newGame(drawCount);
    stuckAsked = false;
    clock.reset(0);
    clock.start();
    ensureCards();
    // 더미에서 한 장씩 날아가 깔리는 첫 장면
    const target = placements(state, L);
    let i = 0;
    for (const pile of state.tableau) {
      for (const c of pile) {
        const { el, spring: sp } = cards.get(c.id);
        const p = target.get(c.id);
        el.classList.toggle('is-up', c.up);
        el.style.zIndex = 1000 + p.z;
        setTimeout(() => sp.to(p.x, p.y, { damping: 0.9, response: 0.42, onRest: () => { el.style.zIndex = p.z; } }), i++ * 28);
      }
    }
    for (const c of state.stock) cards.get(c.id).el.style.zIndex = target.get(c.id).z;
    board.classList.remove('stock-empty');
    shell.set('score', 0);
    shell.set('moves', 0);
    shell.setDisabled('undo', true);
    tick();
    persist();
    setTimeout(guideStart, 1400);   // 카드가 다 깔린 뒤
  }

  // 첫 판 손가락 안내(한 번만): 옮길 카드 → 더미 넘기기 → 힌트 단추 순으로 가리킨다
  let guide = null;   // 'move' | 'draw'
  let coachTimer = 0;
  const stockEl = () => (state.stock.length ? cards.get(state.stock[state.stock.length - 1].id).el : board.querySelector('[data-slot="stock"]'));
  function coachFor(ms, opts) {
    clearTimeout(coachTimer);
    shell.coach.show(opts);
    if (ms) coachTimer = setTimeout(() => shell.coach.hide(), ms);
  }
  function guideStart() {
    if (tipCount('solitaire-coach') > 0 || !state) return;
    const h = K.findHint(state);
    bumpTip('solitaire-coach');
    if (h && !h.stock) {
      const top = K.pickable(state, h.from)[0];
      guide = 'move';
      coachFor(0, { text: '카드를 누르면 갈 수 있는 곳으로 저절로 옮겨 갑니다', at: () => cards.get(top.id)?.el });
    } else {
      guide = 'draw';
      coachFor(0, { text: '왼쪽 위 더미를 누르면 새 카드가 나옵니다', at: stockEl });
    }
  }
  function guideNote(kind) {
    if (!guide) return;
    if (!shell.coach.active) { guide = null; return; }
    if (guide === 'move' && kind === 'move') {
      guide = 'draw';
      return coachFor(0, { text: '잘하셨어요! 이번엔 왼쪽 위 더미를 눌러 새 카드를 꺼내 보세요', at: stockEl });
    }
    if (guide === 'draw' && kind === 'draw') {
      guide = null;
      coachFor(6500, { text: '끌어서 옮겨도 됩니다. 막히면 힌트를 누르세요', at: () => document.querySelector('[data-act="hint"]') });
    }
  }

  // 누르기·끌기 (apple-design: 누르는 순간 반응, 손가락 1:1, 놓을 때 속도 이어받기)
  function onPointerDown(e) {
    if (busy || !state || e.button > 0) return;
    const cardEl = e.target.closest('.card');
    if (!cardEl) {
      if (e.target.closest('.slot--stock')) { e.preventDefault(); doDraw(); }
      return;
    }
    const loc = locate(state, cardEl.dataset.id);
    if (!loc) return;
    if (loc.zone === 'stock') { e.preventDefault(); doDraw(); return; }
    const group = K.pickable(state, loc);
    if (!group) return;
    e.preventDefault();
    cardEl.setPointerCapture(e.pointerId);
    const ids = group.map((c) => c.id);
    ids.forEach((id) => cards.get(id).el.classList.add('is-pressed'));
    drag = {
      pointerId: e.pointerId, loc, ids, sx: e.clientX, sy: e.clientY, moved: false,
      starts: ids.map((id) => ({ x: cards.get(id).spring.x, y: cards.get(id).spring.y })),
      hist: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
    };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ids.forEach((id, i) => {
        const { el } = cards.get(id);
        el.classList.add('is-lifted');
        el.style.zIndex = 2000 + i;
      });
    }
    drag.ids.forEach((id, i) => cards.get(id).spring.set(drag.starts[i].x + dx, drag.starts[i].y + dy));
    drag.hist.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (drag.hist.length > 6) drag.hist.shift();
  }

  function releaseVelocity(d) {
    const a = d.hist[0];
    const b = d.hist[d.hist.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt } : { vx: 0, vy: 0 };
  }

  // 끌어 놓은 카드와 가장 많이 겹치는, 놓을 수 있는 자리
  function dropTarget(d) {
    const first = cards.get(d.ids[0]).spring;
    const r = { x: first.x, y: first.y, w: L.cw, h: L.ch };
    const overlap = (a) =>
      Math.max(0, Math.min(r.x + r.w, a.x + a.w) - Math.max(r.x, a.x)) *
      Math.max(0, Math.min(r.y + r.h, a.y + a.h) - Math.max(r.y, a.y));
    let best = null;
    let bestArea = 0;
    const consider = (to, rect) => {
      if (!K.isLegal(state, d.loc, to)) return;
      const area = overlap(rect);
      if (area > bestArea) { best = to; bestArea = area; }
    };
    L.foundations.forEach((p, f) => consider({ zone: 'foundation', pile: f }, { x: p.x, y: p.y, w: L.cw, h: L.ch }));
    const target = placements(state, L);
    L.tableau.forEach((p, t) => {
      const pile = state.tableau[t];
      const last = pile.length ? target.get(pile[pile.length - 1].id) : p;
      consider({ zone: 'tableau', pile: t }, { x: p.x, y: p.y, w: L.cw, h: last.y - p.y + L.ch });
    });
    return best;
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    d.ids.forEach((id) => cards.get(id).el.classList.remove('is-pressed', 'is-lifted'));
    if (!d.moved) return doTap(d.loc, d.ids);
    const v = releaseVelocity(d);
    const to = e.type === 'pointercancel' ? null : dropTarget(d);
    const flying = new Set(d.ids);
    if (to && K.move(state, d.loc, to)) {
      play('place');
      render({ spring: { damping: 0.86, response: 0.3, vx: v.vx, vy: v.vy }, flying });
      persist();
      guideNote('move');
      afterMove();
    } else {
      render({ spring: { damping: 0.8, response: 0.32, vx: v.vx, vy: v.vy }, flying });
    }
  }

  function doTap(loc, ids) {
    const to = K.autoTarget(state, loc);
    if (to && K.move(state, loc, to)) {
      play('place');
      guideNote('move');
      changed();
    } else {
      // 갈 곳이 없으면 고개를 젓듯 살짝 흔든다
      ids.forEach((id) => {
        const { spring: sp } = cards.get(id);
        sp.to(sp.tx, sp.ty, { damping: 0.3, response: 0.22, vx: 520 });
      });
      play('miss');
    }
  }

  function doDraw() {
    if (K.draw(state)) {
      play('flip');
      guideNote('draw');
      changed();
    }
  }

  function doUndo() {
    if (busy || !K.undo(state)) return;
    play('flip');
    stuckAsked = false;
    render();
    persist();
  }

  function showHint() {
    if (!state) return;
    const h = K.findHint(state);
    board.querySelectorAll('.is-hint').forEach((el) => el.classList.remove('is-hint'));
    if (!h || (h.stock && !K.hasAnyMove(state))) return shell.toast('더 옮길 수 있는 카드가 없어요');
    const mark = [];
    if (h.stock) {
      mark.push(state.stock.length ? cards.get(state.stock[state.stock.length - 1].id).el : board.querySelector('[data-slot="stock"]'));
      shell.toast('남은 카드를 넘겨 보세요');
    } else {
      K.pickable(state, h.from).forEach((c) => mark.push(cards.get(c.id).el));
      const dest = K.pileOf(state, h.to.zone, h.to.pile);
      mark.push(dest.length ? cards.get(dest[dest.length - 1].id).el : board.querySelector(`[data-slot="${h.to.zone}-${h.to.pile}"]`));
    }
    mark.forEach((el) => el.classList.add('is-hint'));
    setTimeout(() => mark.forEach((el) => el.classList.remove('is-hint')), 1800);
  }

  function layout() {
    const r = board.getBoundingClientRect();
    if (!r.width || !r.height) return;
    L = computeLayout(r.width, r.height);
    placeSlots();
    render({ animate: false });
  }

  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('pointermove', onPointerMove);
  board.addEventListener('pointerup', onPointerUp);
  board.addEventListener('pointercancel', onPointerUp);
  const ro = new ResizeObserver(layout);
  ro.observe(board);
  layout();

  if (state) {
    clock.start();
    // 이어 하는 판이 이미 끝까지 올릴 수 있는 상태면 바로 마무리한다
    if (!state.won && K.canAutoFinish(state)) setTimeout(autoFinish, 600);
  } else askNewGame();
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

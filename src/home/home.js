// 첫 화면: 이어 하기 카드, 이번 달 컵, 게임 묶음 목록. 앱 제목 글자도 소리 단추도 두지 않는다(PRODUCT.md).
import { GAMES, findGame } from '../games/registry.js';
import { getMonthly, getRecord, getSave, lastPlayed } from '../core/records.js';
import { cupState, milestoneState, monthKey } from '../core/progress.js';
import { cupHtml, cupRowHtml, medalHtml } from '../core/progress-view.js';
import { createSheet } from '../core/sheet.js';
import { play } from '../core/sound.js';

function resumeCard() {
  const game = findGame(lastPlayed());
  const save = game && getSave(game.id);
  if (!save) return '';
  return `
    <button type="button" class="resume" data-go="${game.id}">
      <img class="resume__icon" src="${game.icon}" alt="" draggable="false">
      <span class="resume__text"><b>이어 하기</b><small>${[game.name, ...game.describeSave(save).split(', ')].map((part) => `<span class="keep">${part}</span>`).join(', ')}</small></span>
      <span class="resume__go"><i class="ph-fill ph-play"></i></span>
    </button>`;
}

// 이번 달 컵 카드. 누르면 컵 진열장과 게임별 메달이 열린다.
function monthCupCard() {
  const count = getMonthly()[monthKey(new Date())] ?? 0;
  return `<button type="button" class="month-cup" data-home="cups">${cupRowHtml(count)}<i class="ph ph-caret-right"></i></button>`;
}

function shelfHtml() {
  const months = Object.entries(getMonthly()).sort(([a], [b]) => b.localeCompare(a));
  const cups = months.map(([key, count]) => {
    const { cup } = cupState(count);
    const [y, m] = key.split('-').map(Number);
    return `<li class="shelf__month">${cup ? cupHtml(cup.id) : '<span class="cup cup--md is-empty"></span>'}<b>${y}년 ${m}월</b><small>${count}판</small></li>`;
  }).join('');
  const medals = GAMES.map((g) => {
    const { reached, next } = milestoneState(getRecord(g.id).wins);
    const shown = [...reached.map((n) => medalHtml(n, { size: 'sm' })), ...(next ? [medalHtml(next, { size: 'sm', dim: true })] : [])];
    return `<li class="shelf__game"><b>${g.name}</b><span class="shelf__medals">${shown.join('')}</span></li>`;
  }).join('');
  return `<h3 class="shelf__head">이달의 컵</h3>
    ${months.length ? `<ul class="shelf__months">${cups}</ul>` : '<p class="shelf__none">이긴 판이 생기면 이번 달 컵이 차오릅니다.</p>'}
    <h3 class="shelf__head">메달</h3><ul class="shelf__games">${medals}</ul>`;
}

function render() {
  const rows = GAMES.map((g) => {
    const rec = getRecord(g.id);
    const top = milestoneState(rec.wins).reached.at(-1);
    return `
    <button type="button" class="game-list__row" data-go="${g.id}">
      <img class="game-list__icon" src="${g.icon}" alt="" draggable="false">
      <span class="game-list__text"><span class="game-list__name"><b>${g.name}</b>${top ? medalHtml(top, { size: 'sm' }) : ''}</span><small>${g.recordLine(rec)}</small></span>
      <i class="ph ph-caret-right"></i>
    </button>`;
  }).join('');
  return `
    <section class="home">
      <div class="home__col">
        ${resumeCard()}
        ${monthCupCard()}
        <nav class="game-list" aria-label="게임">${rows}</nav>
      </div>
    </section>`;
}

export function mountHome(root, { onOpen }) {
  let sheet;
  const draw = () => {
    root.innerHTML = render();
    sheet = createSheet(root);
  };
  draw();
  const onClick = (e) => {
    if (e.target.closest('[data-home="cups"]')) {
      play('place');
      sheet.ask({ title: '컵과 메달', extra: shelfHtml(), choices: [{ id: 'close', label: '닫기', primary: true }] });
      return;
    }
    const go = e.target.closest('[data-go]');
    if (!go) return;
    play('place');
    onOpen(go.dataset.go);
  };
  root.addEventListener('click', onClick);
  return {
    destroy() {
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    },
  };
}

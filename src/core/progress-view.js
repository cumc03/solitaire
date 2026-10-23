// 이정표 메달·이달의 컵 그림과 진행 막대. 이긴 창(네 게임)과 첫 화면이 같은 모양으로 쓴다.
import { cupState, milestoneState } from './progress.js';

const cupSrc = (id) => `assets/progress/cup-${id}.webp`;
const MEDAL_SRC = 'assets/progress/medal.webp';

// 메달 그림 위에 판 수를 얹는다. dim: 아직 받지 않은 것
export function medalHtml(n, { size = 'md', dim = false } = {}) {
  return `<span class="medal medal--${size}${dim ? ' is-dim' : ''}"><img src="${MEDAL_SRC}" alt="" draggable="false"><b>${n}</b></span>`;
}

export function cupHtml(id, { size = 'md', dim = false } = {}) {
  return `<span class="cup cup--${size}${dim ? ' is-dim' : ''}"><img src="${cupSrc(id)}" alt="" draggable="false"></span>`;
}

function bar(from, now, to) {
  const p = to === null ? 1 : (now - from) / (to - from);
  return `<span class="progress-bar" style="--p:${Math.max(0, Math.min(1, p))}"></span>`;
}

function row(icon, title, sub, barHtml) {
  return `<div class="progress-row">${icon}<span class="progress-row__text"><b>${title}</b><small>${sub}</small>${barHtml}</span></div>`;
}

// 이번 달 컵 한 줄(첫 화면 카드와 이긴 창이 같이 쓴다)
export function cupRowHtml(monthCount) {
  const c = cupState(monthCount);
  const icon = c.cup ? cupHtml(c.cup.id) : cupHtml(c.next.id, { dim: true });
  const title = c.next ? `${c.next.label}까지 ${c.left}판` : '이번 달 금컵';
  return row(icon, title, `이번 달 ${monthCount}판`, bar(c.from, monthCount, c.next?.at ?? null));
}

// 이긴 창 아래: 새로 받은 것 축하 + 이 게임 메달 진행 + 이번 달 컵 진행
export function winProgressHtml(wins, monthCount) {
  const m = milestoneState(wins);
  const c = cupState(monthCount);
  const cheers = [];
  if (m.justReached) cheers.push(`<div class="cheer">${medalHtml(m.justReached, { size: 'lg' })}<b>${m.justReached}판 메달을 받았습니다</b></div>`);
  if (c.justReached) cheers.push(`<div class="cheer">${cupHtml(c.justReached.id, { size: 'lg' })}<b>이번 달 ${c.justReached.label}을 받았습니다</b></div>`);
  const medalIcon = m.next ? medalHtml(m.next, { dim: true }) : medalHtml(m.from);
  const medalTitle = m.next ? `${m.next}판 메달까지 ${m.left}판` : '메달을 모두 받았습니다';
  return `${cheers.join('')}<div class="progress-list">
    ${row(medalIcon, medalTitle, `이긴 판 ${wins}`, bar(m.from, wins, m.next))}
    ${cupRowHtml(monthCount)}
  </div>`;
}

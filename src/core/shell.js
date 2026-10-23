// 게임 화면 공통 틀: 위 막대(처음으로·기록·도구 단추), 그 아래 판, 알림, 대화상자.
// 세 게임이 같은 자리에 같은 단추를 갖도록(PRODUCT.md 원칙 4) 틀은 여기 한 곳에서만 만든다.
import { isMuted, toggleMuted } from './sound.js';
import { createSheet } from './sheet.js';

const SOUND = { id: 'sound', icon: 'ph-speaker-high', label: '소리' };

function toolButton(a) {
  const pressed = a.toggle ? ' aria-pressed="false"' : '';
  return `<button type="button" class="tool" data-act="${a.id}"${pressed}>
    <span class="tool__icon"><i class="ph ${a.icon}"></i></span><span class="tool__label">${a.label}</span>
  </button>`;
}

export function mountShell(root, { game, tally, actions, onAction, onHome }) {
  root.innerHTML = `
    <section class="game-screen game-screen--${game}">
      <header class="game-top">
        <button type="button" class="back-link" data-act="home"><i class="ph ph-caret-left"></i><span>처음으로</span></button>
        <div class="status">${tally.map((t) => `<span class="status__item"><small>${t.label}</small><b data-out="${t.id}"></b></span>`).join('')}</div>
        <div class="toolbar" role="toolbar" aria-label="게임 단추">${[...actions, SOUND].map(toolButton).join('')}</div>
      </header>
      <div class="game-board"></div>
      <div class="toast" role="status" aria-live="polite"></div>
    </section>`;

  const screen = root.querySelector('.game-screen');
  const board = root.querySelector('.game-board');
  const toastEl = root.querySelector('.toast');
  let toastTimer = 0;
  const sheet = createSheet(screen);

  function syncSound() {
    const btn = screen.querySelector('[data-act="sound"]');
    btn.querySelector('i').className = `ph ${isMuted() ? 'ph-speaker-slash' : 'ph-speaker-high'}`;
    btn.querySelector('.tool__label').textContent = isMuted() ? '소리 끔' : '소리';
    btn.setAttribute('aria-pressed', String(isMuted()));
  }

  const api = {
    screen,
    board,
    set(id, value) {
      screen.querySelectorAll(`[data-out="${id}"]`).forEach((el) => { el.textContent = value; });
    },
    setDisabled(id, disabled) {
      const b = screen.querySelector(`[data-act="${id}"]`);
      if (b) b.disabled = disabled;
    },
    setPressed(id, pressed) {
      screen.querySelector(`[data-act="${id}"]`)?.setAttribute('aria-pressed', String(pressed));
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2000);
    },
    // 대화상자(sheet.js)
    ask: sheet.ask,
    closeSheet: sheet.close,
    destroy() {
      clearTimeout(toastTimer);
      ro.disconnect();
      root.innerHTML = '';
    },
  };

  screen.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === 'home') return onHome();
    if (act === 'sound') { toggleMuted(); syncSound(); return; }
    onAction(act);
  });

  // 위 막대가 한 줄에 다 들어가면 한 줄, 넘치면 두 줄(처음으로·기록 / 도구 단추). 화면 크기·단추 수와 상관없이 넘치지 않게 직접 잰다.
  const top = screen.querySelector('.game-top');
  const fitTop = () => {
    screen.classList.remove('is-stacked');
    if (top.scrollWidth > top.clientWidth + 1) screen.classList.add('is-stacked');
  };
  const ro = new ResizeObserver(fitTop);
  ro.observe(screen);
  document.fonts?.ready.then(fitTop);

  syncSound();
  return api;
}

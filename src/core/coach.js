import { sentences } from './lines.js';

// 손가락 안내(첫 판에 한 번): 판 위의 실제 칸을 손가락이 가리키고, 판 위쪽 말풍선이 한 줄로 알려 준다.
// 화면을 막지 않는다. 다른 곳을 눌러도 게임은 그대로 진행된다(조사: 막는 방식은 효과가 없었다,
// references/tutorial-research.md). '바로 시작'을 누르면 언제든 끝난다.
export function createCoach(screen, board, { onSkip } = {}) {
  const bubble = document.createElement('div');
  bubble.className = 'coach';
  bubble.hidden = true;
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.innerHTML = '<p class="coach__text"></p><button type="button" class="coach__skip">바로 시작</button>';
  const finger = document.createElement('div');
  finger.className = 'coach-finger';
  finger.hidden = true;
  finger.setAttribute('aria-hidden', 'true');
  finger.innerHTML = '<i class="ph-fill ph-hand-pointing"></i>';
  screen.append(bubble, finger);

  let target = null;
  let near = null;   // 말풍선을 붙일 덩어리(없으면 가리키는 곳)
  let raf = 0;

  // 판이 다시 그려지거나 패가 움직여도 손가락이 따라가도록 매 프레임 자리를 맞춘다.
  // 말풍선은 가리키는 곳 바로 위에(자리가 없으면 손가락 아래에) 두어, 글과 손가락이 한 덩어리로 읽히게 한다.
  function follow() {
    raf = requestAnimationFrame(follow);
    const b = board.getBoundingClientRect();
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const clampX = (x) => Math.min(Math.max(x, 12), innerWidth - w - 12);
    const t = typeof target === 'function' ? target() : target;
    if (!t || !t.isConnected) {
      finger.hidden = true;
      place(clampX(b.left + b.width / 2 - w / 2), b.top + 12);
      return;
    }
    const r = t.getBoundingClientRect();
    // 붙일 덩어리의 위·아래 중 빈 자리가 더 넓은 쪽에 둔다. 판 위쪽 경계(위 막대)는 넘지 않는다.
    const n = (typeof near === 'function' ? near() : near)?.getBoundingClientRect() ?? r;
    const below = n.bottom + (n === r ? 70 : 14);  // 가리키는 곳 바로 아래면 손가락 길이만큼 띄운다
    const roomAbove = n.top - 14 - (b.top + 8);
    const roomBelow = innerHeight - 8 - below;
    const y = roomAbove >= h && (roomAbove >= roomBelow || roomBelow < h) ? n.top - h - 14 : below;
    place(clampX(n.left + n.width / 2 - w / 2), Math.max(b.top + 8, Math.min(y, innerHeight - h - 8)));
    finger.hidden = false;
    finger.style.transform = `translate(${r.left + r.width * 0.5}px, ${r.top + r.height * 0.55}px)`;
  }

  function place(x, y) {
    bubble.style.left = `${Math.round(x)}px`;
    bubble.style.top = `${Math.round(y)}px`;
  }

  function show({ text, at = null, by = null }) {
    bubble.querySelector('.coach__text').replaceChildren(...sentences(text).map((s) => Object.assign(document.createElement('span'), { className: 'line', textContent: s })));
    target = at;
    near = by;
    bubble.hidden = false;
    bubble.classList.remove('is-in');
    void bubble.offsetWidth;
    bubble.classList.add('is-in');
    if (!raf) follow();
  }

  function hide() {
    cancelAnimationFrame(raf);
    raf = 0;
    target = null;
    near = null;
    bubble.hidden = true;
    finger.hidden = true;
  }

  bubble.querySelector('.coach__skip').addEventListener('click', () => {
    hide();
    onSkip?.();
  });

  return { show, hide, get active() { return !bubble.hidden; } };
}

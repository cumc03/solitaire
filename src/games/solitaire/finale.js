// 솔리테어 끝 장면 "빛 물결"(2026-10-24 선생님 선택, 시안 B — 비교 시안은 prototype/win-finale 가지).
// 모을 자리 네 줄 맨 위 K가 물결처럼 들렸다 내려앉고, 금빛이 그 위를 한 번 쓸고, ♠♥♦♣ 무늬가 흩날린다.
// 화면을 누르면 바로 끝으로 건너뛴다. 움직임 줄이기 설정이면 아무것도 하지 않는다.
import { play } from '../../core/sound.js';

const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)';
const SUITS = 72;               // 흩날리는 무늬 수
const DIALOG_AFTER = 1700;      // 이만큼 보여 준 뒤 "이겼습니다" 창(무늬는 창 뒤에서 계속 떨어진다)

// board: 판 요소, kings: 모을 자리 네 줄 맨 위 카드 요소. 끝나면 정리 함수를 돌려준다(창을 닫을 때 부른다).
export function playFinale({ board, kings }) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(() => {});
  const b = board.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'finale';
  board.append(layer);
  const anims = [];

  // K가 왼쪽부터 차례로 들렸다 내려앉는다(카드 겉모양만, 자리 계산은 건드리지 않는다)
  kings.forEach((el, i) => {
    const inner = el.querySelector('.card__inner');
    anims.push(inner.animate([
      { transform: 'none' },
      { transform: 'translateY(-22px) scale(1.08)', offset: 0.45 },
      { transform: 'none' },
    ], { duration: 620, delay: i * 120, easing: EASE }));
    setTimeout(() => play('tick'), i * 120);
  });

  // 금빛 한 줄기가 네 장 위를 왼쪽에서 오른쪽으로
  const first = kings[0].getBoundingClientRect();
  const last = kings.at(-1).getBoundingClientRect();
  const sweep = document.createElement('div');
  sweep.className = 'finale__sweep';
  sweep.style.cssText = `left:${first.left - b.left}px;top:${first.top - b.top}px;width:${last.right - first.left}px;height:${first.height}px`;
  layer.append(sweep);
  anims.push(sweep.animate([{ backgroundPosition: '-120% 0' }, { backgroundPosition: '220% 0' }], { duration: 900, delay: 380, easing: 'ease-in-out', fill: 'forwards' }));

  // 무늬가 위에서 천천히 흔들리며 떨어진다(빨강 ♥♦, 검정 ♠♣, 가끔 금빛)
  for (let i = 0; i < SUITS; i++) {
    const suit = i % 4;
    const red = suit === 1 || suit === 2;
    const size = 16 + Math.random() * 22;
    const s = document.createElement('div');
    s.className = `finale__suit ${red ? 'is-red' : i % 7 === 0 ? 'is-gold' : 'is-black'}`;
    s.innerHTML = `<svg viewBox="0 0 24 24"><use href="#suit-${suit}"/></svg>`;
    s.style.cssText = `left:${Math.random() * b.width}px;width:${size}px;height:${size}px`;
    layer.append(s);
    anims.push(s.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { transform: `translate(${(Math.random() - 0.5) * 160}px, ${b.height + 80}px) rotate(${(Math.random() - 0.5) * 540}deg)`, opacity: 0.9 },
    ], { duration: 2600 + Math.random() * 1400, delay: 600 + Math.random() * 900, easing: 'cubic-bezier(0.35, 0.1, 0.6, 1)', fill: 'forwards' }));
  }

  const cleanup = () => { anims.forEach((a) => a.cancel()); layer.remove(); };
  return new Promise((resolve) => {
    let done = false;
    const finish = (skip) => {
      if (done) return;
      done = true;
      if (skip) anims.forEach((a) => { try { a.finish(); } catch { /* 이미 끝남 */ } });
      layer.classList.add('is-behind');   // 창이 뜬 뒤에는 무늬가 누르기를 막지 않는다
      play('win');
      resolve(cleanup);
    };
    layer.addEventListener('pointerdown', () => finish(true), { once: true });
    setTimeout(() => finish(false), DIALOG_AFTER);
  });
}

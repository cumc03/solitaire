// 대화상자: 고른 단추의 id로 끝나는 약속(Promise)을 돌려준다. 게임 화면(shell.js)과 첫 화면이 함께 쓴다.
// extra: 본문 아래에 넣을 덩어리(이긴 창의 진행 막대, 컵 진열장 등)
export function createSheet(container) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.hidden = true;
  container.append(el);
  let resolveChoice = null;

  function close() {
    el.classList.remove('is-open');
    el.hidden = true;
  }

  el.addEventListener('click', (e) => {
    const choice = e.target.closest('[data-choice]');
    if (!choice) return;
    const resolve = resolveChoice;
    resolveChoice = null;
    resolve?.(choice.dataset.choice);
    // 고른 뒤 곧바로 다음 질문이 이어지면(예: 방법 카드 다음 장) 닫지 않고 내용만 바꾼다
    queueMicrotask(() => { if (!resolveChoice) close(); });
  });

  function ask({ title, body = '', extra = '', choices, dismiss = null }) {
    const open = !el.hidden;
    el.innerHTML = `
      <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${title}">
        <h2 class="sheet__title">${title}</h2>
        ${body ? `<p class="sheet__body">${body}</p>` : ''}
        ${extra ? `<div class="sheet__extra">${extra}</div>` : ''}
        <div class="sheet__choices sheet__choices--${choices.length}">
          ${choices.map((c) => `<button type="button" class="sheet__btn${c.primary ? ' is-primary' : ''}" data-choice="${c.id}"><b>${c.label}</b>${c.sub ? `<small>${c.sub}</small>` : ''}</button>`).join('')}
        </div>
        ${dismiss ? `<button type="button" class="sheet__close" data-choice="${dismiss.id}">${dismiss.label}</button>` : ''}
      </div>`;
    el.hidden = false;
    if (!open) requestAnimationFrame(() => el.classList.add('is-open'));
    el.querySelector('.sheet__btn.is-primary, .sheet__btn')?.focus();
    return new Promise((resolve) => { resolveChoice = resolve; });
  }

  return { ask, close };
}

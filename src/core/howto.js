import { sentences } from './lines.js';

// '방법' 그림 카드: 실제 판 조각으로 만든 장면 + 큰 한 문장. 이전·다음으로 넘겨 본다(Sudoku.com 방식,
// references/tutorial-research.md). 대화상자(sheet.js)를 그대로 쓰고, 넘길 때는 닫지 않고 내용만 바꾼다.
export async function showHowto(ask, { title, cards }) {
  let i = 0;
  for (;;) {
    const card = cards[i];
    const last = i === cards.length - 1;
    const dots = cards.map((_, k) => `<span class="howto__dot${k === i ? ' is-on' : ''}"></span>`).join('');
    const choice = await ask({
      title,
      extra: `<div class="howto" data-page="${i}"><div class="howto__scene">${card.scene}</div><p class="howto__text">${sentences(card.text).map((s) => `<span class="line">${s}</span>`).join('')}</p><div class="howto__dots" aria-label="${i + 1}번째 장, 모두 ${cards.length}장">${dots}</div></div>`,
      choices: [
        i > 0 && { id: 'prev', label: '이전' },
        { id: last ? 'done' : 'next', label: last ? '해 보기' : '다음', primary: true },
      ].filter(Boolean),
      dismiss: last ? null : { id: 'done', label: '닫기' },
    });
    if (choice === 'prev') i -= 1;
    else if (choice === 'next') i += 1;
    else return;
  }
}

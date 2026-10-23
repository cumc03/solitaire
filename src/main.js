// 화면 이동: 주소 뒤 #/게임이름 으로 화면을 정한다(뒤로 가기·새로 고침에도 같은 화면).
import { mountHome } from './home/home.js';
import { findGame } from './games/registry.js';

const app = document.getElementById('app');
let current = null;

const go = (id) => { location.hash = id ? `#/${id}` : '#/'; };

function show() {
  current?.destroy();
  const game = findGame(location.hash.replace(/^#\/?/, ''));
  document.documentElement.dataset.screen = game ? game.id : 'home';
  current = game
    ? game.mount(app, { onHome: () => go(null) })
    : mountHome(app, { onOpen: go });
}

window.addEventListener('hashchange', show);
show();

// 인터넷 없이도 열리도록 앱 파일을 기기에 저장(sw.js)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('오프라인 저장을 켜지 못했습니다', err));
}

// 서비스 워커: 한 번 열면 앱 파일 전부를 기기에 저장해 두고, 인터넷이 없어도 저장본으로 연다.
// 인터넷이 되면 늘 새 파일을 받아 저장본을 갈아 끼우므로 고친 내용은 다음에 열 때 바로 반영된다.
// FILES 목록이 바뀌면 VERSION을 올린다(옛 저장본은 지워진다). 빠진 파일은 tests/offline.test.mjs가 잡는다.
const VERSION = 'v12';
const CACHE = `game-room-${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app/icon-192.png', './assets/app/icon-512.png', './assets/app/apple-touch-icon.png', './assets/app/favicon-32.png',
  './src/main.js', './src/core/random.js', './src/core/sheet.js', './src/core/coach.js', './src/core/lines.js', './src/core/howto.js', './src/core/progress.js', './src/core/progress-view.js',
  './src/core/clock.js', './src/core/records.js', './src/core/shell.js', './src/core/sound.js', './src/core/spring.js', './src/core/storage.js',
  './src/home/home.js',
  './src/games/registry.js',
  './src/games/solitaire/rules.js', './src/games/solitaire/solitaire.js', './src/games/solitaire/finale.js',
  './src/games/memory/memory.js',
  './src/games/sudoku/generator.js', './src/games/sudoku/sudoku.js',
  './src/games/pictures.js', './src/games/sichuan/rules.js', './src/games/sichuan/sichuan.js',
  './src/games/blocks/rules.js', './src/games/blocks/blocks.js',
  './styles/tokens.css', './styles/base.css', './styles/home.css', './styles/shell.css', './styles/sheet.css', './styles/tutorial.css', './styles/progress.css',
  './styles/solitaire.css', './styles/memory.css', './styles/sudoku.css', './styles/sichuan.css', './styles/blocks.css',
  './vendor/pretendard/pretendard.css', './vendor/pretendard/PretendardVariable.woff2',
  './vendor/phosphor/regular/style.css', './vendor/phosphor/regular/Phosphor.woff2',
  './vendor/phosphor/fill/style.css', './vendor/phosphor/fill/Phosphor-Fill.woff2',
  './assets/icons/solitaire.webp', './assets/icons/memory.webp', './assets/icons/sudoku.webp', './assets/icons/sichuan.webp', './assets/icons/blocks.webp',
  ...['cup-bronze', 'cup-silver', 'cup-gold', 'medal'].map((name) => `./assets/progress/${name}.webp`),
  ...['home-wide', 'home-tall', 'home-solitaire', 'home-memory', 'home-sudoku', 'home-sichuan', 'home-blocks']
    .map((name) => `./assets/backgrounds/${name}.webp`),
  ...['persimmon', 'tangerine', 'apple', 'grapes', 'watermelon', 'sunflower', 'tulip', 'chrysanthemum', 'puppy', 'cat', 'rabbit', 'bird',
    'strawberry', 'peach', 'banana', 'kiwi', 'hydrangea', 'lily', 'lavender', 'squirrel', 'turtle', 'panda', 'goldfish', 'chick']
    .map((name) => `./assets/pictures/${name}.webp`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('game-room-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 인터넷에서 먼저 받아 저장본을 새로 고치고, 인터넷이 안 되면 저장본을 쓴다
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});

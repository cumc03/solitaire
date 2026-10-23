// 게임 목록. 첫 화면과 화면 이동은 이 목록만 보고 게임을 찾는다.
// scene: 그 게임의 배경 사진(GPT Image, assets/backgrounds). 첫 화면에서 마우스를 올렸을 때와 게임 화면이 같은 그림을 쓴다
import * as solitaire from './solitaire/solitaire.js';
import * as memory from './memory/memory.js';
import * as sudoku from './sudoku/sudoku.js';
import * as sichuan from './sichuan/sichuan.js';

export const GAMES = [
  { id: 'solitaire', name: '솔리테어', icon: 'assets/icons/solitaire.webp', scene: 'assets/backgrounds/home-solitaire.webp', ...solitaire.entry },
  { id: 'memory', name: '같은 그림 찾기', icon: 'assets/icons/memory.webp', scene: 'assets/backgrounds/home-memory.webp', ...memory.entry },
  { id: 'sudoku', name: '스도쿠', icon: 'assets/icons/sudoku.webp', scene: 'assets/backgrounds/home-sudoku.webp', ...sudoku.entry },
  { id: 'sichuan', name: '사천성', icon: 'assets/icons/sichuan.webp', scene: 'assets/backgrounds/home-sichuan.webp', ...sichuan.entry },
];

export const findGame = (id) => GAMES.find((g) => g.id === id) ?? null;

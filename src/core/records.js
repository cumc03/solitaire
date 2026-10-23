// 게임별 기록(이긴 판·최고 기록)과 하던 판. 저장 키 이름은 이 파일에서만 정한다.
import { load, save, remove } from './storage.js';
import { monthKey } from './progress.js';

export function getRecord(game) {
  return load(`record:${game}`, { wins: 0, best: {} });
}

// better: 각 기록 항목이 클수록 좋은지(max) 작을수록 좋은지(min)
export function addWin(game, result, better) {
  const rec = getRecord(game);
  rec.wins += 1;
  // improved: 앞선 기록이 있었고 그것을 넘어선 항목(첫 기록은 들지 않는다)
  const improved = [];
  for (const [key, value] of Object.entries(result)) {
    const prev = rec.best[key];
    if (prev === undefined) rec.best[key] = value;
    else if (better[key] === 'max' ? value > prev : value < prev) {
      rec.best[key] = value;
      improved.push(key);
    }
  }
  save(`record:${game}`, rec);
  // 이달의 컵: 네 게임에서 이긴 판을 달별로 함께 센다
  const monthly = getMonthly();
  const month = monthKey(new Date());
  monthly[month] = (monthly[month] ?? 0) + 1;
  save('monthly', monthly);
  return { record: rec, improved, monthCount: monthly[month] };
}

export const getSave = (game) => load(`save:${game}`, null);

export function putSave(game, data) {
  save(`save:${game}`, data);
  save('last-played', game);
}

export const clearSave = (game) => remove(`save:${game}`);

// 안내를 몇 번 보였는지(첫 판 손가락 안내, '처음 몇 번만' 알려 주는 한 줄 등)
export const tipCount = (key) => load(`tip:${key}`, 0);
export const bumpTip = (key) => save(`tip:${key}`, tipCount(key) + 1);

// 게임별 진행(예: 사천성 지금 단계와 가장 높이 간 단계). 판을 지워도 남는다.
export const getProgress = (game, empty) => load(`progress:${game}`, empty);
export const putProgress = (game, value) => save(`progress:${game}`, value);

export const lastPlayed = () => load('last-played', null);

export const getMuted = () => load('muted', false);
export const putMuted = (value) => save('muted', value);

// 달별 이긴 판 수 { '2026-10': 23, ... }
export const getMonthly = () => load('monthly', {});

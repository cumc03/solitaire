// 꾸준히 하면 쌓이는 것: 게임별 판 수 이정표와 네 게임 합산 이달의 컵(PRODUCT.md).
// 둘 다 줄어들지 않고 쉰 날을 벌하지 않는다. 화면과 무관한 순수 계산.
export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

export const CUPS = [
  { id: 'bronze', label: '동컵', at: 20 },
  { id: 'silver', label: '은컵', at: 50 },
  { id: 'gold', label: '금컵', at: 100 },
];

// wins: 그 게임에서 이긴 판 수. from은 진행 막대의 시작점(직전 이정표).
export function milestoneState(wins) {
  const reached = MILESTONES.filter((m) => wins >= m);
  const next = MILESTONES.find((m) => wins < m) ?? null;
  return {
    reached,
    next,
    from: reached.at(-1) ?? 0,
    left: next === null ? 0 : next - wins,
    justReached: MILESTONES.includes(wins) ? wins : null,
  };
}

// count: 이번 달 네 게임에서 이긴 판 수
export function cupState(count) {
  const cup = CUPS.findLast((c) => count >= c.at) ?? null;
  const next = CUPS.find((c) => count < c.at) ?? null;
  return {
    cup,
    next,
    from: cup?.at ?? 0,
    left: next === null ? 0 : next.at - count,
    justReached: CUPS.find((c) => c.at === count) ?? null,
  };
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// 게임 시간. 화면을 떠나 있거나 창이 가려진 동안은 흐르지 않는다.
export function createClock(startMs = 0) {
  let base = startMs;
  let since = null;

  const running = () => since !== null;
  const elapsed = () => Math.round(base + (running() ? performance.now() - since : 0));
  const start = () => { if (!running()) since = performance.now(); };
  const pause = () => { if (running()) { base = elapsed(); since = null; } };
  const reset = (ms = 0) => { base = ms; since = null; };

  const onVisibility = () => (document.hidden ? pause() : start());
  document.addEventListener('visibilitychange', onVisibility);

  return {
    elapsed, start, pause, reset, running,
    dispose() { document.removeEventListener('visibilitychange', onVisibility); },
  };
}

export function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export function formatMinutes(ms) {
  const m = Math.floor(ms / 60000);
  return m < 1 ? '방금 시작' : `${m}분째`;
}

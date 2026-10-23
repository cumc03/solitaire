// 기기 안 저장(localStorage). 기록은 기기마다 따로 남는다(PRODUCT.md).
// 개인정보 보호 모드처럼 저장이 막힌 브라우저에서도 게임은 그대로 돌아가야 하므로, 실패는 콘솔에만 알린다.
const PREFIX = 'game-room:';

export function load(key, empty) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? empty : JSON.parse(raw);
  } catch (err) {
    console.warn('저장된 값을 읽지 못했습니다', key, err);
    return empty;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('값을 저장하지 못했습니다', key, err);
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (err) {
    console.warn('저장된 값을 지우지 못했습니다', key, err);
  }
}

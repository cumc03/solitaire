// 안내 문장은 한 문장에 한 줄씩 시작한다(줄바꿈이 들쭉날쭉하지 않게). 긴 문장만 고르게 두 줄로 나뉜다(text-wrap: balance).
export const sentences = (text) => text.split(/(?<=[.!?])\s+/).filter(Boolean);

// 그림 패(assets/pictures/<id>.webp). 기본 12가지는 같은 그림 찾기와 사천성이 함께 쓰고,
// 더 많은 12가지는 사천성 어려움 판(24가지)에만 쓴다.
export const PICTURES = [
  { id: 'persimmon', name: '감' }, { id: 'tangerine', name: '귤' }, { id: 'apple', name: '사과' },
  { id: 'grapes', name: '포도' }, { id: 'watermelon', name: '수박' }, { id: 'sunflower', name: '해바라기' },
  { id: 'tulip', name: '튤립' }, { id: 'chrysanthemum', name: '국화' }, { id: 'puppy', name: '강아지' },
  { id: 'cat', name: '고양이' }, { id: 'rabbit', name: '토끼' }, { id: 'bird', name: '새' },
];

export const MORE_PICTURES = [
  { id: 'strawberry', name: '딸기' }, { id: 'peach', name: '복숭아' }, { id: 'banana', name: '바나나' },
  { id: 'kiwi', name: '키위' }, { id: 'hydrangea', name: '수국' }, { id: 'lily', name: '백합' },
  { id: 'lavender', name: '라벤더' }, { id: 'squirrel', name: '다람쥐' }, { id: 'turtle', name: '거북이' },
  { id: 'panda', name: '판다' }, { id: 'goldfish', name: '금붕어' }, { id: 'chick', name: '병아리' },
];

export const pictureSrc = (id) => `assets/pictures/${id}.webp`;

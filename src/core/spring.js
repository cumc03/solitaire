// 2축 스프링. 애플 방식: 감쇠비(damping) + 응답 시간(response).
// 언제든 현재 화면 위치에서 새 목표로 다시 출발하고, 속도를 이어받는다.

const springs = new Set();
let rafId = 0;

function tick(now) {
  rafId = 0;
  for (const sp of springs) sp.step(now);
  if (springs.size) rafId = requestAnimationFrame(tick);
}

function wake() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

export class Spring2D {
  constructor(el) {
    this.el = el;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.tx = 0; this.ty = 0;
    this.k = 0; this.c = 0;
    this.last = 0;
    this.onRest = null;
  }

  render() {
    this.el.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
  }

  // 즉시 이동(손가락을 1:1로 따라갈 때)
  set(x, y) {
    this.x = x; this.y = y; this.tx = x; this.ty = y;
    this.vx = 0; this.vy = 0;
    springs.delete(this);
    this.render();
  }

  to(tx, ty, { damping = 1, response = 0.35, vx, vy, onRest } = {}) {
    this.tx = tx; this.ty = ty;
    const w = (2 * Math.PI) / response;
    this.k = w * w;
    this.c = 2 * damping * w;
    if (vx !== undefined) this.vx = vx;
    if (vy !== undefined) this.vy = vy;
    this.onRest = onRest ?? null;
    this.last = performance.now();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.set(tx, ty);
      onRest?.();
      return;
    }
    springs.add(this);
    wake();
  }

  get moving() {
    return springs.has(this);
  }

  step(now) {
    let dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    // 작은 걸음으로 나눠 적분해 프레임이 흔들려도 안정적으로
    const n = Math.ceil(dt / (1 / 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const ax = -this.k * (this.x - this.tx) - this.c * this.vx;
      const ay = -this.k * (this.y - this.ty) - this.c * this.vy;
      this.vx += ax * h; this.vy += ay * h;
      this.x += this.vx * h; this.y += this.vy * h;
    }
    const resting =
      Math.abs(this.x - this.tx) < 0.3 && Math.abs(this.y - this.ty) < 0.3 &&
      Math.abs(this.vx) < 4 && Math.abs(this.vy) < 4;
    if (resting) {
      this.x = this.tx; this.y = this.ty; this.vx = 0; this.vy = 0;
      springs.delete(this);
      const cb = this.onRest;
      this.onRest = null;
      cb?.();
    }
    this.render();
  }
}

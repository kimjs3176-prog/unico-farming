/**
 * 길찾기 (렌더링 무관, 테스트: tests/path.test.js)
 *  - 맵을 격자로 나눠 막힌 칸(건물·울타리·연못·나무 등)을 한 번 표시해 두고
 *  - A* 로 돌아가는 길을 찾은 뒤, 일직선으로 갈 수 있는 구간은 이어 붙여 경유점을 줄임
 *  - 출발·도착 칸이 막혀 있으면 가장 가까운 빈칸에서 시작·끝
 */
export class NavGrid {
  /**
   * @param isBlocked (x, z) => bool — 캐릭터 반지름을 반영한 막힘 판정
   * @param bounds 맵 반폭 (−bounds..bounds)
   * @param cell 칸 크기
   */
  constructor(isBlocked, bounds, cell = 0.5) {
    this.cell = cell;
    this.min = -bounds;
    this.n = Math.ceil((bounds * 2) / cell);
    this.blocked = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const { x, z } = this.center(i, j);
      this.blocked[j * this.n + i] = isBlocked(x, z) ? 1 : 0;
    }
  }

  center(i, j) { return { x: this.min + (i + 0.5) * this.cell, z: this.min + (j + 0.5) * this.cell }; }
  idx(x, z) {
    const i = Math.floor((x - this.min) / this.cell), j = Math.floor((z - this.min) / this.cell);
    return { i: Math.max(0, Math.min(this.n - 1, i)), j: Math.max(0, Math.min(this.n - 1, j)) };
  }
  free(i, j) { return i >= 0 && j >= 0 && i < this.n && j < this.n && !this.blocked[j * this.n + i]; }

  /** 가장 가까운 빈칸 (막힌 칸이면 주변을 넓혀 가며 찾음) */
  nearestFree(i, j, maxR = 12) {
    if (this.free(i, j)) return { i, j };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !this.free(i + di, j + dj)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = { i: i + di, j: j + dj }; }
      }
      if (best) return best;
    }
    return null;
  }

  /** 두 점 사이를 막힘 없이 일직선으로 갈 수 있나 (칸 크기의 절반 간격으로 확인) */
  lineFree(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    // 선 양옆(칸 절반)도 확인 → 칸 가장자리를 스치며 장애물에 붙어 가지 않게
    const px = d ? (-(b.z - a.z) / d) * this.cell * 0.5 : 0, pz = d ? ((b.x - a.x) / d) * this.cell * 0.5 : 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (const k of [0, 1, -1]) { const { i, j } = this.idx(x + px * k, z + pz * k); if (!this.free(i, j)) return false; }
    }
    return true;
  }

  /**
   * from → to 경유점 목록 (마지막은 도착점). 길이 없으면 null
   * @param near 목표에서 이 거리 안의 빈칸에 닿으면 도착 (사람·건물 옆처럼 목표 자리가 막혀 있을 때).
   *   0 이면 목표 칸 — 목표 칸이 막혀 있으면 가장 가까운 빈칸 거리만큼으로 넓힘
   * @param maxNodes 탐색 상한 (너무 오래 걸리지 않게)
   */
  find(from, to, near = 0, maxNodes = 40000) {
    const n = this.n, C = this.cell;
    const s0 = this.idx(from.x, from.z), g0 = this.idx(to.x, to.z);
    const s = this.nearestFree(s0.i, s0.j, 4);
    if (!s) return null;
    const goalFree = this.free(g0.i, g0.j);
    if (!goalFree) {
      const g = this.nearestFree(g0.i, g0.j);
      if (!g) return null;
      const c = this.center(g.i, g.j);
      near = Math.max(near, Math.hypot(c.x - to.x, c.z - to.z) + C * 0.5);
    }
    const start = from;
    // 이미 일직선으로 갈 수 있으면 바로
    if (goalFree && this.free(s0.i, s0.j) && this.lineFree(start, to)) return [{ x: to.x, z: to.z }];

    const N = n * n, si = s.j * n + s.i, gi = g0.j * n + g0.i, nearC = near / C;
    const x0 = this.min + C * 0.5 - to.x, z0 = this.min + C * 0.5 - to.z;
    const isGoal = (k) => (goalFree && k === gi) || (near > 0 && Math.hypot(x0 + (k % n) * C, z0 + ((k / n) | 0) * C) <= near);
    const gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = (k) => { const dx = Math.abs((k % n) - g0.i), dz = Math.abs(((k / n) | 0) - g0.j); return Math.max(0, Math.max(dx, dz) + 0.4142 * Math.min(dx, dz) - nearC); };
    const heap = new MinHeap();
    gScore[si] = 0; heap.push(si, h(si));
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = -1, visited = 0;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k]) continue;
      if (isGoal(k)) { found = k; break; }
      closed[k] = 1;
      if (++visited > maxNodes) break;
      const ci = k % n, cj = (k / n) | 0;
      for (const [di, dj, c] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue; // 모서리 비껴 지나가기 금지
        const nk = nj * n + ni, ng = gScore[k] + c;
        if (ng < gScore[nk]) { gScore[nk] = ng; came[nk] = k; heap.push(nk, ng + h(nk)); }
      }
    }
    if (found < 0) return null;
    const end = found === gi && goalFree ? { x: to.x, z: to.z } : this.center(found % n, (found / n) | 0);
    if (found === si) return [end];
    const gi2 = found;
    const cells = [];
    for (let k = gi2; k !== -1; k = came[k]) cells.push(this.center(k % n, (k / n) | 0));
    cells.reverse();
    cells[cells.length - 1] = end;
    // 일직선으로 이을 수 있는 경유점은 건너뜀
    const out = [];
    let cur = this.free(s0.i, s0.j) ? start : cells[0];
    if (cur !== start) out.push(cur);
    let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.lineFree(cur, cells[b])) b--;
      out.push(cells[b]); cur = cells[b]; a = b;
    }
    if (!out.length) out.push(end);
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p; let i = K.length; K.push(k); P.push(p);
    while (i > 0) { const up = (i - 1) >> 1; if (P[up] <= p) break; K[i] = K[up]; P[i] = P[up]; i = up; }
    K[i] = k; P[i] = p;
  }
  pop() {
    const K = this.k, P = this.p, top = K[0], lk = K.pop(), lp = P.pop();
    if (K.length) {
      let i = 0; const n = K.length;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && P[c + 1] < P[c]) c++;
        if (P[c] >= lp) break;
        K[i] = K[c]; P[i] = P[c]; i = c;
      }
      K[i] = lk; P[i] = lp;
    }
    return top;
  }
}

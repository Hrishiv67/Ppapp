/**
 * Sliding-window median and MAD over the last `capacity` values.
 *
 * The onset threshold needs both every frame (~190 times a second). A sorted
 * copy of the window is kept up to date with one binary-search insert and one
 * delete per value, so the median is O(1) and the exact MAD is an O(W/2) merge
 * of the two already-sorted deviation runs either side of the median. That
 * avoids re-sorting the window each frame, which was the slow path.
 */
export class RunningMedian {
  private readonly ring: Float64Array;
  private readonly sorted: Float64Array;
  private count = 0;
  private head = 0;

  constructor(readonly capacity: number) {
    this.ring = new Float64Array(capacity);
    this.sorted = new Float64Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(value: number): void {
    if (this.count === this.capacity) {
      const old = this.ring[this.head];
      const at = this.lowerBound(old);
      this.sorted.copyWithin(at, at + 1, this.count);
      this.count--;
    }
    this.ring[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    const at = this.lowerBound(value);
    this.sorted.copyWithin(at + 1, at, this.count);
    this.sorted[at] = value;
    this.count++;
  }

  median(): number {
    const n = this.count;
    if (n === 0) return 0;
    const mid = n >> 1;
    return n % 2 === 1 ? this.sorted[mid] : 0.5 * (this.sorted[mid - 1] + this.sorted[mid]);
  }

  /** Median absolute deviation from the median (unscaled). */
  mad(): number {
    const n = this.count;
    if (n === 0) return 0;
    const med = this.median();
    const s = this.sorted;
    // Deviations grow monotonically walking outward from the median, so the
    // k-th smallest deviation is found by merging the two walks.
    let hi = this.lowerBound(med);
    let lo = hi - 1;
    const target = n >> 1;
    let last = 0;
    let prev = 0;
    for (let taken = 0; taken <= target; taken++) {
      const dLo = lo >= 0 ? med - s[lo] : Infinity;
      const dHi = hi < n ? s[hi] - med : Infinity;
      prev = last;
      if (dLo <= dHi) {
        last = dLo;
        lo--;
      } else {
        last = dHi;
        hi++;
      }
    }
    return n % 2 === 1 ? last : 0.5 * (prev + last);
  }

  private lowerBound(value: number): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

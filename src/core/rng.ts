/** Mulberry32. Same seed always yields the same stream. */
export class Rng {
  state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), this.state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  float(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  fork(salt: number): Rng {
    return new Rng((Math.imul(this.state ^ salt, 0x9e3779b1) ^ salt) >>> 0)
  }
}

export function randomSeed(): number {
  const buf = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
    return buf[0] >>> 0
  }
  return (Math.random() * 0xffffffff) >>> 0
}

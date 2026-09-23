export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function sign(n: number): number {
  return n < 0 ? -1 : n > 0 ? 1 : 0
}

export function hypot(x: number, y: number): number {
  return Math.hypot(x, y)
}

/** Deterministic unit hash for visuals. Not used by the simulation. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return s - Math.floor(s)
}

export function fnv1a(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function formatMeters(px: number, pxPerMeter: number): string {
  const m = Math.max(0, Math.floor(px / pxPerMeter))
  return m.toLocaleString('en-US')
}

export function formatScore(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US')
}

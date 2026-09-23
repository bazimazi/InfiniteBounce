import type { Difficulty, PlatformKind } from '../sim/types'

/**
 * Arcade physics. Responsiveness and readability outrank realism.
 * Safe-route gaps are derived from these numbers — change them together.
 */
export const TUNE = {
  fixedDt: 1 / 120,
  radius: 16,
  gravity: 1680,
  maxFall: 1720,
  minBounce: 760,
  maxBounce: 1240,
  restitution: 0.8,
  groundAccel: 2500,
  airAccel: 1180,
  brake: 1550,
  brakeV: 1.4,
  airBrake: 0.58,
  drag: 0.18,
  airDrag: 0.035,
  maxVx: 1040,
  bounceKick: 270,
  frictionKeep: 0.994,
  wallRestitution: 0.9,
  wallPop: 150,
  wallSkill: 90,
  dashImpulse: 680,
  dashUp: 160,
  dashCd: 0.92,
  dashCharges: 1,
  dashTime: 0.13,
  grace: 0.45,
  killDrop: 580,
  pickupRadius: 26,
  nearDist: 32,
  chainGrace: 2.15,
  segment: 820,
}

export interface ModeMul {
  gravity: number
  minBounce: number
  air: number
  maxVx: number
  brake: number
  promise: number
  diff: number
}

export const MODE: Record<Difficulty, ModeMul> = {
  relaxed: { gravity: 0.9, minBounce: 1.1, air: 1.22, maxVx: 0.86, brake: 1.2, promise: 0.82, diff: 0.62 },
  normal: { gravity: 1, minBounce: 1, air: 1, maxVx: 1, brake: 1, promise: 1, diff: 1 },
  hard: { gravity: 1.04, minBounce: 0.98, air: 0.9, maxVx: 1.06, brake: 0.94, promise: 1.05, diff: 1.12 },
  extreme: { gravity: 1.08, minBounce: 0.96, air: 0.82, maxVx: 1.12, brake: 0.88, promise: 1.08, diff: 1.22 },
  master: { gravity: 1.1, minBounce: 0.94, air: 0.76, maxVx: 1.18, brake: 0.84, promise: 1.1, diff: 1.32 },
}

export function hangTime(vy = TUNE.minBounce, g = TUNE.gravity): number {
  return (2 * vy) / g
}

/** Largest gap the safe route may ask for, clearable while rolling, not sprinting. */
export function safeGapLimit(mode: Difficulty): number {
  const m = MODE[mode]
  const hang = hangTime(TUNE.minBounce * m.minBounce, TUNE.gravity * m.gravity)
  const vx = 265 * m.promise
  return hang * vx * 0.8
}

/** How high the next safe platform may sit above the previous one. */
export function safeRiseLimit(kind: PlatformKind, mode: Difficulty): number {
  const bounceMul =
    kind === 'super' ? 1.22 : kind === 'launch' ? 1.34 : kind === 'weak' || kind === 'sticky' ? 0.58 : kind === 'cloud' ? 0.88 : 1
  const m = MODE[mode]
  const vy = TUNE.minBounce * m.minBounce * bounceMul
  const g = TUNE.gravity * m.gravity
  return (vy * vy) / (2 * g) * 0.6
}

export function expertGapLimit(mode: Difficulty): number {
  const m = MODE[mode]
  const hang = hangTime(TUNE.minBounce * 1.05 * m.minBounce, TUNE.gravity * m.gravity)
  return TUNE.maxVx * m.maxVx * 0.62 * hang * 0.78
}

import { CORES, coreById } from '../content/catalog'
import { moduleBoost } from '../content/progression'
import { MODE } from '../content/tune'
import type { CoreId, Difficulty, ModuleId, Mods, MutatorId } from './types'

export function emptyMods(): Mods {
  return {
    gravity: 1,
    bounce: 1,
    minBounce: 1,
    maxBounce: 1,
    accel: 1,
    air: 1,
    brake: 1,
    maxVx: 1,
    dashImpulse: 1,
    dashCharges: 1,
    dashCd: 1,
    wall: 1,
    wallPop: 0,
    magnet: 0,
    flowDecay: 1,
    score: 1,
    near: 1,
    frictionKeep: 1,
    phase: false,
    enemyBounce: 1,
    enemyDash: false,
    heavyLanding: false,
    control: 1,
    promise: 1,
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function computeMods(
  coreId: CoreId,
  modules: readonly ModuleId[],
  upgrades: readonly string[],
  difficulty: Difficulty,
  mutator: MutatorId,
  levels: Partial<Record<ModuleId, number>> = {},
): Mods {
  const core = coreById(coreId)
  const mode = MODE[difficulty]
  const m = emptyMods()
  m.gravity = core.gravity * mode.gravity
  m.bounce = core.bounce
  m.minBounce = mode.minBounce
  m.maxBounce = 1
  m.accel = core.accel
  m.air = core.air * mode.air
  m.brake = core.brake * mode.brake
  m.maxVx = core.maxVx * mode.maxVx
  m.dashImpulse = core.dash
  m.dashCharges = 1
  m.dashCd = 1
  m.magnet = core.magnet
  m.promise = mode.promise
  m.control = 1

  const has = (id: string) => modules.includes(id as ModuleId) || upgrades.includes(id)
  // A tuned module scales its upside only; the cost it asks stays the same.
  const up = (id: ModuleId) => (modules.includes(id) ? moduleBoost(levels[id] ?? 1) : 1)

  if (has('momentum')) {
    const b = up('momentum')
    m.frictionKeep *= 1 + 0.012 * b
    m.brake *= 0.9
    m.maxVx *= 1 + 0.04 * b
  }
  if (modules.includes('bounce') || upgrades.includes('spring')) {
    const b = up('bounce')
    m.bounce *= 1 + 0.1 * b
    m.minBounce *= 1 + 0.05 * b
    m.air *= 0.92
  }
  if (modules.includes('speed')) {
    m.maxVx *= 1 + 0.12 * up('speed')
    m.control *= 0.82
  }
  if (has('brake')) {
    m.brake *= 1 + 0.42 * up('brake')
    m.maxVx *= 0.94
  }
  if (modules.includes('combo') || upgrades.includes('keeper')) {
    m.flowDecay *= 1 - 0.38 * up('combo')
    m.score *= 0.94
  }
  if (modules.includes('risk') || upgrades.includes('risk')) {
    const b = up('risk')
    m.near *= 1 + 0.65 * b
    m.score *= 1 + 0.08 * b
    m.flowDecay *= 1.38
  }
  if (has('wall')) {
    const b = up('wall')
    m.wall *= 1 + 0.18 * b
    m.wallPop += 70 * b
    m.accel *= 0.92
  }
  if (has('magnet')) m.magnet += up('magnet')
  if (upgrades.includes('air')) m.air *= 1.38
  if (upgrades.includes('dash2')) m.dashCharges += 1
  if (upgrades.includes('dashfast')) m.dashCd *= 0.7
  if (upgrades.includes('phase')) m.phase = true
  if (upgrades.includes('enemy')) {
    m.enemyBounce *= 1.18
    m.enemyDash = true
  }
  if (upgrades.includes('glide')) {
    m.gravity *= 0.88
    m.maxBounce *= 1.04
  }
  if (upgrades.includes('heavy')) m.heavyLanding = true
  if (core.volatile) m.dashImpulse *= 1.05

  if (mutator === 'heavy') m.gravity *= 1.12
  if (mutator === 'nodash') m.dashCharges = 0
  if (mutator === 'tailwind') m.maxVx *= 1.06

  m.bounce = clamp(m.bounce, 0.75, 1.4)
  m.minBounce = clamp(m.minBounce, 0.8, 1.3)
  m.maxBounce = clamp(m.maxBounce, 0.8, 1.25)
  m.air = clamp(m.air, 0.45, 1.85)
  m.accel = clamp(m.accel, 0.55, 1.45)
  m.brake = clamp(m.brake, 0.45, 1.8)
  m.maxVx = clamp(m.maxVx, 0.68, 1.4)
  m.gravity = clamp(m.gravity, 0.7, 1.4)
  m.dashCharges = clamp(Math.round(m.dashCharges), 0, 3)
  m.dashCd = clamp(m.dashCd, 0.45, 1.4)
  m.frictionKeep = clamp(m.frictionKeep, 0.9, 1.03)
  m.score = clamp(m.score, 0.8, 1.35)
  m.near = clamp(m.near, 1, 2.4)
  m.flowDecay = clamp(m.flowDecay, 0.3, 2)
  return m
}

export const CORE_IDS = CORES.map((c) => c.id)

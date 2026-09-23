import { lerp } from '../core/math'
import { BIOME_COPY } from '../content/catalog'
import { LESSONS, unlockedBiomes } from '../content/world'
import { expertGapLimit, MODE, safeGapLimit, safeRiseLimit, TUNE } from '../content/tune'
import { PX_PER_METER, type BiomeId, type Chunk, type Difficulty, type Enemy, type Hazard, type HazardKind, type Pickup, type Platform, type PlatformKind, type Route, type Sim, type Zone, type ZoneKind } from '../sim/types'

const POOLS: Record<BiomeId, string[]> = {
  meadow: ['straight', 'gaps', 'stairs', 'split', 'pads', 'ice', 'super', 'hop', 'wisp', 'chasm', 'shrine'],
  industrial: ['straight', 'gaps', 'belt', 'crusher', 'pipes', 'pistons', 'split', 'hop', 'pursuit'],
  sky: ['straight', 'clouds', 'updraft', 'wind', 'islands', 'chasm', 'wisp'],
  neon: ['straight', 'lasers', 'traffic', 'rails', 'split', 'pads', 'shard'],
  cavern: ['straight', 'walls', 'zigzag', 'pads', 'hop', 'wisp'],
  inferno: ['straight', 'collapse', 'lava', 'launch', 'gaps', 'shard'],
  void: ['straight', 'grav', 'flip', 'pads', 'islands'],
  machine: ['crusher', 'lasers', 'walls', 'pistons', 'split', 'pursuit', 'shard'],
  cosmic: ['lowgrav', 'bumper', 'islands', 'chasm', 'wisp', 'super'],
  infinite: ['pads', 'walls', 'lasers', 'wind', 'collapse', 'split', 'shard', 'zigzag'],
}

interface Builder {
  platforms: Platform[]
  hazards: Hazard[]
  enemies: Enemy[]
  pickups: Pickup[]
  zones: Zone[]
  signs: { x: number; y: number; text: string }[]
  tags: string[]
  setpiece: string | null
  originX: number
  floorY: number
  cursor: number
  lastY: number
  lastKind: PlatformKind
  lastAmp: number
  safeCount: number
  difficulty: number
  mode: Difficulty
  mutator: Sim['config']['mutator']
  rng: Sim['worldRng']
  ids: { n: number }
}

function nid(b: Builder): number {
  return b.ids.n++
}

function makePlatform(
  b: Builder,
  x: number,
  y: number,
  w: number,
  kind: PlatformKind,
  route: Route,
  extra?: Partial<Platform>,
): Platform {
  const h = extra?.h ?? (kind === 'wall' ? 240 : 26)
  return {
    id: nid(b),
    x,
    y,
    w,
    h,
    kind,
    route,
    phase: extra?.phase ?? b.rng.next() * Math.PI * 2,
    amp: extra?.amp ?? 0,
    freq: extra?.freq ?? 1.1,
    axis: extra?.axis ?? 'x',
    conveyor: extra?.conveyor ?? (kind === 'conveyor' ? 170 : 0),
    collapseDelay: extra?.collapseDelay ?? lerp(0.95, 0.52, b.difficulty),
    collapsed: false,
    fallY: y,
    fallV: 0,
    touchedAt: 0,
    bumperAngle: extra?.bumperAngle ?? -Math.PI / 2,
    flash: 0,
  }
}

function gapLimit(b: Builder, prevKind: PlatformKind, amp: number): number {
  let limit = safeGapLimit(b.mode)
  if (prevKind === 'launch') limit *= 1.32
  else if (prevKind === 'super') limit *= 1.12
  limit -= amp
  return Math.max(36, limit)
}

function safe(b: Builder, baseW: number, gapBefore: number, yOff: number, kind: PlatformKind = 'normal', extra?: Partial<Platform>): Platform {
  let yy = b.floorY + yOff
  let gap = 0
  const axis = extra?.axis ?? 'x'
  let amp = extra?.amp ?? 0
  if (kind === 'moving' && amp === 0) amp = 46
  if (b.safeCount === 0) {
    yy = b.floorY
    gap = 0
    b.cursor = 0
  } else {
    const rise = b.lastY - yy
    const maxR = safeRiseLimit(b.lastKind, b.mode)
    if (rise > maxR) yy = b.lastY - maxR
    if (yy - b.lastY > 200) yy = b.lastY + 200
    gap = Math.max(28, gapBefore * lerp(0.84, 1, b.difficulty))
    const travel = axis === 'x' ? amp : 0
    const limit = gapLimit(b, b.lastKind, travel + b.lastAmp)
    gap = Math.min(gap, limit, 102)
    b.cursor += gap
  }
  let w = baseW * lerp(1.14, 0.86, b.difficulty)
  w = Math.max(96, w)
  if (kind === 'moving') {
    extra = { ...extra, amp, freq: extra?.freq ?? 1.15, axis }
    w = Math.max(w, 120)
  }
  const p = makePlatform(b, b.originX + b.cursor, yy, w, kind, 'safe', extra)
  b.platforms.push(p)
  b.cursor += w
  b.lastY = yy
  b.lastKind = kind
  b.lastAmp = kind === 'moving' && axis === 'x' ? amp : 0
  b.safeCount++
  return p
}

function close(b: Builder) {
  let guard = 0
  while (b.lastY < b.floorY - 20 && guard++ < 8) {
    const next = Math.min(b.floorY, b.lastY + 170)
    safe(b, 150, 58, next - b.floorY)
  }
  guard = 0
  while (b.lastY > b.floorY + 20 && guard++ < 8) {
    const maxR = Math.max(48, safeRiseLimit(b.lastKind, b.mode))
    const next = Math.max(b.floorY, b.lastY - maxR)
    safe(b, 160, 54, next - b.floorY, next < b.lastY - 8 ? 'super' : 'normal')
  }
  safe(b, 230, 42, 0)
}

function above(b: Builder, anchor: Platform, yOff: number, xFrac: number, baseW: number, kind: PlatformKind, route: Route = 'expert'): Platform {
  let w = baseW * lerp(1, 0.72, b.difficulty)
  w = Math.max(64, w)
  const x = anchor.x + anchor.w * xFrac - w / 2
  const cap = expertGapLimit(b.mode)
  const p = makePlatform(b, x, anchor.y + yOff, Math.min(w, cap), kind, route)
  b.platforms.push(p)
  return p
}

function wall(b: Builder, x: number, y: number, h: number) {
  b.platforms.push(makePlatform(b, x, y, 30, 'wall', 'expert', { h }))
  tag(b, 'wall')
}

function hazard(b: Builder, kind: HazardKind, x: number, y: number, w: number, h: number, extra?: Partial<Hazard>) {
  b.hazards.push({
    id: nid(b),
    kind,
    x,
    y,
    w,
    h,
    phase: extra?.phase ?? b.rng.next() * Math.PI * 2,
    freq: extra?.freq ?? 2,
    amp: extra?.amp ?? 140,
    speed: extra?.speed ?? 0,
  })
}

function zone(b: Builder, kind: ZoneKind, x: number, y: number, w: number, h: number, vx = 0, vy = 0, gravMul = 1) {
  b.zones.push({ id: nid(b), kind, x, y, w, h, vx, vy, gravMul })
}

function enemy(b: Builder, kind: Enemy['kind'], x: number, y: number, amp = 40): Enemy {
  const r = kind === 'shard' ? 13 : kind === 'wisp' ? 14 : 15
  const e: Enemy = {
    id: nid(b),
    kind,
    x,
    y,
    r,
    originX: x,
    originY: y,
    amp,
    freq: kind === 'wisp' ? 1.3 : 0.85,
    phase: b.rng.next() * 6,
    flash: 0,
    cooldown: 0,
  }
  b.enemies.push(e)
  if (!b.tags.includes('enemy')) b.tags.push('enemy')
  return e
}

function pickup(b: Builder, kind: Pickup['kind'], x: number, y: number, value = 1) {
  if (kind === 'shield' && b.mutator === 'glass') kind = 'gem'
  b.pickups.push({ id: nid(b), kind, x, y, taken: false, value, bob: b.rng.next() * 6 })
}

function tag(b: Builder, t: string) {
  if (!b.tags.includes(t)) b.tags.push(t)
}

function pits(b: Builder) {
  const safePads = b.platforms.filter((p) => p.route === 'safe' && p.kind !== 'wall').sort((a, c) => a.x - c.x)
  for (let i = 0; i < safePads.length - 1; i++) {
    const a = safePads[i]
    const c = safePads[i + 1]
    const gapStart = a.x + a.w
    const gap = c.x - gapStart
    const inset = 30
    if (gap > inset * 2 + 18 && Math.abs(a.y - c.y) < 36 && a.kind !== 'launch') {
      hazard(b, 'spikes', gapStart + inset, Math.max(a.y, c.y) + 40, gap - inset * 2, 20)
    }
  }
}

function finish(b: Builder, index: number, biome: BiomeId, moduleId: string, difficulty: number): Chunk {
  const safePads = b.platforms.filter((p) => p.route === 'safe')
  const exitY = safePads.length ? safePads[safePads.length - 1].y : b.floorY
  return {
    index,
    x: b.originX,
    w: Math.max(180, b.cursor),
    floorY: b.floorY,
    exitY,
    biome,
    moduleId,
    difficulty,
    tags: b.tags,
    platforms: b.platforms,
    hazards: b.hazards,
    enemies: b.enemies,
    pickups: b.pickups,
    zones: b.zones,
    signs: b.signs,
    setpiece: b.setpiece,
  }
}

function createBuilder(sim: Sim, originX: number, floorY: number, difficulty: number): Builder {
  return {
    platforms: [],
    hazards: [],
    enemies: [],
    pickups: [],
    zones: [],
    signs: [],
    tags: [],
    setpiece: null,
    originX,
    floorY,
    cursor: 0,
    lastY: floorY,
    lastKind: 'normal',
    lastAmp: 0,
    safeCount: 0,
    difficulty,
    mode: sim.config.difficulty,
    mutator: sim.config.mutator,
    rng: sim.worldRng,
    ids: sim.nextId,
  }
}

function author(id: string, b: Builder) {
  switch (id) {
    case 'tutorial0': {
      tag(b, 'steer')
      const a = safe(b, 340, 0, 0)
      safe(b, 300, 36, 0)
      safe(b, 300, 48, 0)
      b.signs.push({ x: a.x + 40, y: a.y - 78, text: 'Steer' })
      break
    }
    case 'tutorial1': {
      tag(b, 'land')
      safe(b, 220, 0, 0)
      safe(b, 170, 72, -48)
      safe(b, 200, 80, 0)
      b.signs.push({ x: b.originX + 80, y: b.floorY - 78, text: 'Land center' })
      break
    }
    case 'tutorial2': {
      tag(b, 'brake')
      tag(b, 'dash')
      tag(b, 'split')
      const a = safe(b, 220, 0, 0)
      const mid = safe(b, 200, 130, 0)
      safe(b, 260, 150, 0)
      const high = above(b, mid, -150, 0.5, 110, 'super')
      pickup(b, 'gem', high.x + high.w / 2, high.y - 36, 80)
      b.signs.push({ x: a.x, y: a.y - 78, text: 'Brake with S · Dash with Space' })
      break
    }
    case 'bridge': {
      safe(b, 280, 0, 0)
      safe(b, 260, 48, 0)
      safe(b, 260, 48, 0)
      const p = safe(b, 300, 48, 0)
      b.signs.push({ x: p.x, y: p.y - 84, text: 'The road changes' })
      break
    }
    case 'straight': {
      safe(b, 240, 0, 0)
      safe(b, 220, 70, 0)
      safe(b, 220, 80, 0)
      safe(b, 240, 70, 0)
      break
    }
    case 'gaps': {
      safe(b, 200, 0, 0)
      safe(b, 170, 120, 0)
      safe(b, 160, 140, -40)
      safe(b, 180, 120, 0)
      break
    }
    case 'stairs': {
      safe(b, 170, 0, 0)
      safe(b, 130, 46, -58)
      safe(b, 130, 46, -108)
      safe(b, 140, 46, -48)
      safe(b, 180, 50, 0)
      break
    }
    case 'split': {
      tag(b, 'split')
      safe(b, 200, 0, 0)
      const a = safe(b, 180, 100, 20)
      safe(b, 180, 110, 30)
      safe(b, 200, 100, 0)
      const e1 = above(b, a, -160, 0.2, 100, 'normal')
      const e2 = above(b, a, -170, 1.15, 100, 'super')
      pickup(b, 'gem', e1.x + e1.w / 2, e1.y - 34, 100)
      pickup(b, 'echo', e2.x + e2.w / 2, e2.y - 34, 1)
      break
    }
    case 'pads': {
      safe(b, 150, 0, 0)
      safe(b, 120, 68, 0)
      safe(b, 110, 62, 0)
      safe(b, 110, 62, 0)
      safe(b, 160, 58, 0)
      break
    }
    case 'ice': {
      tag(b, 'ice')
      safe(b, 200, 0, 0)
      safe(b, 340, 70, 0, 'ice')
      safe(b, 300, 40, 0)
      safe(b, 200, 130, 0)
      break
    }
    case 'super': {
      safe(b, 200, 0, 0, 'super')
      safe(b, 180, 120, -90)
      safe(b, 200, 100, 0)
      break
    }
    case 'hop': {
      const a = safe(b, 220, 0, 0)
      const pad = safe(b, 360, 90, 0)
      safe(b, 200, 100, 0)
      enemy(b, 'hopper', pad.x + pad.w / 2, pad.y - 18, Math.min(48, pad.w * 0.16))
      pickup(b, 'gem', a.x + a.w * 0.7, a.y - 40, 40)
      break
    }
    case 'wisp': {
      const a = safe(b, 200, 0, 0)
      const c = safe(b, 200, 90, 0)
      safe(b, 200, 80, 0)
      const gx = (a.x + a.w + c.x) / 2
      enemy(b, 'wisp', gx, a.y - 120, 36)
      break
    }
    case 'chasm': {
      safe(b, 200, 0, 0)
      const a = safe(b, 160, 90, 0)
      safe(b, 150, 100, 10)
      safe(b, 150, 90, 0)
      safe(b, 200, 80, 0)
      const e = above(b, a, -180, 0.8, 90, 'super')
      above(b, a, -200, 1.8, 90, 'normal')
      pickup(b, 'gem', e.x + 20, e.y - 36, 120)
      break
    }
    case 'shrine': {
      const a = safe(b, 260, 0, 0)
      const bpad = safe(b, 280, 60, 0)
      safe(b, 220, 60, 0)
      pickup(b, 'fragment', bpad.x + bpad.w / 2, bpad.y - 48, 1)
      b.signs.push({ x: a.x + 20, y: a.y - 92, text: 'An echo was left here' })
      b.setpiece = 'shrine'
      break
    }
    case 'belt': {
      tag(b, 'conveyor')
      safe(b, 180, 0, 0)
      safe(b, 280, 70, 0, 'conveyor', { conveyor: 180 })
      safe(b, 300, 50, 0)
      safe(b, 200, 120, 0)
      break
    }
    case 'crusher': {
      tag(b, 'crusher')
      safe(b, 180, 0, 0)
      const pad = safe(b, 460, 70, 0)
      safe(b, 200, 80, 0)
      hazard(b, 'crusher', pad.x + pad.w * 0.48, pad.y - 210, 130, 36, { freq: 0.42, amp: 168, phase: 0.1 })
      b.signs.push({ x: pad.x + 16, y: pad.y - 78, text: 'Wait, then cross' })
      break
    }
    case 'pipes': {
      tag(b, 'wall')
      const a = safe(b, 200, 0, 0)
      safe(b, 180, 90, 0)
      const c = safe(b, 200, 100, 0)
      wall(b, a.x + a.w + 20, a.y - 200, 200)
      wall(b, c.x - 10, c.y - 180, 180)
      const bonus = above(b, a, -150, 1.1, 80, 'normal')
      pickup(b, 'echo', bonus.x + bonus.w / 2, bonus.y - 30, 1)
      break
    }
    case 'pistons': {
      safe(b, 180, 0, 0)
      safe(b, 160, 80, 0, 'moving', { amp: 42, freq: 1.05, axis: 'y' })
      safe(b, 160, 70, 0, 'moving', { amp: 36, freq: 1.2, axis: 'x' })
      safe(b, 200, 70, 0)
      break
    }
    case 'pursuit': {
      tag(b, 'pursuit')
      const a = safe(b, 240, 0, 0)
      safe(b, 220, 70, 0)
      safe(b, 220, 70, 0)
      safe(b, 240, 70, 0)
      const span = b.cursor
      hazard(b, 'sweep', b.originX - 40, b.floorY - 800, 36, 1200, { phase: 0, speed: 210, amp: span })
      b.signs.push({ x: a.x + 10, y: a.y - 86, text: 'Keep moving' })
      b.setpiece = 'pursuit'
      break
    }
    case 'clouds': {
      safe(b, 200, 0, 0, 'cloud')
      safe(b, 180, 110, -30, 'cloud')
      safe(b, 180, 100, 0, 'cloud')
      safe(b, 200, 80, 0)
      break
    }
    case 'updraft': {
      const a = safe(b, 200, 0, 0)
      safe(b, 180, 120, 0)
      safe(b, 200, 80, 0)
      zone(b, 'updraft', a.x + a.w, a.y - 260, 140, 250, 0, -900)
      const e = above(b, a, -190, 1.05, 90, 'cloud')
      pickup(b, 'gem', e.x + e.w / 2, e.y - 30, 90)
      tag(b, 'wind')
      break
    }
    case 'wind': {
      tag(b, 'wind')
      const a = safe(b, 180, 0, 0)
      const wide = safe(b, 420, 60, 0)
      safe(b, 200, 80, 0)
      zone(b, 'wind', wide.x, wide.y - 200, wide.w, 220, -220, 0)
      b.signs.push({ x: a.x, y: a.y - 74, text: 'Headwind' })
      break
    }
    case 'islands': {
      safe(b, 170, 0, 0, 'cloud')
      safe(b, 140, 130, -60, 'cloud')
      safe(b, 140, 120, 20, 'cloud')
      safe(b, 180, 100, 0)
      break
    }
    case 'lasers': {
      tag(b, 'laser')
      const a = safe(b, 210, 0, 0)
      const c = safe(b, 210, 150, 0)
      safe(b, 200, 70, 0)
      hazard(b, 'laser', a.x + a.w + 42, a.y - 280, 16, 270, { freq: 1.7, phase: 0 })
      b.signs.push({ x: a.x + 20, y: a.y - 74, text: 'Cross on the quiet' })
      void c
      break
    }
    case 'traffic': {
      safe(b, 160, 0, 0)
      safe(b, 150, 70, 0, 'moving', { amp: 40, freq: 1.1, axis: 'x' })
      safe(b, 150, 60, 0, 'moving', { amp: 34, freq: 1.35, axis: 'y' })
      safe(b, 190, 70, 0)
      break
    }
    case 'rails': {
      tag(b, 'conveyor')
      safe(b, 160, 0, 0, 'conveyor', { conveyor: 220 })
      safe(b, 200, 60, 0, 'ice')
      safe(b, 280, 40, 0)
      safe(b, 180, 120, 0)
      break
    }
    case 'shard': {
      safe(b, 200, 0, 0)
      const a = safe(b, 180, 110, 0)
      safe(b, 200, 100, 0)
      const e = above(b, a, -150, 1.2, 120, 'normal')
      enemy(b, 'shard', e.x + e.w - 16, e.y - 20, 0)
      pickup(b, 'gem', e.x + 24, e.y - 32, 110)
      break
    }
    case 'walls': {
      tag(b, 'wall')
      const a = safe(b, 180, 0, 0)
      safe(b, 160, 80, 0)
      const c = safe(b, 180, 90, 0)
      wall(b, a.x + a.w + 8, a.y - 230, 250)
      wall(b, c.x - 36, c.y - 210, 230)
      above(b, a, -160, 0.9, 70, 'normal')
      break
    }
    case 'zigzag': {
      tag(b, 'wall')
      const a = safe(b, 170, 0, 0)
      const c = safe(b, 170, 100, 0)
      safe(b, 180, 90, 0)
      wall(b, a.x + a.w + 30, a.y - 160, 160)
      wall(b, c.x + c.w + 20, c.y - 150, 150)
      break
    }
    case 'collapse': {
      tag(b, 'collapse')
      safe(b, 180, 0, 0)
      safe(b, 240, 80, 0, 'collapsing')
      safe(b, 200, 90, 0)
      safe(b, 180, 70, 0)
      break
    }
    case 'lava': {
      safe(b, 180, 0, 0)
      const a = safe(b, 160, 120, 0)
      const c = safe(b, 170, 130, 0)
      safe(b, 190, 70, 0)
      hazard(b, 'lava', a.x + a.w, a.y + 48, Math.max(20, c.x - (a.x + a.w)), 28)
      break
    }
    case 'launch': {
      tag(b, 'launch')
      safe(b, 200, 0, 0, 'launch')
      safe(b, 280, 150, 0)
      safe(b, 200, 70, 0)
      break
    }
    case 'grav': {
      tag(b, 'gravity')
      const a = safe(b, 200, 0, 0)
      const wide = safe(b, 360, 70, 0)
      safe(b, 200, 70, 0)
      zone(b, 'lowgrav', wide.x, wide.y - 240, wide.w, 260, 0, 0, 0.62)
      b.signs.push({ x: a.x, y: a.y - 74, text: 'Light gravity' })
      break
    }
    case 'flip': {
      tag(b, 'gravity')
      const a = safe(b, 200, 0, 0)
      safe(b, 180, 90, 0)
      safe(b, 200, 80, 0)
      const ceil = above(b, a, -250, 1.3, 160, 'normal')
      zone(b, 'flipgrav', ceil.x - 20, ceil.y - 20, ceil.w + 80, 230)
      pickup(b, 'echo', ceil.x + ceil.w / 2, ceil.y + 46, 1)
      b.signs.push({ x: a.x, y: a.y - 74, text: 'Violet band flips down' })
      break
    }
    case 'lowgrav': {
      tag(b, 'gravity')
      safe(b, 180, 0, 0)
      const a = safe(b, 200, 80, 0)
      safe(b, 180, 140, -40)
      safe(b, 200, 80, 0)
      zone(b, 'lowgrav', a.x, a.y - 300, 520, 320, 0, 0, 0.7)
      break
    }
    case 'bumper': {
      safe(b, 180, 0, 0)
      safe(b, 110, 70, 0, 'bumper', { bumperAngle: -1.05 })
      safe(b, 240, 80, -20)
      safe(b, 200, 80, 0)
      break
    }
    default: {
      safe(b, 220, 0, 0)
      safe(b, 200, 80, 0)
      safe(b, 220, 80, 0)
    }
  }
  // Pursuit sweep phase is the world's time when the chunk is entered, set later.
  close(b)
  if (id === 'pursuit') {
    const sweep = b.hazards.find((h) => h.kind === 'sweep')
    if (sweep) {
      sweep.x = b.originX - 36
      sweep.amp = b.cursor + 80
      sweep.phase = -1
      sweep.speed = 200
      sweep.y = b.floorY - 900
      sweep.h = 1400
    }
  }
  if (!['tutorial0', 'tutorial1', 'tutorial2', 'bridge', 'shrine', 'pursuit'].includes(id)) pits(b)
}

export function validateChunk(chunk: Chunk, mode: Difficulty): string | null {
  const pads = chunk.platforms
    .filter((p) => p.route === 'safe' && p.kind !== 'wall')
    .sort((a, c) => a.x - c.x || a.y - c.y)
  if (pads.length < 2) return 'safe chain too short'
  if (pads[0].x > chunk.x + 8) return 'safe chain does not cover the entrance'
  if (Math.abs(pads[0].y - chunk.floorY) > 8) return 'entrance height broken'
  const last = pads[pads.length - 1]
  if (last.x + last.w < chunk.x + chunk.w - 8) return 'safe chain does not cover the exit'
  if (Math.abs(last.y - chunk.floorY) > 28 && Math.abs(last.y - chunk.exitY) > 8) return 'exit height broken'
  for (let i = 0; i < pads.length - 1; i++) {
    const a = pads[i]
    const c = pads[i + 1]
    const travel = a.kind === 'moving' && a.axis === 'x' ? a.amp : 0
    const travelB = c.kind === 'moving' && c.axis === 'x' ? c.amp : 0
    const gap = c.x - (a.x + a.w) + travel + travelB
    const limit = gapLimitFrom(a.kind, mode, travel + travelB)
    if (gap > limit + 1.5) return `gap ${gap.toFixed(1)} > ${limit.toFixed(1)} after ${a.kind}`
    const rise = a.y - c.y
    const riseMax = safeRiseLimit(a.kind, mode) + 1.5
    if (rise > riseMax) return `rise ${rise.toFixed(1)} > ${riseMax.toFixed(1)}`
  }
  return null
}

function gapLimitFrom(kind: PlatformKind, mode: Difficulty, amp: number): number {
  let limit = safeGapLimit(mode)
  if (kind === 'launch') limit *= 1.32
  else if (kind === 'super') limit *= 1.12
  return Math.max(36, limit)
  void amp
}

function difficultyFor(sim: Sim, meter: number, index: number): number {
  if (sim.config.tutorial && index < 3) return 0
  const base = Math.min(1, meter / 4600)
  const wave = 0.5 + 0.5 * Math.sin(index * 0.85)
  let d = (base * 0.72 + wave * 0.38) * MODE[sim.config.difficulty].diff
  if (index % 6 === 4) d *= 0.34
  const open = liveUnlocks(sim).length
  if (open <= 1) d = Math.min(d, 0.4)
  if (sim.relief > 0) d *= 0.38
  return Math.max(0, Math.min(1, d))
}

export function liveUnlocks(sim: Sim): BiomeId[] {
  return unlockedBiomes({
    distance: Math.max(sim.config.bestDistance, sim.distance),
    perfects: sim.config.lifetimePerfects + sim.stats.perfects,
    walls: sim.config.lifetimeWalls + sim.stats.walls,
    runWalls: sim.stats.walls,
    chain: Math.max(sim.config.bestChain, sim.chain),
    fragments: sim.config.fragments + sim.fragments.length,
    visited: sim.visited,
    gravity: sim.config.gravityAbility,
  })
}

function allowed(id: string, meter: number, index: number): boolean {
  if (index < 4 && !['straight', 'gaps', 'tutorial0', 'tutorial1', 'tutorial2'].includes(id)) return false
  if (meter < 220 && ['ice', 'walls', 'zigzag', 'chasm', 'pursuit', 'crusher', 'lasers', 'collapse', 'flip'].includes(id)) return false
  return true
}

function pickModule(sim: Sim, meter: number, index: number, biome: BiomeId): string {
  if (sim.config.tutorial && biome === 'meadow' && index === 0) return 'tutorial0'
  if (sim.config.tutorial && biome === 'meadow' && index === 1) return 'tutorial1'
  if (sim.config.tutorial && biome === 'meadow' && index === 2) return 'tutorial2'
  const recent = sim.recentModules
  let pool = POOLS[biome].filter((id) => !recent.includes(id) && allowed(id, meter, index))
  if (!pool.length) pool = ['straight', 'gaps']
  if (meter > 280 && sim.worldRng.chance(0.055) && !recent.includes('shrine') && biome !== 'inferno') return 'shrine'
  return sim.worldRng.pick(pool)
}

function planTransition(sim: Sim, meter: number): { kind: 'none' } | { kind: 'auto'; biome: BiomeId } | { kind: 'choice'; options: BiomeId[] } {
  if (meter < 500) return { kind: 'none' }
  const open = liveUnlocks(sim)
  const fresh = open.filter((b) => b !== 'meadow' && !sim.visited.includes(b))
  if (fresh.length) return { kind: 'auto', biome: fresh[0] }
  if (open.length >= 3 && sim.segment % 2 === 0) {
    const others = open.filter((b) => b !== sim.biome)
    const pick: BiomeId[] = [sim.biome]
    const bag = [...others]
    while (pick.length < 3 && bag.length) {
      const i = Math.floor(sim.worldRng.next() * bag.length)
      pick.push(bag.splice(i, 1)[0])
    }
    if (pick.length >= 2) return { kind: 'choice', options: pick }
  }
  return { kind: 'none' }
}

function pushRecent(sim: Sim, id: string) {
  sim.recentModules.push(id)
  if (sim.recentModules.length > 4) sim.recentModules.shift()
}

function build(sim: Sim, moduleId: string, originX: number, floorY: number, index: number, biome: BiomeId, difficulty: number): Chunk {
  const b = createBuilder(sim, originX, floorY, difficulty)
  author(moduleId, b)
  if (moduleId === 'pursuit') {
    const sweep = b.hazards.find((h) => h.kind === 'sweep')
    if (sweep) sweep.phase = -1 // armed when the player enters
  }
  const chunk = finish(b, index, biome, moduleId, difficulty)
  const problem = validateChunk(chunk, sim.config.difficulty)
  if (problem && moduleId !== 'straight') {
    sim.fallbacks++
    const retry = createBuilder(sim, originX, floorY, 0)
    author('straight', retry)
    const safeChunk = finish(retry, index, biome, 'straight', 0)
    safeChunk.tags = ['recovered']
    return safeChunk
  }
  return chunk
}

export function appendChunk(sim: Sim): Chunk | null {
  if (sim.config.practice) {
    if (sim.chunks.length) return null
    const yard = buildPractice(sim)
    sim.chunks.push(yard)
    sim.serial++
    return yard
  }
  if (sim.pendingFork || sim.choice) return null

  const prev = sim.chunks[sim.chunks.length - 1]
  const originX = prev ? prev.x + prev.w - 22 : 0
  const floorY = prev ? prev.exitY : 0
  const index = sim.serial++
  const meter = Math.max(0, (originX - sim.startX) / PX_PER_METER)
  const seg = Math.floor(meter / TUNE.segment)

  if (prev && seg > sim.segment && meter > 480 && !(sim.config.tutorial && index < 3)) {
    sim.segment = seg
    const plan = planTransition(sim, meter)
    if (plan.kind === 'auto') {
      const chunk = build(sim, 'bridge', originX, floorY, index, sim.biome, 0.08)
      enterBiome(sim, plan.biome)
      pushRecent(sim, 'bridge')
      sim.chunks.push(chunk)
      return chunk
    }
    if (plan.kind === 'choice') {
      const chunk = build(sim, 'bridge', originX, floorY, index, sim.biome, 0.08)
      sim.pendingFork = plan.options
      sim.forkX = chunk.x + 160
      pushRecent(sim, 'bridge')
      sim.chunks.push(chunk)
      return chunk
    }
  }

  const difficulty = difficultyFor(sim, meter, index)
  let moduleId = pickModule(sim, meter, index, sim.biome)
  if (sim.relief > 0 && index > 2) {
    moduleId = 'straight'
    sim.relief--
  }
  const chunk = build(sim, moduleId, originX, floorY, index, sim.biome, sim.relief > 0 ? Math.min(difficulty, 0.2) : difficulty)
  pushRecent(sim, chunk.moduleId)
  sim.chunks.push(chunk)
  return chunk
}

function enterBiome(sim: Sim, biome: BiomeId) {
  if (sim.biome === biome) return
  sim.biome = biome
  if (!sim.visited.includes(biome)) sim.visited.push(biome)
  sim.events.push({ type: 'biome', biome })
  sim.events.push({ type: 'banner', text: BIOME_COPY[biome].name, sub: BIOME_COPY[biome].enter })
}

export function buildPractice(sim: Sim): Chunk {
  const b = createBuilder(sim, 0, 0, 0)
  tag(b, 'steer')
  const a = safe(b, 280, 0, 0)
  b.signs.push({ x: a.x + 20, y: a.y - 80, text: 'Practice yard · fall and you return' })
  safe(b, 180, 100, -70)
  safe(b, 180, 90, 0)
  const ice = safe(b, 260, 70, 0, 'ice')
  b.signs.push({ x: ice.x, y: ice.y - 70, text: 'Ice' })
  safe(b, 240, 40, 0)
  const pad = safe(b, 320, 80, 0)
  enemy(b, 'hopper', pad.x + pad.w / 2, pad.y - 18, 40)
  b.signs.push({ x: pad.x, y: pad.y - 70, text: 'Bounce the hopper' })
  const w1 = safe(b, 180, 80, 0)
  wall(b, w1.x + w1.w + 16, w1.y - 200, 210)
  safe(b, 180, 70, 0)
  safe(b, 160, 80, 0, 'super')
  safe(b, 200, 100, -60)
  const end = safe(b, 240, 80, 0)
  pickup(b, 'loop', end.x + end.w / 2, end.y - 40, 1)
  b.signs.push({ x: end.x, y: end.y - 70, text: 'Touch to loop' })
  close(b)
  const chunk = finish(b, 0, 'meadow', 'practice', 0)
  const problem = validateChunk(chunk, 'relaxed')
  if (problem) {
    const retry = createBuilder(sim, 0, 0, 0)
    author('straight', retry)
    return finish(retry, 0, 'meadow', 'practice', 0)
  }
  return chunk
}

export function ensureChunks(sim: Sim, ahead = 2400) {
  let guard = 0
  while (guard++ < 8) {
    const last = sim.chunks[sim.chunks.length - 1]
    const cover = last ? last.x + last.w : 0
    if (cover > sim.ball.x + ahead) break
    if (sim.pendingFork || sim.choice) break
    if (!appendChunk(sim)) break
  }
  const keep = sim.ball.x - 900
  if (sim.chunks.length > 3 && sim.chunks[0].x + sim.chunks[0].w < keep) {
    sim.chunks = sim.chunks.filter((c) => c.x + c.w >= keep)
  }
}

export function chunkUnder(sim: Sim, x: number): Chunk | null {
  for (let i = sim.chunks.length - 1; i >= 0; i--) {
    const c = sim.chunks[i]
    if (x >= c.x - 40 && x <= c.x + c.w + 40) return c
  }
  return sim.chunks[sim.chunks.length - 1] ?? null
}

export function noteFor(tagName: string): string | undefined {
  return LESSONS[tagName]
}

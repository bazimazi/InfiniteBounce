import { clamp } from '../core/math'
import { FRAGMENTS } from '../content/catalog'
import { TUNE } from '../content/tune'
import { biomeChoice, rollUpgradeChoice } from './choices'
import { chunkUnder, ensureChunks, noteFor } from './generator'
import {
  crusherAmount,
  detectContact,
  distPointRect,
  laserHot,
  platformRect,
  platformVelocity,
  sweepX,
  type Contact,
} from './geom'
import { PX_PER_METER, type DeathId, type Enemy, type InputFrame, type PlatformKind, type Sim } from './types'

interface Mat {
  bounce: number
  min: number
  max: number
  keep: number
}

function material(kind: PlatformKind): Mat {
  switch (kind) {
    case 'super':
      return { bounce: 1.16, min: 1.08, max: 1.12, keep: 0.996 }
    case 'weak':
      return { bounce: 0.58, min: 0.66, max: 0.75, keep: 0.98 }
    case 'sticky':
      return { bounce: 0.4, min: 0.45, max: 0.55, keep: 0.62 }
    case 'ice':
      return { bounce: 0.9, min: 0.92, max: 1, keep: 1 }
    case 'cloud':
      return { bounce: 0.84, min: 0.88, max: 0.96, keep: 0.99 }
    case 'launch':
      return { bounce: 1, min: 1.18, max: 1.22, keep: 1 }
    case 'bumper':
      return { bounce: 0.72, min: 0.85, max: 1, keep: 0.95 }
    default:
      return { bounce: 1, min: 1, max: 1, keep: 0.993 }
  }
}

function mult(sim: Sim): number {
  return Math.min(3, 1 + sim.chain * 0.05) * sim.mods.score
}

function skill(sim: Sim) {
  sim.chain += 1
  sim.flowIdle = 0
  sim.flow = Math.min(100, sim.flow + 15)
  if (sim.chain > sim.stats.maxChain) sim.stats.maxChain = sim.chain
  const marks = [8, 16, 28, 42]
  for (const m of marks) {
    if (sim.chain >= m && sim.milestoneChain < m) {
      sim.milestoneChain = m
      sim.hitstop = Math.max(sim.hitstop, 0.028)
      sim.events.push({ type: 'flow', chain: Math.floor(sim.chain) })
      sim.events.push({ type: 'banner', text: `Flow ${Math.floor(sim.chain)}` })
    }
  }
}

function flavor(sim: Sim, id: DeathId): DeathId {
  if (id !== 'FALLEN') return id
  const speed = Math.abs(sim.ball.vx)
  const maxV = TUNE.maxVx * sim.mods.maxVx
  if (speed > maxV * 0.8) return 'OVERSPEED'
  if (speed < 140 && sim.lowSpeedTime > 0.45) return 'LOST'
  return 'FALLEN'
}

function gSignOf(g: number): number {
  return g >= 0 ? 1 : -1
}

function respawn(sim: Sim) {
  const floor = sim.chunks[0]?.floorY ?? 0
  sim.ball.x = sim.startX + 40
  sim.ball.y = floor - 78
  sim.ball.vx = 180
  sim.ball.vy = -360
  sim.invuln = 0.7
  sim.stuck = 0
  sim.events.push({ type: 'respawn' })
}

function lethal(sim: Sim, id: DeathId, gSign: number) {
  if (sim.dead || sim.grace > 0 || sim.invuln > 0) return
  const hazard = id === 'SPIKES' || id === 'COLLISION' || id === 'CRUSHED' || id === 'LASER' || id === 'LAVA' || id === 'SWEEP'
  if (hazard && sim.shield > 0) {
    sim.shield -= 1
    sim.invuln = 0.95
    sim.ball.vy = -gSign * TUNE.minBounce * 0.85
    sim.ball.vx *= 0.45
    sim.events.push({ type: 'shield', x: sim.ball.x, y: sim.ball.y })
    return
  }
  if (sim.config.practice) {
    respawn(sim)
    return
  }
  sim.dead = true
  sim.death = flavor(sim, id)
  sim.events.push({ type: 'death', id: sim.death, x: sim.ball.x, y: sim.ball.y })
}

function tryDash(sim: Sim, input: InputFrame, gSign: number) {
  if (sim.dashCharges <= 0 || sim.dashCd > 0) return
  const b = sim.ball
  sim.dashCharges -= 1
  sim.dashCd = TUNE.dashCd * sim.mods.dashCd
  const dirX = Math.abs(input.x) > 0.16 ? Math.sign(input.x) : Math.sign(b.vx || 1)
  const dirY = input.y < -0.45 ? -1 : 0
  const imp = TUNE.dashImpulse * sim.mods.dashImpulse
  b.vx += dirX * imp
  if (dirY < 0) b.vy += -gSign * (TUNE.dashUp + imp * 0.25)
  if (sim.config.core === 'volatile') b.vy += -gSign * 140
  const cap = TUNE.maxVx * sim.mods.maxVx * 1.12
  if (Math.abs(b.vx) > cap) b.vx = Math.sign(b.vx) * cap
  sim.dashTimer = TUNE.dashTime
  sim.stats.dashes += 1
  sim.events.push({ type: 'dash', x: b.x, y: b.y })
}

function tryGrav(sim: Sim) {
  if (!sim.config.gravityAbility) return
  if (sim.gravCd > 0 || sim.gravTimer > 0) return
  sim.gravTimer = 3.1
  sim.gravCd = 7.4
  sim.events.push({ type: 'banner', text: 'Gravity flips' })
}

function placeEnemy(e: Enemy, time: number) {
  if (e.kind === 'hopper') {
    e.x = e.originX + Math.sin(time * e.freq + e.phase) * e.amp
    e.y = e.originY + Math.abs(Math.sin(time * 6 + e.phase)) * -3
  } else if (e.kind === 'wisp') {
    e.x = e.originX + Math.sin(time * e.freq + e.phase) * e.amp
    e.y = e.originY + Math.sin(time * e.freq * 1.4 + e.phase) * 18
  } else {
    e.x = e.originX + Math.sin(time * 0.7 + e.phase) * e.amp
    e.y = e.originY
  }
}

function gravityAt(sim: Sim): number {
  let g = TUNE.gravity * sim.mods.gravity
  const b = sim.ball
  for (const chunk of sim.chunks) {
    if (chunk.x > b.x + 200 || chunk.x + chunk.w < b.x - 200) continue
    for (const z of chunk.zones) {
      if (b.x < z.x || b.x > z.x + z.w || b.y < z.y || b.y > z.y + z.h) continue
      if (z.kind === 'lowgrav') g *= z.gravMul
      if (z.kind === 'flipgrav') g *= -1
    }
  }
  if (sim.gravTimer > 0) g *= -1
  return g
}

function zoneAccel(sim: Sim): { x: number; y: number } {
  let x = sim.config.mutator === 'tailwind' ? 78 : 0
  let y = 0
  const b = sim.ball
  for (const chunk of sim.chunks) {
    if (chunk.x > b.x + 240 || chunk.x + chunk.w < b.x - 240) continue
    for (const z of chunk.zones) {
      if (b.x < z.x || b.x > z.x + z.w || b.y < z.y || b.y > z.y + z.h) continue
      if (z.kind === 'wind') x += z.vx
      if (z.kind === 'updraft') y += z.vy
      if (z.kind === 'glide' && Math.abs(b.vx) > 300) x += (280 * Math.sign(b.vx) - b.vx) * 1.6
    }
    for (const p of chunk.platforms) {
      if (p.kind !== 'magnetic') continue
      const rect = platformRect(p, sim.time)
      const dx = rect.x + rect.w / 2 - b.x
      const dy = rect.y - b.y
      const d = Math.hypot(dx, dy)
      if (d < 160 && d > 10) {
        const pull = 480 * (0.4 + sim.mods.magnet)
        x += (dx / d) * pull
        y += (dy / d) * pull
      }
    }
  }
  return { x, y }
}

function applyFloor(sim: Sim, c: Contact, input: InputFrame, gSign: number, dt: number) {
  const b = sim.ball
  const p = c.platform
  const rect = c.rect
  b.y = gSign > 0 ? rect.y - b.r - 0.2 : rect.y + rect.h + b.r + 0.2
  const impact = Math.abs(b.vy)
  const mat = material(p.kind)
  const minB = TUNE.minBounce * mat.min * sim.mods.minBounce
  const maxB = TUNE.maxBounce * mat.max * sim.mods.maxBounce
  let out = impact * TUNE.restitution * mat.bounce * sim.mods.bounce
  if (input.brake && p.kind !== 'launch') out *= 0.86
  if (p.kind === 'launch') out = maxB
  out = clamp(out, minB, maxB)
  b.vy = -gSign * out
  const pv = platformVelocity(p, sim.time, dt)
  b.vx += clamp(pv.x, -360, 360)
  b.vy += clamp(pv.y, -280, 280) * 0.25
  if (p.kind === 'conveyor') b.vx += p.conveyor
  if (p.kind === 'bumper') {
    b.vx += Math.cos(p.bumperAngle) * 560
    b.vy += Math.sin(p.bumperAngle) * 640
  }
  b.vx *= mat.keep * sim.mods.frictionKeep
  if (p.kind === 'sticky') b.vx *= 0.55
  const kick = p.kind === 'ice' ? TUNE.bounceKick * 0.32 : TUNE.bounceKick
  if (!input.brake) b.vx += input.x * kick * sim.mods.accel
  const cap = TUNE.maxVx * sim.mods.maxVx
  if (Math.abs(b.vx) > cap) b.vx = Math.sign(b.vx) * cap
  if (Math.abs(b.vy) > maxB * 1.25) b.vy = Math.sign(b.vy) * maxB * 1.25

  if (p.kind === 'collapsing' && p.touchedAt <= 0) {
    p.touchedAt = sim.time
    p.fallY = p.y
  }
  p.flash = 1
  b.squash = 1
  b.lastBounce = sim.time
  b.surface = p.kind
  sim.stats.bounces += 1

  const center = rect.x + rect.w / 2
  const window = clamp(rect.w * 0.16, 18, 44)
  const centered = Math.abs(b.x - center) <= window
  const perfect =
    centered &&
    impact > 360 &&
    impact < 1600 &&
    !input.brake &&
    p.kind !== 'sticky' &&
    p.kind !== 'weak' &&
    p.route !== 'expert'
  const fast = Math.abs(b.vx) > 620 && centered
  if (perfect) {
    sim.stats.perfects += 1
    sim.score += 28 * mult(sim)
    skill(sim)
    sim.hitstop = Math.max(sim.hitstop, 0.034)
  } else if (p.route === 'expert' || fast) {
    if (fast && sim.mods.heavyLanding) sim.score += 36 * mult(sim)
    skill(sim)
  }
  sim.events.push({
    type: 'bounce',
    x: b.x,
    y: rect.y,
    perfect,
    fast,
    kind: p.kind,
    speed: Math.abs(b.vx),
  })
}

function applyWall(sim: Sim, c: Contact, input: InputFrame, gSign: number) {
  const b = sim.ball
  const incoming = b.vx
  b.x += c.nx * (Math.abs(c.pen) + 0.75)
  const skirt =
    c.platform.kind !== 'wall' &&
    c.platform.h < 48 &&
    ((gSign > 0 && b.y > c.rect.y + 8) || (gSign < 0 && b.y < c.rect.y + c.rect.h - 8))
  if (skirt) {
    b.vx = c.nx * 36
    return
  }
  const intoWall = c.nx !== 0 && Math.sign(incoming) === -Math.sign(c.nx)
  if (!intoWall) return
  const skilled = Math.abs(incoming) > 220 && input.x !== 0 && Math.sign(input.x) === Math.sign(incoming)
  const rest = TUNE.wallRestitution * sim.mods.wall * (skilled ? 1.07 : 1)
  b.vx = -incoming * rest + c.nx * (skilled ? TUNE.wallSkill + sim.mods.wallPop * 0.15 : 16)
  if (skilled) {
    b.vy += -gSign * (TUNE.wallPop * 0.45 + sim.mods.wallPop * 0.15)
    sim.stats.walls += 1
    skill(sim)
    sim.hitstop = Math.max(sim.hitstop, 0.02)
  }
  b.squash = 0.7
  b.state = 'WALL'
  c.platform.flash = 1
  sim.events.push({ type: 'wall', x: b.x, y: b.y, skill: skilled })
}

function applyCeil(sim: Sim, c: Contact) {
  const b = sim.ball
  b.y += c.ny * (Math.abs(c.pen) + 0.5)
  b.vy *= -0.28
}

function collide(sim: Sim, input: InputFrame, gSign: number, dt: number) {
  const b = sim.ball
  let floor: Contact | null = null
  let wall: Contact | null = null
  let ceil: Contact | null = null
  for (const chunk of sim.chunks) {
    if (chunk.x > b.x + 360 || chunk.x + chunk.w < b.x - 360) continue
    for (const p of chunk.platforms) {
      if (p.collapsed && p.fallY > p.y + 240) continue
      const rect = platformRect(p, sim.time)
      const hit = detectContact(b.x, b.y, b.px, b.py, b.r, b.vx, b.vy, p, rect, gSign)
      if (!hit) continue
      if (hit.face === 'floor') {
        if (!floor || hit.pen > floor.pen) floor = hit
      } else if (hit.face === 'wall') {
        if (!wall || hit.pen > wall.pen) wall = hit
      } else if (!ceil || hit.pen > ceil.pen) ceil = hit
    }
  }
  if (floor) applyFloor(sim, floor, input, gSign, dt)
  else if (ceil) applyCeil(sim, ceil)
  if (wall && (!floor || wall.platform.id !== floor.platform.id)) applyWall(sim, wall, input, gSign)
}

function enemies(sim: Sim, input: InputFrame, gSign: number) {
  const b = sim.ball
  for (const chunk of sim.chunks) {
    if (chunk.x > b.x + 300 || chunk.x + chunk.w < b.x - 300) continue
    for (const e of chunk.enemies) {
      e.flash = Math.max(0, e.flash - TUNE.fixedDt * 3)
      e.cooldown = Math.max(0, e.cooldown - TUNE.fixedDt)
      placeEnemy(e, sim.time)
      const dx = b.x - e.x
      const dy = b.y - e.y
      const dist = Math.hypot(dx, dy) || 0.0001
      if (dist > b.r + e.r || e.cooldown > 0) continue
      if (e.kind === 'shard') {
        if (sim.dashTimer > 0 && sim.mods.phase) continue
        lethal(sim, 'COLLISION', gSign)
        return
      }
      let nx = dx / dist
      let ny = dy / dist
      if (gSign > 0) ny = Math.min(ny, -0.82)
      else ny = Math.max(ny, 0.82)
      const len = Math.hypot(nx, ny) || 1
      nx /= len
      ny /= len
      const launch = TUNE.minBounce * 0.92 * sim.mods.enemyBounce
      b.x = e.x + nx * (b.r + e.r + 1)
      b.y = e.y + ny * (b.r + e.r + 1)
      b.vx = nx * Math.max(200, Math.abs(b.vx) * 0.85) + input.x * 140
      b.vy = ny * launch
      e.cooldown = 0.26
      e.flash = 1
      b.squash = 0.85
      b.lastBounce = sim.time
      sim.stats.enemies += 1
      sim.score += 20 * mult(sim)
      skill(sim)
      if (sim.mods.enemyDash && sim.dashCd > 0) sim.dashCd = Math.max(0, sim.dashCd - 0.18)
      sim.events.push({ type: 'enemy', x: b.x, y: b.y, kind: e.kind })
    }
  }
}

function hazardRect(h: Sim['chunks'][number]['hazards'][number], time: number) {
  if (h.kind === 'crusher') {
    const u = crusherAmount(h, time)
    return { x: h.x, y: h.y + u * h.amp, w: h.w, h: h.h, hot: u > 0.62 }
  }
  if (h.kind === 'laser') return { x: h.x, y: h.y, w: h.w, h: h.h, hot: laserHot(h, time) }
  if (h.kind === 'sweep') return { x: sweepX(h, time), y: h.y, w: h.w, h: h.h, hot: h.phase > 0 && time >= h.phase }
  return { x: h.x, y: h.y, w: h.w, h: h.h, hot: true }
}

function hazards(sim: Sim, gSign: number) {
  const b = sim.ball
  const phased = sim.dashTimer > 0 && sim.mods.phase
  for (const chunk of sim.chunks) {
    if (chunk.x > b.x + 420 || chunk.x + chunk.w < b.x - 200) continue
    for (const h of chunk.hazards) {
      if (h.kind === 'sweep' && h.phase < 0 && b.x > chunk.x + 20) h.phase = sim.time + 1.2
      const rect = hazardRect(h, sim.time)
      if (h.kind === 'sweep') {
        if (!rect.hot || phased || sim.invuln > 0) continue
        if (b.x < rect.x && b.x > h.x && b.x < h.x + h.amp) {
          lethal(sim, 'SWEEP', gSign)
          return
        }
        continue
      }
      if (!rect.hot) continue
      const near = distPointRect(b.x, b.y, rect)
      if (near < TUNE.nearDist && near > 0.5 && !sim.closeCalls.includes(h.id) && !sim.resolvedMiss.includes(h.id)) {
        sim.closeCalls.push(h.id)
      }
      if (b.x > rect.x + rect.w + 20 && !sim.resolvedMiss.includes(h.id)) {
        if (sim.closeCalls.includes(h.id)) {
          sim.stats.nears += 1
          sim.score += 32 * sim.mods.near * mult(sim)
          skill(sim)
          sim.hitstop = Math.max(sim.hitstop, 0.02)
          sim.events.push({ type: 'nearmiss', x: b.x, y: b.y, threaded: sim.dashTimer > 0 })
        }
        sim.resolvedMiss.push(h.id)
      }
      if (phased || sim.invuln > 0 || sim.grace > 0) continue
      if (near <= b.r) {
        const id: DeathId = h.kind === 'laser' ? 'LASER' : h.kind === 'crusher' ? 'CRUSHED' : h.kind === 'lava' ? 'LAVA' : 'SPIKES'
        lethal(sim, id, gSign)
        return
      }
    }
  }
}

function collect(sim: Sim) {
  const b = sim.ball
  const reach = TUNE.pickupRadius + sim.mods.magnet * 22
  for (const chunk of sim.chunks) {
    for (const p of chunk.pickups) {
      if (p.taken) continue
      if (sim.mods.magnet > 0) {
        const dx = b.x - p.x
        const dy = b.y - p.y
        const d = Math.hypot(dx, dy)
        const pullR = 80 + sim.mods.magnet * 70
        if (d < pullR && d > 1) {
          p.x += (dx / d) * Math.min(d, 90 * TUNE.fixedDt * sim.mods.magnet * 3)
          p.y += (dy / d) * Math.min(d, 90 * TUNE.fixedDt * sim.mods.magnet * 3)
        }
      }
      if (Math.hypot(b.x - p.x, b.y - p.y) > reach) continue
      p.taken = true
      sim.stats.pickups += 1
      if (p.kind === 'gem') sim.score += p.value * mult(sim)
      else if (p.kind === 'echo') sim.echoes += p.value
      else if (p.kind === 'shield') sim.shield = Math.min(3, sim.shield + 1)
      else if (p.kind === 'dash') {
        if (sim.dashCharges < sim.mods.dashCharges) sim.dashCharges += 1
        else sim.dashCd = 0
      } else if (p.kind === 'fragment') {
        const id = sim.config.fragments + sim.fragments.length
        if (id < FRAGMENTS.length) {
          sim.fragments.push(id)
          sim.events.push({ type: 'banner', text: 'Fragment', sub: FRAGMENTS[id] })
        } else sim.echoes += 3
      } else if (p.kind === 'loop') {
        respawn(sim)
      }
      sim.events.push({ type: 'pickup', x: p.x, y: p.y, kind: p.kind, value: p.value })
    }
  }
}

function lessons(sim: Sim) {
  const chunk = chunkUnder(sim, sim.ball.x)
  if (!chunk || chunk.index === sim.insideChunk) return
  sim.insideChunk = chunk.index
  if (chunk.tags.includes('split')) sim.stats.sawSplit = true
  for (const t of chunk.tags) {
    if (sim.seen.includes(t)) continue
    sim.seen.push(t)
    const text = noteFor(t)
    if (text) sim.events.push({ type: 'banner', text })
  }
}

function offers(sim: Sim) {
  if (sim.choice || sim.config.practice) return
  if (sim.pendingFork && sim.ball.x >= sim.forkX) {
    sim.choice = biomeChoice(sim, sim.pendingFork)
    return
  }
  if (sim.distance >= sim.nextUpgradeAt && sim.time - sim.ball.lastBounce < TUNE.fixedDt * 1.5 && sim.distance > 240) {
    sim.nextUpgradeAt += 680
    sim.choice = rollUpgradeChoice(sim)
  }
}

export function fixedStep(sim: Sim, input: InputFrame) {
  if (sim.dead || sim.choice) return
  const dt = TUNE.fixedDt
  ensureChunks(sim)
  sim.time += dt
  sim.stats.time += dt
  sim.grace = Math.max(0, sim.grace - dt)
  sim.invuln = Math.max(0, sim.invuln - dt)
  sim.dashTimer = Math.max(0, sim.dashTimer - dt)
  sim.gravTimer = Math.max(0, sim.gravTimer - dt)
  if (sim.gravCd > 0) sim.gravCd = Math.max(0, sim.gravCd - dt)
  if (sim.dashCd > 0) {
    sim.dashCd = Math.max(0, sim.dashCd - dt)
    if (sim.dashCd === 0 && sim.dashCharges < sim.mods.dashCharges) {
      sim.dashCharges += 1
      if (sim.dashCharges < sim.mods.dashCharges) sim.dashCd = TUNE.dashCd * sim.mods.dashCd
    }
  }

  const b = sim.ball
  b.px = b.x
  b.py = b.y
  b.squash = Math.max(0, b.squash - dt * 6.5)
  b.spin += b.vx * dt * 0.012
  b.state = 'AIR'

  for (const chunk of sim.chunks) {
    for (const p of chunk.platforms) {
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 3.2)
      if (p.touchedAt > 0 && !p.collapsed && sim.time >= p.touchedAt + p.collapseDelay) {
        p.collapsed = true
        p.fallY = p.y
        p.fallV = 40
      }
      if (p.collapsed) {
        p.fallV += 1700 * dt
        p.fallY += p.fallV * dt
      }
    }
  }

  const g = gravityAt(sim)
  const gSign = gSignOf(g)
  if (input.dash && !sim.dashHeld) tryDash(sim, input, gSign)
  sim.dashHeld = input.dash
  if (input.grav && !sim.gravHeld) tryGrav(sim)
  sim.gravHeld = input.grav
  if (input.brake) sim.stats.braked = true
  if (Math.abs(input.x) > 0.18) sim.stats.steered = true

  const maxV = TUNE.maxVx * sim.mods.maxVx
  const speedNorm = clamp(Math.abs(b.vx) / maxV, 0, 1)
  const recent = sim.time - b.lastBounce < 0.11
  let accel = (recent ? TUNE.groundAccel : TUNE.airAccel) * sim.mods.accel
  if (!recent) accel *= sim.mods.air
  accel *= (1 - speedNorm * 0.42) * sim.mods.control
  if (input.x !== 0 && b.vx !== 0 && Math.sign(input.x) !== Math.sign(b.vx)) accel *= 1.22
  const icy = b.surface === 'ice' && sim.time - b.lastBounce < 0.22
  let ax = 0
  let ay = g
  if (input.brake) {
    const brake = (TUNE.brake + TUNE.brakeV * Math.abs(b.vx)) * sim.mods.brake * (recent ? 1 : TUNE.airBrake) * (icy ? 0.42 : 1)
    ax += -Math.sign(b.vx || 1) * brake
  } else if (input.x !== 0) {
    ax += input.x * accel
  }
  const z = zoneAccel(sim)
  ax += z.x
  ay += z.y
  const drag = recent ? TUNE.drag : TUNE.airDrag
  b.vx = (b.vx + ax * dt) * Math.exp(-drag * dt)
  b.vy += ay * dt
  const fallCap = TUNE.maxFall
  if (gSign > 0 && b.vy > fallCap) b.vy = fallCap
  if (gSign < 0 && b.vy < -fallCap) b.vy = -fallCap
  if (Math.abs(b.vx) > maxV) b.vx = Math.sign(b.vx) * maxV
  b.x += b.vx * dt
  b.y += b.vy * dt

  if (Math.abs(b.vx) < 14 && Math.abs(b.vy) < 14) sim.stuck += dt
  else sim.stuck = 0
  if (sim.stuck > 0.45) {
    b.vy = -gSign * TUNE.minBounce
    sim.stuck = 0
  }

  collide(sim, input, gSign, dt)
  if (!sim.dead) enemies(sim, input, gSign)
  if (!sim.dead) hazards(sim, gSign)
  if (!sim.dead) collect(sim)

  if (!sim.dead && sim.grace <= 0 && sim.invuln <= 0) {
    const chunk = chunkUnder(sim, b.x)
    const floor = chunk?.floorY ?? 0
    if (b.y > floor + TUNE.killDrop || b.y < floor - 980) lethal(sim, 'FALLEN', gSign)
  }
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) lethal(sim, 'FALLEN', gSign)

  const forward = Math.max(0, (b.x - sim.startX) / PX_PER_METER)
  const gained = forward - sim.distance
  if (gained > 0) {
    sim.score += gained * 10 * mult(sim)
    sim.distance = forward
    sim.stats.distance = forward
  }
  const mps = Math.abs(b.vx) / PX_PER_METER
  if (mps > sim.stats.maxSpeed) sim.stats.maxSpeed = mps
  if (mps < 3) sim.lowSpeedTime += dt
  else sim.lowSpeedTime = 0
  if (sim.distance > sim.personalBest && sim.personalBest > 40 && !sim.announcedRecord) {
    sim.announcedRecord = true
    sim.events.push({ type: 'record' })
    sim.events.push({ type: 'banner', text: 'New distance' })
  }

  sim.flowIdle += dt
  const grace = TUNE.chainGrace / sim.mods.flowDecay
  if (sim.flowIdle > grace && sim.chain > 0) {
    sim.chain = Math.max(0, sim.chain - dt * (0.7 + sim.chain * 0.12))
    sim.flow = Math.max(0, sim.flow - dt * 22)
  }

  const walled = (b.state as string) === 'WALL'
  if (sim.dashTimer > 0) b.state = 'DASH'
  else if (walled) b.state = 'WALL'
  else if (input.brake) b.state = 'BRAKE'
  else if (speedNorm > 0.82) b.state = 'CRITICAL'
  else if (speedNorm > 0.56) b.state = 'HIGH'
  else if (Math.abs(input.x) > 0.2) b.state = 'ACCEL'
  else if (recent) b.state = 'STABLE'
  else b.state = 'AIR'

  sim.ghostAcc += dt
  if (sim.ghostAcc >= 0.1) {
    sim.ghostAcc = 0
    if (sim.ghost.length < 2400) sim.ghost.push({ t: sim.stats.time, x: b.x, y: b.y })
  }

  if (!sim.dead) {
    lessons(sim)
    offers(sim)
  }
}

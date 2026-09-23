import { clamp } from '../core/math'
import { platformRect } from './geom'
import type { InputFrame, Sim } from './types'

/**
 * Cruises the safe route at a readable speed.
 * It does not dash. Survival here means the safe route is playable, not that every wager is.
 */
export function autopilot(sim: Sim): InputFrame {
  const b = sim.ball
  const pads: { x: number; y: number; w: number }[] = []
  for (const chunk of sim.chunks) {
    if (chunk.x > b.x + 800 || chunk.x + chunk.w < b.x - 60) continue
    for (const p of chunk.platforms) {
      if (p.route !== 'safe' || p.kind === 'wall') continue
      const rect = platformRect(p, sim.time)
      if (rect.x + rect.w < b.x - 8) continue
      pads.push({ x: rect.x, y: rect.y, w: rect.w })
    }
  }
  pads.sort((a, c) => a.x - c.x || a.y - c.y)
  const upcoming = pads.filter((p) => p.x + p.w > b.x + 4)
  const over = upcoming.find((p) => b.x >= p.x - 6 && b.x <= p.x + p.w + 6 && b.y < p.y + 30)
  const next = (over ? upcoming.find((p) => p.x > over.x + 6) : undefined) ?? upcoming[0]
  if (!next) return { x: 1, y: 0, brake: false, dash: false, grav: false, pause: false }

  const rising = !!over && next.y < over.y - 18
  const desired = rising ? 340 : 300
  let steer = 0
  let brake = false

  if (rising && b.x < over.x + over.w * 0.58) {
    steer = b.vx < 260 ? 1 : 0
  } else if (b.vx < desired - 30) steer = 1
  else if (b.vx > desired + 45) brake = true

  if (b.vy > 240) {
    const dy = next.y - (b.y + b.r)
    if (dy > 0 && dy < 200) {
      const t = clamp(dy / b.vy, 0.04, 0.55)
      const predict = b.x + b.vx * t
      if (predict > next.x + next.w - 6) {
        brake = true
        steer = 0
      } else if (predict < next.x + 8) {
        steer = 1
        brake = false
      }
    }
  }

  return { x: steer, y: 0, brake, dash: false, grav: false, pause: false }
}

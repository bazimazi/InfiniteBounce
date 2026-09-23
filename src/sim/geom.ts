import type { Hazard, Platform, Rect } from './types'

export function platformRect(p: Platform, time: number): Rect {
  let x = p.x
  let y = p.collapsed ? p.fallY : p.y
  if (p.kind === 'moving' && !p.collapsed) {
    const o = Math.sin(time * p.freq + p.phase) * p.amp
    if (p.axis === 'x') x += o
    else y += o
  }
  return { x, y, w: p.w, h: p.h }
}

export function platformVelocity(p: Platform, time: number, dt: number): { x: number; y: number } {
  if (p.kind !== 'moving' || dt <= 0) return { x: 0, y: 0 }
  const a = platformRect(p, time)
  const b = platformRect(p, time - dt)
  return { x: (a.x - b.x) / dt, y: (a.y - b.y) / dt }
}

/** 0 = fully open, 1 = slammed. */
export function crusherAmount(h: Hazard, time: number): number {
  const t = (((time * h.freq + h.phase) % 1) + 1) % 1
  if (t < 0.58) return 0
  if (t < 0.7) return (t - 0.58) / 0.12
  if (t < 0.84) return 1
  if (t < 0.96) return 1 - (t - 0.84) / 0.12
  return 0
}

export function laserHot(h: Hazard, time: number): boolean {
  const s = Math.sin(time * h.freq + h.phase)
  return s > 0.2
}

export function laserWarm(h: Hazard, time: number): boolean {
  const s = Math.sin(time * h.freq + h.phase)
  return s > -0.15 && s <= 0.2
}

export function sweepX(h: Hazard, time: number): number {
  const elapsed = Math.max(0, time - h.phase)
  return h.x + elapsed * h.speed
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function distPointRect(px: number, py: number, r: Rect): number {
  const cx = Math.max(r.x, Math.min(px, r.x + r.w))
  const cy = Math.max(r.y, Math.min(py, r.y + r.h))
  return Math.hypot(px - cx, py - cy)
}

export function circleHitsRect(cx: number, cy: number, radius: number, r: Rect): boolean {
  return distPointRect(cx, cy, r) <= radius
}

export interface Contact {
  platform: Platform
  rect: Rect
  face: 'floor' | 'wall' | 'ceil'
  nx: number
  ny: number
  pen: number
}

/**
 * Circle vs AABB with a swept floor test so fast balls cannot fall through.
 * Floor wins when the ball was clearly approaching that face.
 */
export function detectContact(
  cx: number,
  cy: number,
  px: number,
  py: number,
  radius: number,
  vx: number,
  vy: number,
  platform: Platform,
  rect: Rect,
  gSign: number,
): Contact | null {
  if (platform.collapsed && platform.fallV > 900) return null

  const floorIsTop = gSign >= 0
  const prevLeading = floorIsTop ? py + radius : py - radius
  const surface = floorIsTop ? rect.y : rect.y + rect.h
  const falling = floorIsTop ? vy >= 0 : vy <= 0
  const ledge = 12
  const wasClear = floorIsTop ? prevLeading <= surface + 14 : prevLeading >= surface - 14
  const nowPast = floorIsTop ? cy + radius >= surface - 2 : cy - radius <= surface + 2
  const withinX = cx + radius + ledge > rect.x - 2 && cx - radius - ledge < rect.x + rect.w + 2

  if (
    (platform.kind === 'oneway' || platform.kind === 'cloud') &&
    !(wasClear && nowPast && falling && withinX)
  ) {
    return null
  }

  const slack = radius + Math.min(80, Math.abs(vy) * 0.025 + 28)
  if (wasClear && nowPast && falling && withinX && Math.abs(cy - (floorIsTop ? surface - radius : surface + radius)) < slack) {
    if (platform.kind !== 'wall' || Math.abs(surface - (floorIsTop ? py + radius : py - radius)) < 28) {
      const onTopApproach = platform.kind !== 'wall' || (floorIsTop ? py + radius <= rect.y + 10 : py - radius >= rect.y + rect.h - 10)
      if (onTopApproach) {
        return {
          platform,
          rect,
          face: 'floor',
          nx: 0,
          ny: floorIsTop ? -1 : 1,
          pen: floorIsTop ? cy + radius - surface : surface - (cy - radius),
        }
      }
    }
  }

  const left = rect.x - radius
  const right = rect.x + rect.w + radius
  const top = rect.y - radius
  const bottom = rect.y + rect.h + radius
  if (cx < left || cx > right || cy < top || cy > bottom) return null

  const penL = cx - left
  const penR = right - cx
  const penT = cy - top
  const penB = bottom - cy

  if (platform.kind === 'oneway' || platform.kind === 'cloud') return null

  let face: Contact['face'] = 'wall'
  let nx = 0
  let ny = 0
  let pen = 0
  const min = Math.min(penL, penR, penT, penB)
  if (min === penT) {
    face = floorIsTop ? 'floor' : 'ceil'
    ny = -1
    pen = penT
  } else if (min === penB) {
    face = floorIsTop ? 'ceil' : 'floor'
    ny = 1
    pen = penB
  } else if (min === penL) {
    face = 'wall'
    nx = -1
    pen = penL
  } else {
    face = 'wall'
    nx = 1
    pen = penR
  }

  if (platform.kind === 'wall' && face === 'floor') {
    const comingFromSide = floorIsTop ? px + radius > rect.x && px - radius < rect.x + rect.w : true
    if (!comingFromSide) {
      face = 'wall'
      ny = 0
      nx = cx < rect.x + rect.w / 2 ? -1 : 1
    }
  }

  // Previous position outside horizontally → this is a wall even if the corner says floor,
  // unless we were clearly above the top.
  const prevOutside = px + radius <= rect.x + 1 || px - radius >= rect.x + rect.w - 1
  if (prevOutside && face === 'floor' && platform.kind === 'wall') {
    face = 'wall'
    ny = 0
    nx = px < rect.x ? -1 : 1
  }

  void vx
  return { platform, rect, face, nx, ny, pen }
}

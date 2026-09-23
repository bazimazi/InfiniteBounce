import type { BiomeId } from '../sim/types'

export interface UnlockQuery {
  distance: number
  perfects: number
  walls: number
  runWalls: number
  chain: number
  fragments: number
  visited: readonly BiomeId[]
  gravity: boolean
}

const ALWAYS: BiomeId[] = ['meadow']

/** Achievement gates, each with a distance fallback so a style can't hard-lock the atlas. */
export function unlockedBiomes(q: UnlockQuery): BiomeId[] {
  const out: BiomeId[] = [...ALWAYS]
  const far = q.distance
  if (far >= 650) out.push('industrial')
  if (q.perfects >= 10 || far >= 1600) out.push('sky')
  if (q.walls >= 12 || far >= 2200) out.push('neon')
  if (q.runWalls >= 6 || q.walls >= 28) out.push('cavern')
  if ((q.visited.includes('industrial') || far >= 2000) && far >= 1700) out.push('inferno')
  if (far >= 2800 || q.gravity) out.push('void')
  if ((q.chain >= 18 && far >= 2300) || far >= 3200) out.push('machine')
  if (q.fragments >= 2 || far >= 3400) out.push('cosmic')
  if (far >= 4300) out.push('infinite')
  return out
}

export const LESSONS: Record<string, string> = {
  steer: 'A and D steer. The ball does not walk — it commits.',
  land: 'Land near the middle of a platform for a perfect.',
  brake: 'Hold S to brake. The faster you are, the longer it takes.',
  dash: 'Space dashes along your steer. Save it for a real gap.',
  split: 'The low road is safe. Gold trim is a wager.',
  wall: 'Steer into a wall and the rebound sharpens.',
  enemy: 'Bounce on creatures. Shards are not steps.',
  ice: 'Ice keeps speed. Brake before you need the next landing.',
  crusher: 'Crushers show their timing. Wait in the open, then cross.',
  laser: 'Lasers glow before they burn. The gap is crossable in the quiet.',
  wind: 'Wind is a force. Aim through it, not against the picture.',
  gravity: 'In the violet band, down flips. The floor is overhead.',
  collapse: 'That floor is leaving. Bounce onward.',
  pursuit: 'A sweep is coming. Standing still is the only way it wins.',
  launch: 'Launch pads spend your arc. The landing is wide — commit.',
  conveyor: 'Belts donate speed. Spend it, or brake it, on purpose.',
}

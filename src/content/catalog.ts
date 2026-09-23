import type { BiomeId, CoreId, Difficulty, ModuleId, MutatorId, TrailId } from '../sim/types'

export interface CoreDef {
  id: CoreId
  name: string
  epithet: string
  body: string
  cost: number
  gravity: number
  bounce: number
  accel: number
  air: number
  brake: number
  maxVx: number
  dash: number
  magnet: number
  volatile: boolean
}

export const CORES: CoreDef[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    epithet: 'The first rhythm',
    body: 'Even bounce, even steering. The reference the other cores are measured against.',
    cost: 0,
    gravity: 1,
    bounce: 1,
    accel: 1,
    air: 1,
    brake: 1,
    maxVx: 1,
    dash: 1,
    magnet: 0,
    volatile: false,
  },
  {
    id: 'agile',
    name: 'Agile',
    epithet: 'The carver',
    body: 'Sharper air control and quicker starts. Lower top speed, so lines stay correctable.',
    cost: 14,
    gravity: 1.02,
    bounce: 0.94,
    accel: 1.16,
    air: 1.42,
    brake: 1.12,
    maxVx: 0.9,
    dash: 1.05,
    magnet: 0,
    volatile: false,
  },
  {
    id: 'heavy',
    name: 'Heavy',
    epithet: 'The keeper',
    body: 'Holds horizontal speed through landings. Slow to turn, brutal if you miss the brake.',
    cost: 16,
    gravity: 1.08,
    bounce: 0.9,
    accel: 0.8,
    air: 0.62,
    brake: 0.7,
    maxVx: 1.18,
    dash: 0.92,
    magnet: 0,
    volatile: false,
  },
  {
    id: 'elastic',
    name: 'Elastic',
    epithet: 'The loft',
    body: 'Higher, longer bounces and a weaker horizontal shove. The air is the road.',
    cost: 16,
    gravity: 0.94,
    bounce: 1.2,
    accel: 0.86,
    air: 1.12,
    brake: 1,
    maxVx: 0.94,
    dash: 1,
    magnet: 0,
    volatile: false,
  },
  {
    id: 'magnetic',
    name: 'Magnetic',
    epithet: 'The gatherer',
    body: 'Pulls echoes and gems across a wide radius. Movement stays honest.',
    cost: 28,
    gravity: 1,
    bounce: 0.98,
    accel: 1,
    air: 1.05,
    brake: 1,
    maxVx: 1,
    dash: 1,
    magnet: 1,
    volatile: false,
  },
  {
    id: 'volatile',
    name: 'Volatile',
    epithet: 'The spark',
    body: 'Dashes detonate outward. Huge redirection, and a mess if a hazard is hugging you.',
    cost: 32,
    gravity: 1.04,
    bounce: 1.06,
    accel: 1.04,
    air: 0.92,
    brake: 0.86,
    maxVx: 1.06,
    dash: 1.18,
    magnet: 0,
    volatile: true,
  },
]

export interface ModuleDef {
  id: ModuleId
  name: string
  body: string
  cost: number
}

export const MODULES: ModuleDef[] = [
  { id: 'momentum', name: 'Momentum Keeper', body: 'Landings keep more horizontal speed. Braking gives up a little authority.', cost: 12 },
  { id: 'bounce', name: 'Bounce Master', body: 'Taller bounces. Air steering is slightly duller, so arcs must be chosen earlier.', cost: 12 },
  { id: 'speed', name: 'Speed Demon', body: 'Higher top speed. Past the threshold, the ball stops listening as quickly.', cost: 14 },
  { id: 'brake', name: 'Emergency Brake', body: 'Much stronger brakes and a lower top speed. Precision over spectacle.', cost: 12 },
  { id: 'combo', name: 'Combo Collector', body: 'Flow lingers. Distance scoring is a notch quieter so style has to carry you.', cost: 14 },
  { id: 'risk', name: 'Risk Taker', body: 'Near misses and perfects pay more. Flow falls off a cliff if you play safe.', cost: 14 },
  { id: 'wall', name: 'Wall Runner', body: 'Wall rebounds kick harder. Ground acceleration is a little lazier.', cost: 16 },
  { id: 'magnet', name: 'Echo Magnet', body: 'A wider gather radius for pickups. No change to the bounce itself.', cost: 10 },
]

export interface TrailDef {
  id: TrailId
  name: string
  body: string
  cost: number
  color: string
}

export const TRAILS: TrailDef[] = [
  { id: 'none', name: 'Bare', body: 'No ribbon.', cost: 0, color: '#ffffff' },
  { id: 'dusk', name: 'Dusk Ribbon', body: 'A warm thread that brightens as you accelerate.', cost: 0, color: '#ffb703' },
  { id: 'ember', name: 'Ember', body: 'Sparks that stretch when the bounce is fast.', cost: 8, color: '#ff6b3d' },
  { id: 'ion', name: 'Ion', body: 'A cool filament. Reads clearly against dark biomes.', cost: 8, color: '#7ee0ff' },
  { id: 'petal', name: 'Petal', body: 'Soft flakes. A meadow souvenir.', cost: 10, color: '#ff9ec8' },
  { id: 'void', name: 'Void Thread', body: 'A thin violet scar. Earned past the quiet places.', cost: 18, color: '#c4b5fd' },
]

export interface UpgradeDef {
  id: string
  kicker: string
  title: string
  body: string
  tone: string
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'momentum', kicker: 'Momentum', title: 'Keep the Line', body: 'Landings preserve more horizontal speed. Brakes soften.', tone: 'momentum' },
  { id: 'spring', kicker: 'Bounce', title: 'Spring Soul', body: 'Higher bounces. You commit to the arc sooner.', tone: 'bounce' },
  { id: 'air', kicker: 'Mobility', title: 'Air Carve', body: 'Much stronger steering while airborne.', tone: 'mobility' },
  { id: 'dash2', kicker: 'Mobility', title: 'Second Dash', body: 'Two dash charges. The cooldown still matters.', tone: 'mobility' },
  { id: 'dashfast', kicker: 'Mobility', title: 'Short Fuse', body: 'Dash recharges faster.', tone: 'mobility' },
  { id: 'wall', kicker: 'Bounce', title: 'Wall Singer', body: 'Skilled wall hits return more speed and a small pop.', tone: 'bounce' },
  { id: 'magnet', kicker: 'Utility', title: 'Gather', body: 'Pickups drift toward you.', tone: 'utility' },
  { id: 'barrier', kicker: 'Utility', title: 'Barrier', body: 'Survive the next solid hit. One charge.', tone: 'utility' },
  { id: 'phase', kicker: 'Risk', title: 'Phase Step', body: 'A dashing ball slips through hazards for a blink.', tone: 'risk' },
  { id: 'enemy', kicker: 'Bounce', title: 'Enemy Step', body: 'Enemy bounces launch harder and refund a little dash.', tone: 'bounce' },
  { id: 'risk', kicker: 'Risk', title: 'Bright Edge', body: 'Near misses and perfects score more. Flow decays faster.', tone: 'risk' },
  { id: 'glide', kicker: 'Momentum', title: 'Low Orbit', body: 'Gentler gravity. Hang time grows, and so do your mistakes.', tone: 'momentum' },
  { id: 'brake', kicker: 'Utility', title: 'Hard Stop', body: 'Stronger brakes, lower top speed.', tone: 'utility' },
  { id: 'keeper', kicker: 'Momentum', title: 'Long Phrase', body: 'Flow stays up longer. Raw distance pays slightly less.', tone: 'momentum' },
  { id: 'heavy', kicker: 'Risk', title: 'Heavy Landing', body: 'Fast, centered landings detonate extra score.', tone: 'risk' },
  { id: 'echo', kicker: 'Utility', title: 'Echo Cache', body: 'A small purse of echoes. The bounce is unchanged.', tone: 'utility' },
  { id: 'breath', kicker: 'Utility', title: 'Breath', body: 'The next stretches of road widen and slow down.', tone: 'utility' },
]

export interface ChallengeDef {
  id: string
  title: string
  body: string
  goal: number
  reward: number
  metric:
    | 'runDistance'
    | 'lifePerfects'
    | 'runWalls'
    | 'lifeEnemies'
    | 'maxSpeed'
    | 'bestChain'
    | 'biomeIndustrial'
    | 'runNears'
    | 'daily'
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'd500', title: 'First Horizon', body: 'Travel 500m in a single run.', goal: 500, reward: 8, metric: 'runDistance' },
  { id: 'd2000', title: 'Long Arc', body: 'Travel 2,000m in a single run.', goal: 2000, reward: 16, metric: 'runDistance' },
  { id: 'perfects', title: 'Clean Landings', body: 'Land 25 perfect bounces across your career.', goal: 25, reward: 12, metric: 'lifePerfects' },
  { id: 'walls', title: 'Rebound', body: 'Wall-bounce 10 times in one run.', goal: 10, reward: 12, metric: 'runWalls' },
  { id: 'enemies', title: 'Living Steps', body: 'Bounce off 15 enemies.', goal: 15, reward: 10, metric: 'lifeEnemies' },
  { id: 'speed', title: 'Critical', body: 'Reach momentum 18.', goal: 18, reward: 10, metric: 'maxSpeed' },
  { id: 'combo', title: 'In Phrase', body: 'Build a flow chain of 20.', goal: 20, reward: 12, metric: 'bestChain' },
  { id: 'industrial', title: 'Into the Works', body: 'Enter the Industrial reach.', goal: 1, reward: 10, metric: 'biomeIndustrial' },
  { id: 'nearmiss', title: 'Thread', body: 'Earn 8 near misses in one run.', goal: 8, reward: 10, metric: 'runNears' },
  { id: 'daily', title: "Today's Course", body: 'Travel 800m on today’s shared seed.', goal: 800, reward: 14, metric: 'daily' },
]

export interface MutatorDef {
  id: MutatorId
  name: string
  body: string
}

export const MUTATORS: MutatorDef[] = [
  { id: 'none', name: 'Open sky', body: 'No mutator. The world as authored.' },
  { id: 'tailwind', name: 'Tailwind', body: 'A constant push forward. Speed comes free. Corrections do not.' },
  { id: 'heavy', name: 'Heavy World', body: 'Gravity bites harder. Arcs shorten.' },
  { id: 'nodash', name: 'No Dash', body: 'The burst is gone. Lines have to be earned with the bounce alone.' },
  { id: 'glass', name: 'Glass', body: 'Shields never appear. Every hazard is final.' },
]

export const DIFFICULTIES: { id: Difficulty; name: string; body: string; unlockDistance: number; unlockChain: number }[] = [
  { id: 'relaxed', name: 'Relaxed', body: 'Softer gravity, wider road, gentler mistakes.', unlockDistance: 0, unlockChain: 0 },
  { id: 'normal', name: 'Normal', body: 'The intended conversation between speed and control.', unlockDistance: 0, unlockChain: 0 },
  { id: 'hard', name: 'Hard', body: 'Tighter platforms and less forgiveness in the air.', unlockDistance: 0, unlockChain: 0 },
  { id: 'extreme', name: 'Extreme', body: 'The generator stops being polite.', unlockDistance: 1500, unlockChain: 0 },
  { id: 'master', name: 'Master', body: 'For players who already think in arcs.', unlockDistance: 3000, unlockChain: 24 },
]

export const BIOME_COPY: Record<BiomeId, { name: string; line: string; enter: string }> = {
  meadow: { name: 'Meadow', line: 'Soft ground. Learn the arc.', enter: 'The grass keeps a simple beat.' },
  industrial: { name: 'Industrial', line: 'Belts, pistons, crushers.', enter: 'The machines keep time. You keep momentum.' },
  sky: { name: 'Sky', line: 'Wind, clouds, long air.', enter: 'The floor becomes a suggestion.' },
  neon: { name: 'Neon City', line: 'Lasers and moving lanes.', enter: 'Light here is a hazard with a schedule.' },
  cavern: { name: 'Caverns', line: 'Walls close in.', enter: 'The rebound is a path, if you want it.' },
  inferno: { name: 'Inferno', line: 'Collapse and launch.', enter: 'The ground is impatient.' },
  void: { name: 'Void', line: 'Gravity becomes a choice.', enter: 'Down is a local custom.' },
  machine: { name: 'Machine Core', line: 'Several systems at once.', enter: 'Everything you learned, stacked.' },
  cosmic: { name: 'Cosmic', line: 'Strange, generous physics.', enter: 'The arc lasts longer than it should.' },
  infinite: { name: 'Infinite', line: 'The late road.', enter: 'There is no last biome. Only a stranger one.' },
}

export const FRAGMENTS = [
  'The ground remembers every landing.',
  'Something below is counting the bounces.',
  'The machines were built to keep a rhythm. You are the rhythm.',
  'A wall is just a floor that refused to lie down.',
  'Speed is a promise you have to be able to break.',
  'Beyond the last gate, the ball was already moving.',
]

export const DEATH_COPY: Record<string, { title: string; line: string }> = {
  FALLEN: { title: 'Fallen', line: 'The landing was somewhere else.' },
  LOST: { title: 'Lost momentum', line: 'The arc ran out before the road did.' },
  OVERSPEED: { title: 'Overspeed', line: 'The correction needed more road than you had.' },
  SPIKES: { title: 'Spikes', line: 'Too close to the teeth.' },
  COLLISION: { title: 'Collision', line: 'That one could not be used as a step.' },
  CRUSHED: { title: 'Crushed', line: 'The machine kept its rhythm.' },
  LASER: { title: 'Laser', line: 'The light was not a path.' },
  SWEEP: { title: 'Sweep', line: 'The wave caught the pause.' },
  LAVA: { title: 'Lava', line: 'The floor gave up.' },
}

export function coreById(id: CoreId): CoreDef {
  return CORES.find((c) => c.id === id) ?? CORES[0]
}

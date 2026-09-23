import { describe, expect, it } from 'vitest'
import { autopilot } from './autopilot'
import { createRun, defaultConfig } from './create'
import { validateChunk } from './generator'
import { resolveChoice } from './choices'
import { fixedStep } from './step'
import type { Difficulty, InputFrame, Sim } from './types'

function run(sim: Sim, seconds: number, input: (sim: Sim) => InputFrame) {
  const steps = Math.round(seconds * 120)
  for (let i = 0; i < steps; i++) {
    if (sim.choice?.kind === 'upgrade' && sim.choice.cards[0]) resolveChoice(sim, sim.choice.cards[0].id)
    if (sim.choice?.kind === 'biome' && sim.choice.cards[0]) resolveChoice(sim, sim.choice.cards[0].id)
    fixedStep(sim, input(sim))
    if (sim.dead) break
  }
}

describe('procedural fairness', () => {
  it('reproduces a world from the same seed', () => {
    const a = createRun(defaultConfig({ seed: 42, tutorial: true }))
    const b = createRun(defaultConfig({ seed: 42, tutorial: true }))
    expect(a.chunks.map((c) => c.moduleId)).toEqual(b.chunks.map((c) => c.moduleId))
    expect(a.chunks.map((c) => c.platforms.map((p) => [p.x, p.y, p.w, p.kind].join(',')))).toEqual(
      b.chunks.map((c) => c.platforms.map((p) => [p.x, p.y, p.w, p.kind].join(','))),
    )
  })

  it('keeps the safe route inside the physics promise', () => {
    const modes: Difficulty[] = ['relaxed', 'normal', 'hard', 'extreme', 'master']
    for (const difficulty of modes) {
      for (const seed of [1, 7, 19, 88, 256]) {
        const sim = createRun(defaultConfig({ seed, difficulty, tutorial: false, bestDistance: 5000, visited: ['meadow', 'industrial', 'sky', 'neon', 'cavern', 'inferno', 'void', 'machine', 'cosmic', 'infinite'], gravityAbility: true, fragments: 6, bestChain: 40, lifetimePerfects: 40, lifetimeWalls: 40 }))
        run(sim, 8, autopilot)
        for (const chunk of sim.chunks) {
          const problem = validateChunk(chunk, difficulty)
          expect(problem, `${difficulty} seed ${seed} ${chunk.moduleId}`).toBeNull()
        }
        expect(sim.fallbacks, `${difficulty} seed ${seed}`).toBe(0)
      }
    }
  })
})

describe('the bounce', () => {
  it('survives standing on the opening platforms', () => {
    const sim = createRun(defaultConfig({ seed: 3, tutorial: true }))
    const idle: InputFrame = { x: 0, y: 0, brake: false, dash: false, grav: false, pause: false }
    run(sim, 4, () => idle)
    expect(sim.dead).toBe(false)
    expect(sim.stats.bounces).toBeGreaterThan(3)
  })

  it('answers the dash on the same step', () => {
    const sim = createRun(defaultConfig({ seed: 3 }))
    const before = sim.ball.vx
    fixedStep(sim, { x: 1, y: 0, brake: false, dash: true, grav: false, pause: false })
    expect(sim.ball.vx).toBeGreaterThan(before + 400)
    expect(sim.stats.dashes).toBe(1)
  })

  it('stays deterministic under the same inputs', () => {
    const play = () => {
      const sim = createRun(defaultConfig({ seed: 11, tutorial: true }))
      run(sim, 6, autopilot)
      return [sim.ball.x, sim.ball.y, sim.distance, sim.dead]
    }
    expect(play()).toEqual(play())
  })

  it('lets a simple pilot travel without dying', () => {
    for (const seed of [1, 4, 12, 30]) {
      const sim = createRun(defaultConfig({ seed, tutorial: true, difficulty: 'normal' }))
      run(sim, 35, autopilot)
      expect(sim.dead, `seed ${seed} dist ${sim.distance.toFixed(0)}`).toBe(false)
      expect(sim.distance, `seed ${seed}`).toBeGreaterThan(180)
      expect(Number.isFinite(sim.ball.vx)).toBe(true)
    }
  })
})

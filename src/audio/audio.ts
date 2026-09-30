import type { BiomeId } from '../sim/types'

const MAJOR = [0, 2, 4, 7, 9]
const MINOR = [0, 3, 5, 7, 10]

const ROOT: Record<BiomeId, number> = {
  meadow: 50,
  industrial: 45,
  sky: 52,
  neon: 46,
  cavern: 43,
  inferno: 44,
  void: 41,
  machine: 42,
  cosmic: 53,
  infinite: 48,
}

export class AudioBus {
  private ctx: AudioContext | null = null
  private music: GainNode | null = null
  private sfx: GainNode | null = null
  private noise: AudioBuffer | null = null
  private next = 0
  private step = 0
  musicVol = 0.7
  sfxVol = 0.85
  intensity = 0
  biome: BiomeId = 'meadow'
  private started = false

  resume() {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') void ctx.resume()
    this.started = true
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 18
    comp.ratio.value = 2.4
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(comp)
    comp.connect(ctx.destination)
    this.music = ctx.createGain()
    this.music.gain.value = 0.05 + this.musicVol * 0.22
    this.music.connect(master)
    this.sfx = ctx.createGain()
    this.sfx.gain.value = this.sfxVol
    this.sfx.connect(master)
    const n = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate)
    const data = n.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.noise = n
    return ctx
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music
    this.sfxVol = sfx
    if (this.music) this.music.gain.value = 0.05 + music * 0.22
    if (this.sfx) this.sfx.gain.value = sfx
  }

  update(nowIntensity: number) {
    this.intensity = nowIntensity
    if (!this.started || !this.ctx || !this.music) return
    const ctx = this.ctx
    if (this.next === 0) this.next = ctx.currentTime + 0.05
    const eighth = 60 / 96 / 2
    let guard = 0
    while (this.next < ctx.currentTime + 0.25 && guard++ < 8) {
      this.schedule(this.next, this.step)
      this.next += eighth
      this.step++
    }
  }

  private schedule(time: number, step: number) {
    if (!this.ctx || !this.music) return
    const scale = this.biome === 'meadow' || this.biome === 'sky' || this.biome === 'cosmic' ? MAJOR : MINOR
    const root = ROOT[this.biome]
    const beat = step % 8
    const chord = scale[Math.floor(step / 32) % scale.length]
    if (beat === 0) this.tone(this.music, midi(root + chord), time, 1.4, 'triangle', 0.05)
    if (beat === 0) this.tone(this.music, midi(root + chord + 7), time, 1.4, 'sine', 0.03)
    if (this.intensity > 0.25 && (beat === 0 || beat === 4)) this.tone(this.music, midi(root - 12 + chord), time, 0.22, 'sine', 0.07)
    if (this.intensity > 0.35 && (beat === 0 || beat === 4 || (this.intensity > 0.7 && beat === 2))) this.noiseHit(time, 0.05, 0.08)
    if (this.intensity > 0.5 && beat % 2 === 0) this.noiseHit(time, 0.02, 0.025, 5000)
    if (this.intensity > 0.62) {
      const note = scale[step % scale.length]
      this.tone(this.music, midi(root + 12 + note), time, 0.12, 'square', 0.018)
    }
  }

  bounce(speed: number, perfect: boolean, chain = 0) {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    const now = ctx.currentTime
    const f = 150 + Math.min(280, speed * 0.18)
    this.tone(this.sfx, f, now, 0.09, 'sine', perfect ? 0.14 : 0.09)
    this.noiseHit(now, 0.03, 0.04, 260)
    if (perfect) {
      // Each perfect in a chain climbs the biome's scale, so a streak sings upward.
      const scale = this.biome === 'meadow' || this.biome === 'sky' || this.biome === 'cosmic' ? MAJOR : MINOR
      const step = Math.min(14, Math.max(0, Math.floor(chain) - 1))
      const note = ROOT[this.biome] + 24 + scale[step % scale.length] + 12 * Math.floor(step / scale.length)
      this.tone(this.sfx, midi(note), now, 0.18, 'triangle', 0.09)
      this.tone(this.sfx, midi(note + 12), now + 0.04, 0.12, 'sine', 0.04)
    }
  }

  chord() {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    const scale = this.biome === 'meadow' || this.biome === 'sky' || this.biome === 'cosmic' ? MAJOR : MINOR
    const root = ROOT[this.biome] + 24
    ;[0, 2, 4].forEach((d, i) => this.tone(this.sfx!, midi(root + scale[d]), ctx.currentTime + i * 0.05, 0.4, 'triangle', 0.06))
  }

  wall(skill: boolean) {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    this.tone(this.sfx, skill ? 210 : 120, ctx.currentTime, 0.08, 'square', 0.06)
    this.noiseHit(ctx.currentTime, 0.05, 0.05, 800)
  }

  dash() {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    this.sweep(ctx.currentTime, 220, 880, 0.16, 0.08)
  }

  near() {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    this.tone(this.sfx, 740, ctx.currentTime, 0.12, 'sine', 0.05)
    this.noiseHit(ctx.currentTime, 0.08, 0.03, 2000)
  }

  pickup() {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    this.tone(this.sfx, 660, ctx.currentTime, 0.08, 'sine', 0.06)
    this.tone(this.sfx, 990, ctx.currentTime + 0.06, 0.1, 'sine', 0.05)
  }

  death() {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    this.sweep(ctx.currentTime, 240, 50, 0.45, 0.1)
  }

  blip() {
    if (!this.sfxVol) return
    this.resume()
    const ctx = this.ensure()
    if (!this.sfx) return
    this.tone(this.sfx, 520, ctx.currentTime, 0.05, 'sine', 0.05)
  }

  private tone(dest: GainNode, freq: number, when: number, dur: number, type: OscillatorType, gain: number) {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, when)
    g.gain.setValueAtTime(gain, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    osc.connect(g)
    g.connect(dest)
    osc.start(when)
    osc.stop(when + dur + 0.02)
  }

  private sweep(when: number, from: number, to: number, dur: number, gain: number) {
    if (!this.ctx || !this.sfx) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(from, when)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), when + dur)
    g.gain.setValueAtTime(gain, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    osc.connect(g)
    g.connect(this.sfx)
    osc.start(when)
    osc.stop(when + dur + 0.02)
  }

  private noiseHit(when: number, dur: number, gain: number, freq = 180) {
    if (!this.ctx || !this.sfx || !this.noise) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.sfx)
    src.start(when)
    src.stop(when + dur + 0.02)
  }
}

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12)
}

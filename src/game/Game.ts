import { AudioBus } from '../audio/audio'
import { BIOME_COPY, DEATH_COPY } from '../content/catalog'
import { TUNE } from '../content/tune'
import { clamp, damp } from '../core/math'
import { randomSeed } from '../core/rng'
import { ViewFx } from '../fx/view'
import { Input } from '../input/input'
import { groundBelow, lookOf, render, resetRenderState, trailColorOf, type Cam } from '../render/draw'
import { autopilot } from '../sim/autopilot'
import { resolveChoice } from '../sim/choices'
import { createRun, defaultConfig } from '../sim/create'
import { fixedStep } from '../sim/step'
import type { GhostSample, InputFrame, Sim, SimEvent } from '../sim/types'
import { Shell, type BannerKind, type HudModel } from '../ui/shell'
import {
  buy,
  commitRun,
  dailySeed,
  difficultyUnlocked,
  equipCore,
  equipTrail,
  loadMeta,
  mutatorsUnlocked,
  saveMeta,
  speedLabel,
  toggleModule,
  track,
  type Meta,
  type Summary,
} from './save'

const STATE: Record<string, string> = {
  STABLE: 'Stable',
  ACCEL: 'Accelerating',
  HIGH: 'High momentum',
  CRITICAL: 'Critical',
  BRAKE: 'Braking',
  AIR: 'Air',
  WALL: 'Wall',
  DASH: 'Dash',
}

type Mode = 'title' | 'play' | 'practice' | 'pause' | 'choice' | 'results' | 'workshop' | 'challenges' | 'map' | 'settings'

export class Game {
  private meta: Meta
  private sim: Sim | null = null
  private attract: Sim
  private mode: Mode = 'title'
  private menuReturn: 'title' | 'pause' | 'results' = 'title'
  private summary: Summary | null = null
  private daily = false
  private committed = false
  private autoplay = false
  private debug = false
  private acc = 0
  private last = 0
  private deathAt = 0
  private bannerLife = 0
  private flash = 0
  /** Camera trauma in [0, 1]; shake grows with its square so small hits stay subtle. */
  private trauma = 0
  /** Momentary zoom offset for punch-ins, decays to zero. */
  private punch = 0
  private lastPunch = 0
  private deadFade = 0
  private biomeBanner = false
  private elapsed = 0
  private frameDt = 0.016
  private readonly input = new Input()
  private readonly audio = new AudioBus()
  private readonly fx = new ViewFx()
  private readonly shell: Shell
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly cam: Cam = { x: 200, y: 0, zoom: 1, anchor: 400, shakeX: 0, shakeY: 0, tilt: 0 }

  constructor() {
    this.meta = loadMeta()
    this.attract = this.makeRun(false, true)
    this.canvas = document.querySelector('#view')!
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    this.ctx = ctx
    const root = document.querySelector('#ui') as HTMLElement
    this.shell = new Shell(root, (action, el) => this.onAction(action, el))
    this.shell.bindTouch(
      (down) => {
        this.input.brakeTouch = down
      },
      () => this.input.queueDash(),
    )
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') this.debug = !this.debug
      if (e.code === 'F8') this.autoplay = !this.autoplay
      if (this.mode === 'choice' && this.sim?.choice) {
        const index = e.code === 'Digit1' || e.code === 'Numpad1' ? 0 : e.code === 'Digit2' || e.code === 'Numpad2' ? 1 : e.code === 'Digit3' || e.code === 'Numpad3' ? 2 : -1
        const card = index >= 0 ? this.sim.choice.cards[index] : undefined
        if (card) this.pick(card.id)
      }
    })
    this.audio.setVolumes(this.meta.settings.music, this.meta.settings.sfx)
    this.applyAppearance()
    this.shell.showTitle(this.meta)
    this.snap(this.attract)
    // ?demo starts a piloted run, handy for previewing presentation changes.
    if (new URLSearchParams(location.search).has('demo')) {
      this.autoplay = true
      this.startRun(false)
    }
  }

  start() {
    requestAnimationFrame((t) => this.frame(t))
  }

  private frame(t: number) {
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0.016)
    this.last = t
    this.elapsed = t
    this.frameDt = dt
    this.tick(dt)
    requestAnimationFrame((now) => this.frame(now))
  }

  private tick(dt: number) {
    const frame = this.input.snapshot()
    if (frame.pause) this.onPauseEdge()
    const launch = (this.mode === 'title' || this.mode === 'results') && frame.dash
    if (launch) {
      this.audio.resume()
      this.startRun(this.mode === 'results' ? this.daily : false)
    }

    const sim = this.behind()
    const attract = sim === this.attract
    const playing = this.mode === 'play' || this.mode === 'practice'
    if (attract) {
      this.advance(sim, autopilot(sim), dt)
      if (sim.choice?.cards[0]) resolveChoice(sim, sim.choice.cards[0].id)
      if (sim.dead) {
        this.attract = this.makeRun(false, true)
        this.fx.clearAll()
        this.snap(this.attract)
      }
    } else if (playing && !sim.dead) {
      if (!sim.choice) {
        const steer = this.autoplay ? autopilot(sim) : frame
        const clean = launch ? { ...steer, dash: false, grav: false, pause: false } : steer
        this.advance(sim, clean, dt)
      }
      this.presentChoice(sim)
      if (sim.dead) this.deathAt = this.elapsed
    } else if (playing && sim.dead && !this.committed && this.elapsed - this.deathAt > 720) {
      this.finish()
    }

    if (this.bannerLife > 0) {
      this.bannerLife -= dt
      if (this.bannerLife <= 0) this.shell.banner('')
    }
    this.flash = Math.max(0, this.flash - dt * 2.4)
    this.deadFade = sim.dead && !attract ? Math.min(1, this.deadFade + dt * 2.2) : Math.max(0, this.deadFade - dt * 4)
    this.fx.update(dt)
    this.follow(sim, dt)
    this.audio.biome = sim.biome
    const speed = Math.min(1, Math.abs(sim.ball.vx) / (TUNE.maxVx * sim.mods.maxVx))
    this.audio.update(this.meta.settings.reducedMotion ? 0.2 : Math.min(1, sim.flow / 90 * 0.65 + speed * 0.45))
    this.paint(sim)
    this.paintHud(playing ? sim : null)
    this.applyTouch()
  }

  private advance(sim: Sim, frame: InputFrame, dt: number) {
    const reduced = this.meta.settings.reducedMotion
    if (!reduced) sim.hitstop = Math.min(sim.hitstop, 0.045)
    else sim.hitstop = 0
    let remain = dt
    if (sim.hitstop > 0 && !frame.dash) {
      const freeze = Math.min(remain, sim.hitstop)
      sim.hitstop -= freeze
      remain -= freeze
    }
    this.acc += remain
    let first = true
    let steps = 0
    while (this.acc >= TUNE.fixedDt && steps < 8) {
      const edge = first ? frame : { ...frame, dash: false, grav: false, pause: false }
      fixedStep(sim, edge)
      first = false
      steps++
      this.acc -= TUNE.fixedDt
      if (sim.dead || sim.choice) break
    }
    if (this.acc > TUNE.fixedDt) this.acc = 0
    this.consume(sim)
    const b = sim.ball
    const speed = Math.hypot(b.vx, b.vy)
    if (sim.dead) this.fx.clearTrail()
    else if (speed > 240 || sim.dashTimer > 0) this.fx.pushTrail(b.x, b.y, speed)
    else this.fx.fadeTrail()
    if (sim.dashTimer > 0 && !sim.dead && !this.meta.settings.reducedMotion) this.fx.afterimage(b.x, b.y)
    if (sim.config.trail === 'ember' && speed > 520 && !sim.dead && Math.random() < 0.35) {
      this.fx.sparks(b.x, b.y, '#ff8a3c', 1, 80, Math.PI * 2)
    }
  }

  private consume(sim: Sim) {
    const reduced = this.meta.settings.reducedMotion
    const flashMul = this.meta.settings.flash
    for (const e of sim.events) this.feel(sim, e, reduced, flashMul)
    sim.events.length = 0
  }

  private feel(sim: Sim, e: SimEvent, reduced: boolean, flashMul: number) {
    const look = lookOf(sim.biome)
    const n = reduced ? 4 : 12
    switch (e.type) {
      case 'bounce': {
        const vy = Math.abs(sim.ball.vy)
        const power = Math.min(1.4, vy / 900)
        this.audio.bounce(vy, e.perfect, sim.chain)
        this.fx.impact(Math.PI / 2, 0.1 + Math.min(0.2, vy / 5200))
        this.fx.dust(e.x, e.y, look.dust, reduced ? 2 : 6, power)
        this.buzz(e.perfect ? 12 : 6)
        if (e.kind === 'super' || e.kind === 'launch') {
          this.fx.sparks(e.x, e.y, e.kind === 'launch' ? '#ffb15a' : '#8cff9e', reduced ? 3 : 10, 420, 0.9)
          this.addTrauma(0.18)
        }
        if (e.perfect) {
          const chain = Math.floor(sim.chain)
          this.fx.stars(e.x, e.y - 4, '#ffe08a', reduced ? 4 : 9, 260)
          this.fx.text(e.x, e.y - 34, chain > 1 ? `Perfect ×${chain}` : 'Perfect', '#ffe08a', 16 + Math.min(8, chain * 0.4))
          this.fx.ring(e.x, e.y, '#ffe08a', 1.1, 0.34, 3)
          this.addTrauma(0.16)
          this.punch = Math.max(this.punch, 0.035)
          this.flash = Math.max(this.flash, 0.14 * flashMul)
        } else if (e.fast) {
          this.fx.sparks(e.x, e.y, '#fff4dc', reduced ? 2 : 6, 320, 1.4)
          this.fx.ring(e.x, e.y, '#ffffff', 0.8, 0.3, 2)
          this.addTrauma(0.08)
        } else {
          this.fx.ring(e.x, e.y, look.lip, 0.55, 0.28, 1.5)
        }
        break
      }
      case 'wall':
        this.audio.wall(e.skill)
        this.fx.impact(0, 0.2)
        this.fx.sparks(e.x, e.y, '#d7fff0', n, 260, 1.6, sim.ball.vx > 0 ? 0 : Math.PI)
        this.fx.ring(e.x, e.y, e.skill ? '#9ee7c4' : '#ffffff', e.skill ? 1 : 0.5, 1, 2.5)
        if (e.skill) this.fx.text(e.x, e.y - 26, 'Wall kick', '#9ee7c4')
        this.addTrauma(e.skill ? 0.24 : 0.14)
        break
      case 'enemy':
        this.audio.bounce(420, true, sim.chain)
        this.fx.impact(Math.PI / 2, 0.24)
        this.fx.burst(e.x, e.y, '#ffd0e4', n, 150)
        this.fx.stars(e.x, e.y + 8, '#ffd0e4', reduced ? 3 : 6, 180)
        this.fx.text(e.x, e.y - 26, 'Step', '#ffd0e4')
        this.addTrauma(0.18)
        break
      case 'dash': {
        this.audio.dash()
        const back = Math.atan2(-sim.ball.vy, -sim.ball.vx)
        this.fx.sparks(e.x, e.y, '#ffffff', reduced ? 4 : 12, 360, 1.1, back)
        this.fx.ring(e.x, e.y, trailColorOf(sim.config.trail), 0.9, 1, 3)
        this.fx.impact(Math.atan2(sim.ball.vy, sim.ball.vx), -0.2)
        this.addTrauma(0.14)
        this.punch = Math.min(this.punch, -0.03)
        this.buzz(10)
        break
      }
      case 'nearmiss':
        this.audio.near()
        this.fx.text(e.x, e.y - 38, e.threaded ? 'Threaded!' : 'Near miss', '#ffffff', 16)
        this.fx.ring(e.x, e.y, '#ffffff', 1.3, 1, 2.5)
        this.fx.sparks(e.x, e.y, '#ffffff', reduced ? 3 : 8, 300)
        this.addTrauma(0.3)
        this.punch = Math.max(this.punch, 0.04)
        this.flash = Math.max(this.flash, 0.24 * flashMul)
        this.buzz(16)
        break
      case 'pickup': {
        this.audio.pickup()
        const color = e.kind === 'shield' ? '#9ee7ff' : e.kind === 'echo' ? look.accent : e.kind === 'fragment' ? '#fff4c2' : '#ffe08a'
        this.fx.stars(e.x, e.y, color, reduced ? 3 : e.kind === 'fragment' ? 14 : 6, e.kind === 'fragment' ? 260 : 150)
        this.fx.ring(e.x, e.y, color, 0.7, 1, 2)
        if (e.kind === 'gem' && e.value > 0) this.fx.text(e.x, e.y - 20, `+${e.value}`, '#ffe08a', 13)
        if (e.kind === 'echo') this.fx.text(e.x, e.y - 20, `+${e.value} echo`, color, 13)
        break
      }
      case 'shield':
        this.audio.blip()
        this.toast('Shield', 'The next solid hit will break, not you.')
        this.fx.ring(e.x, e.y, '#9ee7ff', 1.6, 1, 3)
        this.fx.shatter(e.x, e.y, ['#9ee7ff', '#e8fbff'], reduced ? 6 : 16, 260)
        this.addTrauma(0.4)
        break
      case 'death': {
        this.audio.death()
        const copy = DEATH_COPY[e.id] ?? DEATH_COPY.FALLEN
        this.toast(copy.title, copy.line, 'death')
        this.fx.shatter(e.x, e.y, ['#f7f2ff', trailColorOf(sim.config.trail), '#ff8a7a'], reduced ? 8 : 26, 380)
        this.fx.burst(e.x, e.y, '#ff8a7a', reduced ? 6 : 18, 240, 3)
        this.fx.ring(e.x, e.y, '#ff8a7a', 2, 1, 4)
        this.addTrauma(0.75)
        this.punch = Math.max(this.punch, 0.14)
        this.flash = Math.max(this.flash, 0.4 * flashMul)
        this.buzz(28)
        break
      }
      case 'banner': {
        const kind: BannerKind = this.biomeBanner
          ? 'biome'
          : e.text.startsWith('Flow')
            ? 'flow'
            : !e.sub && e.text.length > 22
              ? 'lesson'
              : 'default'
        this.biomeBanner = false
        this.toast(e.text, e.sub ?? '', kind)
        break
      }
      case 'flow':
        this.audio.chord()
        this.fx.ring(sim.ball.x, sim.ball.y, '#ffe08a', 2.4, 1, 4)
        this.fx.stars(sim.ball.x, sim.ball.y, '#ffe08a', reduced ? 4 : 12, 320)
        this.punch = Math.max(this.punch, 0.05)
        this.flash = Math.max(this.flash, 0.12 * flashMul)
        break
      case 'record':
        this.audio.chord()
        this.fx.stars(sim.ball.x, sim.ball.y, '#ffe08a', reduced ? 4 : 16, 340)
        this.fx.text(sim.ball.x, sim.ball.y - 44, 'New best!', '#ffe08a', 20)
        break
      case 'biome':
        this.audio.blip()
        this.biomeBanner = true
        break
      case 'respawn':
        this.fx.clearTrail()
        break
      default:
        break
    }
  }

  private toast(title: string, sub = '', kind: BannerKind = 'default') {
    this.shell.banner(title, sub, kind)
    this.bannerLife = kind === 'lesson' ? 3.8 : kind === 'biome' ? 3.4 : sub ? 3.2 : 1.7
  }

  private addTrauma(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  private buzz(ms: number) {
    if (!this.meta.settings.haptics || this.meta.settings.reducedMotion) return
    try {
      navigator.vibrate?.(ms)
    } catch {
      /* some browsers reject vibrate outside a gesture */
    }
  }

  private follow(sim: Sim, dt: number) {
    const reduced = this.meta.settings.reducedMotion
    const w = this.canvas.clientWidth || window.innerWidth
    const b = sim.ball
    const maxV = TUNE.maxVx * sim.mods.maxVx
    const pace = clamp(b.vx / maxV, -1, 1)
    // Look ahead: the faster you go, the more road you see in front of you.
    const look = b.vx < -40 ? 0.62 + Math.max(0, -pace) * 0.08 : 0.34 - Math.max(0, pace) * 0.1
    // Frame the arc instead of chasing every bounce: sit between the ball and its landing.
    const ground = sim.dead ? null : groundBelow(sim, b.x, b.y)
    const height = ground === null ? 0 : Math.max(0, ground - b.y)
    const framed = ground === null ? b.y : b.y * 0.55 + (ground - 70) * 0.45
    const falling = b.vy > 260 && ground === null ? 110 : 0
    const speed = Math.abs(b.vx)
    let targetZoom = reduced ? 1.35 : clamp(1.42 - speed / 2600, 1.12, 1.48)
    if (!reduced) targetZoom -= Math.min(0.16, height / 2600)
    this.cam.x = damp(this.cam.x, b.x, 8, dt)
    this.cam.y = damp(this.cam.y, framed - 10 + falling, 4.2, dt)
    this.punch = damp(this.punch, 0, 7, dt)
    const baseZoom = damp(this.cam.zoom / (1 + this.lastPunch), targetZoom, 2.2, dt)
    const punch = reduced ? 0 : this.punch
    this.cam.zoom = baseZoom * (1 + punch)
    this.lastPunch = punch
    this.cam.anchor = damp(this.cam.anchor, w * look, 3, dt)
    const shake = reduced ? 0 : this.meta.settings.shake
    this.trauma = Math.max(0, this.trauma - dt * 1.7)
    const t = this.elapsed / 1000
    const k = this.trauma * this.trauma * shake
    // Smooth layered sines rather than per-frame random jitter.
    this.cam.shakeX = 18 * k * (Math.sin(t * 41.3) * 0.6 + Math.sin(t * 73.1 + 1.7) * 0.4)
    this.cam.shakeY = 14 * k * (Math.sin(t * 37.7 + 0.5) * 0.6 + Math.sin(t * 67.9 + 2.9) * 0.4)
    const lean = reduced || shake <= 0 ? 0 : clamp(b.vx / 20000, -0.022, 0.022)
    this.cam.tilt = lean + 0.05 * k * Math.sin(t * 29.3 + 4.1)
  }

  private paint(sim: Sim) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = window.innerWidth
    const h = window.innerHeight
    const pw = Math.floor(w * dpr)
    const ph = Math.floor(h * dpr)
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw
      this.canvas.height = ph
    }
    render({
      ctx: this.ctx,
      sim,
      width: w,
      height: h,
      dpr,
      cam: this.cam,
      fx: this.fx,
      ghost: this.ghostFor(sim),
      elapsed: this.elapsed,
      dt: this.frameDt,
      dead: this.deadFade,
      colorblind: this.meta.settings.colorblind,
      reduced: this.meta.settings.reducedMotion,
      debug: this.debug,
      flash: this.meta.settings.reducedMotion ? 0 : this.flash,
    })
  }

  private ghostFor(sim: Sim): GhostSample[] | null {
    if (!this.meta.settings.ghost || !this.meta.bestGhost?.length) return null
    if (sim.config.practice || sim === this.attract) return null
    if (sim.config.seed !== this.meta.ghostSeed) return null
    return this.meta.bestGhost
  }

  private paintHud(sim: Sim | null) {
    if (!sim) {
      this.shell.hud(blankHud())
      return
    }
    const maxV = TUNE.maxVx * sim.mods.maxVx
    const meter = Math.max(0, Math.min(1, Math.abs(sim.ball.vx) / maxV))
    const grace = TUNE.chainGrace / sim.mods.flowDecay
    const cd = TUNE.dashCd * sim.mods.dashCd
    const model: HudModel = {
      visible: true,
      distance: sim.distance,
      best: sim.config.practice ? 0 : sim.personalBest,
      score: sim.score,
      chain: Math.floor(sim.chain),
      flowLeft: sim.chain >= 1 ? Math.max(0, 1 - sim.flowIdle / grace) : 0,
      hot: sim.chain >= 8,
      speed: speedLabel(Math.abs(sim.ball.vx)),
      state: STATE[sim.ball.state] ?? 'Air',
      critical: meter > 0.82,
      meter,
      dashMax: Math.max(0, sim.mods.dashCharges),
      dashReady: sim.dashCharges,
      dashCharge: cd > 0 && sim.dashCharges < sim.mods.dashCharges ? 1 - sim.dashCd / cd : 1,
      shield: sim.shield,
      biome: BIOME_COPY[sim.biome].name,
      practice: sim.config.practice,
    }
    this.shell.hud(model)
  }

  private behind(): Sim {
    const menu = this.mode === 'workshop' || this.mode === 'challenges' || this.mode === 'map' || this.mode === 'settings'
    if (this.mode === 'title' || (menu && this.menuReturn === 'title')) return this.attract
    return this.sim ?? this.attract
  }

  private onPauseEdge() {
    if (this.mode === 'play' || this.mode === 'practice') {
      this.mode = 'pause'
      this.menuReturn = 'pause'
      this.shell.showPause()
      return
    }
    if (this.mode === 'pause') {
      this.resume()
      return
    }
    if (this.mode === 'results' || this.mode === 'workshop' || this.mode === 'challenges' || this.mode === 'map' || this.mode === 'settings') {
      if (this.mode === 'results') this.goTitle()
      else this.back()
    }
  }

  private onAction(action: string, el: HTMLElement) {
    this.audio.resume()
    switch (action) {
      case 'play':
        this.startRun(false)
        break
      case 'daily':
        this.startRun(true)
        break
      case 'practice':
        this.startPractice()
        break
      case 'again':
        this.startRun(this.daily)
        break
      case 'restart':
        if (this.sim?.config.practice) this.startPractice()
        else this.startRun(this.daily)
        break
      case 'resume':
        this.resume()
        break
      case 'title':
        this.endOrTitle()
        break
      case 'workshop':
        this.openMenu('workshop')
        break
      case 'challenges':
        this.openMenu('challenges')
        break
      case 'map':
        this.openMenu('map')
        break
      case 'settings':
        this.openMenu('settings')
        break
      case 'back':
        this.back()
        break
      case 'pick':
        this.pick(el.dataset.id ?? '')
        break
      case 'buy': {
        const kind = el.dataset.kind
        const ok =
          (kind === 'core' || kind === 'module' || kind === 'trail' || kind === 'slot' || kind === 'gravity') &&
          buy(this.meta, kind, el.dataset.id ?? '')
        if (ok) {
          saveMeta(this.meta)
          this.audio.blip()
        }
        this.shell.showWorkshop(this.meta)
        break
      }
      case 'equip-core':
        equipCore(this.meta, (el.dataset.id as Meta['equipped']['core']) ?? 'balanced')
        saveMeta(this.meta)
        this.shell.showWorkshop(this.meta)
        break
      case 'equip-module':
        toggleModule(this.meta, el.dataset.id as Meta['equipped']['modules'][number])
        saveMeta(this.meta)
        this.shell.showWorkshop(this.meta)
        break
      case 'equip-trail':
        equipTrail(this.meta, (el.dataset.id as Meta['equipped']['trail']) ?? 'dusk')
        saveMeta(this.meta)
        this.shell.showWorkshop(this.meta)
        break
      case 'setting':
        this.applySetting(el)
        break
      default:
        break
    }
  }

  private applySetting(el: HTMLElement) {
    const key = el.dataset.setting
    const s = this.meta.settings
    if (el instanceof HTMLInputElement && el.type === 'range') {
      const value = Number(el.value)
      if (key === 'music') s.music = value
      if (key === 'sfx') s.sfx = value
      if (key === 'shake') s.shake = value
      if (key === 'flash') s.flash = value
      if (key === 'uiScale') s.uiScale = value
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (key === 'reducedMotion') s.reducedMotion = el.checked
      if (key === 'colorblind') s.colorblind = el.checked
      if (key === 'haptics') s.haptics = el.checked
      if (key === 'ghost') s.ghost = el.checked
      if (key === 'telemetry') s.telemetry = el.checked
    } else if (el instanceof HTMLSelectElement) {
      if (key === 'touch') s.touch = el.value as Meta['settings']['touch']
      if (key === 'pointerMode') s.pointerMode = el.value as Meta['settings']['pointerMode']
      if (key === 'difficulty' && difficultyUnlocked(this.meta, el.value as Meta['lastDifficulty'])) this.meta.lastDifficulty = el.value as Meta['lastDifficulty']
      if (key === 'mutator' && mutatorsUnlocked(this.meta)) this.meta.lastMutator = el.value as Meta['lastMutator']
      if (key === 'mutator' && el.value === 'none') this.meta.lastMutator = 'none'
    }
    this.audio.setVolumes(s.music, s.sfx)
    saveMeta(this.meta)
    this.applyAppearance()
  }

  private startRun(daily: boolean) {
    if (!difficultyUnlocked(this.meta, this.meta.lastDifficulty)) this.meta.lastDifficulty = 'normal'
    if (this.meta.lastMutator !== 'none' && !mutatorsUnlocked(this.meta)) this.meta.lastMutator = 'none'
    this.daily = daily
    this.committed = false
    this.sim = this.makeRun(daily, false)
    this.mode = 'play'
    this.menuReturn = 'pause'
    this.acc = 0
    this.fx.clearAll()
    this.shell.hidePanel()
    this.shell.banner('')
    this.snap(this.sim)
    this.input.snapshot()
    track(this.meta, 'run_start', 0, daily ? 'daily' : this.meta.lastDifficulty)
    saveMeta(this.meta)
  }

  private startPractice() {
    this.daily = false
    this.committed = true
    this.sim = this.makeRun(false, false, true)
    this.mode = 'practice'
    this.menuReturn = 'pause'
    this.acc = 0
    this.fx.clearAll()
    this.shell.hidePanel()
    this.shell.banner('Practice', 'Falls return you to the yard.')
    this.bannerLife = 2.4
    this.snap(this.sim)
    this.input.snapshot()
  }

  private resume() {
    if (!this.sim) return
    this.mode = this.sim.config.practice ? 'practice' : 'play'
    this.shell.hidePanel()
    this.input.snapshot()
  }

  private presentChoice(sim: Sim) {
    if (sim.choice && sim.choice.cards.length === 0) sim.choice = null
    if (sim.choice) this.openChoice()
  }

  private openChoice() {
    if (!this.sim?.choice) return
    this.mode = 'choice'
    this.shell.showChoice(this.sim.choice)
  }

  private pick(id: string) {
    if (!this.sim?.choice || !id) return
    resolveChoice(this.sim, id)
    this.audio.blip()
    this.mode = 'play'
    this.shell.hidePanel()
    this.input.snapshot()
  }

  private openMenu(mode: 'workshop' | 'challenges' | 'map' | 'settings') {
    if (this.mode === 'results') this.menuReturn = 'results'
    else if (this.mode === 'pause' || this.mode === 'play' || this.mode === 'practice') this.menuReturn = 'pause'
    else if (this.mode === 'title') this.menuReturn = 'title'
    this.mode = mode
    if (mode === 'workshop') this.shell.showWorkshop(this.meta)
    if (mode === 'challenges') this.shell.showChallenges(this.meta)
    if (mode === 'map') this.shell.showMap(this.meta)
    if (mode === 'settings') this.shell.showSettings(this.meta)
  }

  private back() {
    if (this.menuReturn === 'pause' && this.sim && !this.sim.dead) {
      this.mode = 'pause'
      this.shell.showPause()
      return
    }
    if (this.menuReturn === 'results' && this.summary) {
      this.mode = 'results'
      this.shell.showResults(this.summary)
      return
    }
    this.goTitle()
  }

  private endOrTitle() {
    if ((this.mode === 'pause' || this.mode === 'play' || this.mode === 'practice') && this.sim && !this.committed && !this.sim.config.practice) {
      this.finish()
      return
    }
    this.goTitle()
  }

  private finish() {
    if (!this.sim || this.committed || this.sim.config.practice) {
      this.goTitle()
      return
    }
    this.committed = true
    const summary = commitRun(this.meta, this.sim, this.daily)
    if (!this.sim.dead) {
      summary.deathTitle = 'Left the road'
      summary.deathLine = 'The bounce is still there.'
    }
    saveMeta(this.meta)
    this.summary = summary
    this.mode = 'results'
    this.menuReturn = 'results'
    this.shell.banner('')
    this.shell.showResults(summary)
  }

  private goTitle() {
    this.mode = 'title'
    this.menuReturn = 'title'
    this.sim = null
    this.committed = false
    this.daily = false
    this.shell.banner('')
    this.shell.showTitle(this.meta)
    if (this.attract.dead) this.attract = this.makeRun(false, true)
  }

  private makeRun(daily: boolean, attract: boolean, practice = false): Sim {
    const meta = this.meta
    const seed = attract ? (randomSeed() || 1) : practice ? 7 : daily ? dailySeed() : (randomSeed() || 1)
    return createRun(
      defaultConfig({
        seed,
        difficulty: attract || practice ? 'normal' : meta.lastDifficulty,
        core: attract ? 'balanced' : meta.equipped.core,
        mutator: attract || practice ? 'none' : meta.lastMutator,
        practice,
        tutorial: !attract && !practice && !daily && !meta.tutorialDone && meta.runs === 0,
        gravityAbility: attract ? false : meta.gravity,
        modules: attract ? [] : [...meta.equipped.modules],
        trail: attract ? 'dusk' : meta.equipped.trail,
        seen: attract || practice ? [] : [...meta.seen],
        visited: attract || practice ? ['meadow'] : [...meta.visited],
        lifetimePerfects: meta.lifetime.perfects,
        lifetimeWalls: meta.lifetime.walls,
        fragments: meta.fragments.length,
        bestChain: meta.bestChain,
        bestDistance: meta.bestDistance,
        personalBest: attract ? 0 : meta.bestDistance,
      }),
    )
  }

  private snap(sim: Sim) {
    this.cam.x = sim.ball.x
    this.cam.y = sim.ball.y - 30
    this.cam.zoom = 1.4
    this.cam.anchor = (this.canvas.clientWidth || window.innerWidth) * 0.34
    this.cam.shakeX = 0
    this.cam.shakeY = 0
    this.cam.tilt = 0
    this.trauma = 0
    this.punch = 0
    this.lastPunch = 0
    this.deadFade = 0
    resetRenderState()
  }

  private applyAppearance() {
    document.documentElement.style.setProperty('--ui', String(this.meta.settings.uiScale))
    document.body.classList.toggle('reduced', this.meta.settings.reducedMotion)
    document.body.classList.toggle('cb', this.meta.settings.colorblind)
    this.input.mode = this.meta.settings.pointerMode
  }

  private applyTouch() {
    const s = this.meta.settings
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const on = s.touch === 'on' || (s.touch === 'auto' && coarse)
    this.shell.setTouch(on && (this.mode === 'play' || this.mode === 'practice'))
  }
}

function blankHud(): HudModel {
  return {
    visible: false,
    distance: 0,
    best: 0,
    score: 0,
    chain: 0,
    flowLeft: 0,
    hot: false,
    speed: '',
    state: '',
    critical: false,
    meter: 0,
    dashMax: 0,
    dashReady: 0,
    dashCharge: 0,
    shield: 0,
    biome: '',
    practice: false,
  }
}

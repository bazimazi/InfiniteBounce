import type { InputFrame } from '../sim/types'

export class Input {
  private keys = new Set<string>()
  private dashQueued = false
  private gravQueued = false
  private pauseQueued = false
  private pointer = { active: false, origin: 0, steer: 0 }
  private padLatch = { dash: false, grav: false }
  brakeTouch = false
  mode: 'drag' | 'zones' = 'drag'

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'Space' || e.code === 'KeyK') {
        this.dashQueued = true
        e.preventDefault()
      }
      if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.gravQueued = true
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQueued = true
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.pointer.active = false
      this.brakeTouch = false
    })
    window.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-touch]') || target?.closest('#ui')) return
      this.pointer.active = true
      this.pointer.origin = e.clientX
      this.pointer.steer = 0
    })
    window.addEventListener('pointermove', (e) => {
      if (!this.pointer.active || this.mode !== 'drag') return
      this.pointer.steer = Math.max(-1, Math.min(1, (e.clientX - this.pointer.origin) / 88))
    })
    const end = () => {
      this.pointer.active = false
      this.pointer.steer = 0
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  queueDash() {
    this.dashQueued = true
  }

  snapshot(): InputFrame {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft')
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight')
    let x = (right ? 1 : 0) - (left ? 1 : 0)
    if (this.pointer.active && this.mode === 'zones') {
      const ratio = this.pointer.origin / Math.max(1, window.innerWidth)
      if (ratio < 0.42) x = -1
      else if (ratio > 0.58) x = 1
    }
    if (this.pointer.active && this.mode === 'drag' && Math.abs(this.pointer.steer) > Math.abs(x)) x = this.pointer.steer
    const y = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? -1 : 0) + (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0)
    let brake = this.brakeTouch || this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.keys.has('KeyL')
    const dash = this.dashQueued
    const grav = this.gravQueued
    const pause = this.pauseQueued
    this.dashQueued = false
    this.gravQueued = false
    this.pauseQueued = false
    const pad = navigator.getGamepads?.()[0] ?? null
    if (pad) {
      const ax = pad.axes[0] ?? 0
      if (Math.abs(ax) > 0.18 && Math.abs(ax) > Math.abs(x)) x = Math.max(-1, Math.min(1, ax))
      if (pad.buttons[1]?.pressed || pad.buttons[6]?.pressed) brake = true
    }
    return {
      x,
      y: Math.max(-1, Math.min(1, y)),
      brake,
      dash: dash || this.gamepadDash(pad),
      grav: grav || this.gamepadEdge(pad, 2),
      pause,
    }
  }

  private gamepadDash(pad: Gamepad | null): boolean {
    if (!pad) return false
    const down = !!(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed)
    const edge = down && !this.padLatch.dash
    this.padLatch.dash = down
    return edge
  }

  private gamepadEdge(pad: Gamepad | null, index: number): boolean {
    if (!pad) return false
    const down = !!pad.buttons[index]?.pressed
    const edge = down && !this.padLatch.grav
    this.padLatch.grav = down
    return edge
  }
}

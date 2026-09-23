import { Game } from './game/Game'

const game = new Game()
game.start()

declare global {
  interface Window {
    __game?: Game
  }
}

window.__game = game

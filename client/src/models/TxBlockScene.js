import TxMondrianPoolScene from './TxMondrianPoolScene.js'
import { settings } from '../stores.js'
import { logTxSize, byteTxSize } from '../utils/misc.js'
import { orange } from '../utils/color.js'
import config from '../config.js'

let settingsValue
settings.subscribe(v => {
  settingsValue = v
})

export default class TxBlockScene extends TxMondrianPoolScene {
  constructor ({ width, height, unit = 4, padding = 1, blockId, controller, heightStore, colorMode }) {
    super({ width, height, unit, padding, controller, heightStore, colorMode })
    this.heightLimit = null
    this.expired = false
    this.laidOut = false
    this.blockId = blockId
    this.initialised = true
    this.inverted = true
    this.hidden = false
    this.opacity = 0.21
    this.building = false
    this.buildTimers = []
    this.sceneType = 'block'
  }

  resize ({ width = this.width, height = this.height }) {
    if (this.initialised) {
      let blockWeight = 0
      const ids = this.getTxList()
      for (let i = 0; i < ids.length; i++) {
        let squareSize = 0
        if (this.txs[ids[i]]) squareSize = this.txSize(this.txs[ids[i]])
        else if (this.hiddenTxs[ids[i]]) squareSize = this.txSize(this.hiddenTxs[ids[i]])
        blockWeight += (squareSize * squareSize)
      }

      this.width = width
      this.height = height
      this.blockWidth = Math.ceil(Math.sqrt(blockWeight))
      this.blockHeight = this.blockWidth

      this.paddedUnit
      this.gridSize = width / this.blockWidth
      this.unitPadding = this.gridSize / 4
      this.unitWidth = this.gridSize - (this.unitPadding * 2)

      this.scene.offset = {
        x: (window.innerWidth - this.width) / 2,
        y: 2 * (window.innerHeight - this.height) / ((window.innerWidth <= 640) ? 3.5 : 3)
      }
      this.scene.scroll = 0
    } else {
      this.width = width
      this.height = height
    }

    this.resetLayout()
  }

  // calculates and returns the size of the tx in multiples of the grid size
  txSize (tx={ value: 1, vbytes: 1 }) {
    if (settingsValue.vbytes) return byteTxSize(tx.vbytes, Math.Infinity)
    else return logTxSize(tx.value, Math.Infinity)
  }

  setTxOnScreen (tx, pixelPosition) {
    this.saveGridToPixelPosition(tx)
    if (!tx.view.initialised) {
      tx.view.update({
        display: {
          position: {
            x: Math.random() * window.innerWidth,
            y: -(Math.random() * window.innerWidth) - (this.scene.offset.y * 2) - pixelPosition.r,
            r: pixelPosition.r
          },
          color: tx.getColor('block', this.colorMode).color
        },
        delay: 0,
        state: 'ready'
      })
    }

    this.savePixelsToScreenPosition(tx, 0, (this.hidden && !this.exited) ? 50 : 0)
    if (this.hidden) {
      tx.view.update({
        display: {
          position: tx.screenPosition,
          color: {
            ...tx.getColor('block', this.colorMode).color,
            alpha: 0
          }
        },
        duration: 0,
        delay: 0,
        state: 'block'
      })
    } else {
      tx.view.update({
        display: {
          position: tx.screenPosition,
          color: {
            ...tx.getColor('block', this.colorMode).color,
            alpha: this.building ? 1 : this.opacity
          }
        },
        duration: this.laidOut ? 1000 : 2000,
        delay: 200,
        jitter: this.laidOut ? 500 : 1500,
        smooth: true,
        state: 'block'
      })
    }
  }

  prepareTxOnScreen (tx, now, replay=false) {
    const oldRadius = tx.pixelPosition.r
    this.saveGridToPixelPosition(tx)
    if (!tx.view.initialised) {
      tx.view.update({
        display: {
          position: {
            x: Math.random() * window.innerWidth,
            y: -(Math.random() * window.innerWidth) - (this.scene.offset.y * 2) - tx.pixelPosition.r,
            r: tx.pixelPosition.r
          },
          color: {
            ...tx.getColor('block', this.colorMode).color,
            alpha: 1
          }
        },
        delay: 0,
        state: 'ready'
      })
    } else {
      const replayPosition = replay ? this.replayStartPosition(tx) : null
      if (replay && replayPosition) {
        tx.view.update({
          display: {
            position: replayPosition,
            color: {
              ...ice(tx.colors[this.colorMode].block.color),
              alpha: 1
            }
          },
          start: now,
          delay: 0,
          duration: 750,
          smooth: true,
          state: 'ready'
        })
      }
      const jitter = (Math.random() * 1500)
      tx.view.update({
        display: {
          position: {
            r: oldRadius + Math.max(2, oldRadius * 0.2)
          },
        },
        delay: 200 + jitter,
        start: now,
        duration: 750,
        smooth: true,
        boomerang: true
      })
      tx.view.update({
        display: {
          color: ice(tx.colors[this.colorMode].block.color),
        },
        start: now,
        delay: 200 + jitter,
        duration: 500,
      })
    }
  }

  replayStartPosition (tx) {
    const radius = Math.max(1, tx.pixelPosition.r || tx.screenPosition.r || 1)
    const minY = radius + 24
    const maxY = Math.max(minY, Math.min(window.innerHeight * 0.32, this.scene.offset.y - radius - 24))

    return {
      x: radius + (Math.random() * Math.max(1, window.innerWidth - (radius * 2))),
      y: minY + (Math.random() * Math.max(1, maxY - minY)),
      r: radius
    }
  }

  prepareTx (tx, now, replay=false) {
    this.place(tx)
    this.prepareTxOnScreen(tx, now, replay)
  }

  setOpacity (opacity, duration=250) {
    this.opacity = opacity
    if (this.hidden || this.building) return

    const ids = this.getActiveTxList()
    for (let i = 0; i < ids.length; i++) {
      this.txs[ids[i]].view.update({
        display: {
          color: {
            alpha: opacity
          }
        },
        duration,
        delay: 0,
        state: 'block'
      })
    }
  }

  enterTx (tx, start, right) {
    tx.view.update({
      display: {
        position: {
          x: tx.screenPosition.x + (right ? window.innerWidth : -window.innerWidth) + ((Math.random()-0.5) * (window.innerHeight/4)),
          y: tx.screenPosition.y + ((Math.random()-0.5) * (window.innerHeight/4)),
          r: tx.pixelPosition.r
        },
        color: {
          ...tx.getColor('block', this.colorMode).color,
          alpha: 0
        }
      },
      delay: 0,
      state: 'ready'
    })
    tx.view.update({
      display: {
        position: tx.screenPosition,
        color: {
          ...tx.getColor('block', this.colorMode).color,
          alpha: this.opacity
        }
      },
      start,
      duration: 2000,
      delay: 200,
      jitter: 500,
      smooth: true,
    })
  }

  enter (right) {
    this.hidden = false
    this.exited = false
    const ids = this.getActiveTxList()
    const start = performance.now()
    for (let i = 0; i < ids.length; i++) {
      this.enterTx(this.txs[ids[i]], start, right)
    }
  }

  async enterAsync (right) {
    this.hidden = false
    this.exited = false
    const ids = this.getActiveTxList()
    const start = performance.now()
    for (let i = 0; i < ids.length; i++) {
      this.enterTx(this.txs[ids[i]], start, right)
      if (i > 0 && i % 1500 === 0) {
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
    }
  }

  enterRight () {
    this.enter(true)
  }

  enterLeft () {
    this.enter(false)
  }

  exitTx (tx, start, right) {
    tx.view.update({
      display: {
        position: {
          x: tx.screenPosition.x + (right ? window.innerWidth : -window.innerWidth) + ((Math.random()-0.5) * (window.innerHeight/4)),
          y: tx.screenPosition.y,
          r: tx.pixelPosition.r
        },
        color: {
          ...tx.getColor('block', this.colorMode).color,
          alpha: 0
        }
      },
      delay: 200,
      start,
      jitter: 500,
      duration: 2000,
      smooth: true,
    })
  }

  exit (right) {
    this.hidden = true
    this.exited = true
    const ids = this.getActiveTxList()
    const start = performance.now()
    for (let i = 0; i < ids.length; i++) {
      this.exitTx(this.txs[ids[i]], start, right)
    }
  }

  async exitAsync (right) {
    this.hidden = true
    this.exited = true
    const ids = this.getActiveTxList()
    const start = performance.now()
    for (let i = 0; i < ids.length; i++) {
      this.exitTx(this.txs[ids[i]], start, right)
      if (i > 0 && i % 1500 === 0) {
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
    }
  }

  exitRight () {
    this.exit(true)
  }

  exitLeft () {
    this.exit(false)
  }

  hideTx (tx, now) {
    this.savePixelsToScreenPosition(tx)
    tx.view.update({
      display: {
        position: {
          y: tx.screenPosition.y + 50
        },
        color: {
          alpha: 0
        }
      },
      start: now,
      duration: 1500,
      delay: 50,
      state: 'fadeout',
      smooth: true,
    })
  }

  showTx (tx, now) {
    this.savePixelsToScreenPosition(tx)
    tx.view.update({
      display: {
        position: {
          y: tx.screenPosition.y
        },
        color: {
          alpha: this.opacity
        }
      },
      start: now,
      duration: 1500,
      delay: 50,
      state: 'fadeout',
      smooth: true,
    })
  }

  prepareAll (replay=false) {
    const now = performance.now()
    this.resize({})
    this.scene.count = 0
    let ids = this.getHiddenTxList()
    for (let i = 0; i < ids.length; i++) {
      this.txs[ids[i]] = this.hiddenTxs[ids[i]]
      delete this.hiddenTxs[ids[i]]
    }
    ids = this.getActiveTxList()
    for (let i = 0; i < ids.length; i++) {
      this.prepareTx(this.txs[ids[i]], now, replay)
    }
  }

  layoutAll (args) {
    // if (!this.hidden) {
      super.layoutAll(args)
      this.laidOut = true
    // }
  }

  clearBuildTimers () {
    this.buildTimers.forEach(timer => clearTimeout(timer))
    this.buildTimers = []
  }

  setBuildTimer (callback, delay) {
    const timer = setTimeout(() => {
      this.buildTimers = this.buildTimers.filter(item => item !== timer)
      callback()
    }, delay)
    this.buildTimers.push(timer)
  }

  build (exited=false, replay=false) {
    this.clearBuildTimers()
    this.hidden = false
    this.laidOut = false
    this.building = true
    this.prepareAll(replay)
    this.setBuildTimer(() => {
      this.layoutAll()
      if (exited) this.exitRight()
      this.setBuildTimer(() => {
        this.building = false
        this.setOpacity(this.opacity, 1200)
      }, 3900)
    }, 3000)
  }

  initialLayout (exited) {
    this.build(exited, false)
  }

  replayBuild () {
    this.build(false, true)
  }

  resetScroll () {
    return
  }

  hide () {
    this.hidden = true
    const now = performance.now()
    const ids = this.getActiveTxList()
    for (let i = 0; i < ids.length; i++) {
      this.hideTx(this.txs[ids[i]], now)
    }
  }

  show () {
    if (this.hidden) {
      this.hidden = false
      const now = performance.now()
      const ids = this.getActiveTxList()
      for (let i = 0; i < ids.length; i++) {
        this.showTx(this.txs[ids[i]], now)
      }
    }
  }

  expire (delay=3000) {
    this.clearBuildTimers()
    this.expired = true
    const txIds = this.getTxList()
    for (let i = 0; i < txIds.length; i++) {
      if (this.txs[txIds[i]]) {
        this.controller.deleteTx(txIds[i])
      }
    }
    setTimeout(() => {
      for (let i = 0; i < txIds.length; i++) {
        if (this.txs[txIds[i]]) {
          this.txs[txIds[i]].destroy()
        }
      }
      this.layout.destroy()
    }, delay)
  }

  selectAt (position) {
    if (this.layout) {
      const gridPosition = this.screenToGrid({ x: position.x + (this.gridSize/4), y: position.y - (this.gridSize/2) })
      return this.layout.getTxInGridCell(gridPosition)
    } else return null
  }
}

function ice (color) {
  return {
    h: Math.abs(color.h - 0.58) < 0.1 ? (color.h < 0.58 ? 0.48 : 0.68) : color.h,
    l: color.h < 0.76 ? 1 : 0.7
  }
}
